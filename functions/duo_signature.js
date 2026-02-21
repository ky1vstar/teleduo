const crypto = require("crypto");
const logger = require("firebase-functions/logger");

// ── Duo signature helpers (ported from @duosecurity/duo_api) ─────────────────

// Compare two strings by character unicode values.
// A string that is a prefix of another sorts before it: 'foo' < 'foo_bar'
function compare(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const ac = a.charCodeAt(i);
    const bc = b.charCodeAt(i);
    if (ac < bc) return -1;
    if (ac > bc) return 1;
  }
  if (a.length < b.length) return -1;
  if (a.length > b.length) return 1;
  return 0;
}

// Build a URL-encoded, lexicographically-sorted params string
// that matches Duo's canonicalization rules.
function canonParams(params) {
  const ks = Object.keys(params).sort(compare);
  let qs = ks
    .map((k) => {
      const keq = encodeURIComponent(k) + "=";
      if (Array.isArray(params[k])) {
        return params[k].map((v) => keq + encodeURIComponent(v)).join("&");
      }
      return keq + encodeURIComponent(params[k]);
    })
    .join("&");

  // encodeURIComponent doesn't escape all characters Duo requires
  return qs
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

// V2 canonical string (5 lines)
function canonicalize(method, host, path, params, date) {
  return [date, method.toUpperCase(), host.toLowerCase(), path, canonParams(params)].join("\n");
}

// V5 canonical string (7 lines, includes body + header hashes)
function canonicalizeV5(method, host, path, params, date, body) {
  return [
    date,
    method.toUpperCase(),
    host.toLowerCase(),
    path,
    canonParams(params),
    hashString(body),
    hashString(""), // additional headers not needed at this time
  ].join("\n");
}

function hashString(s) {
  return crypto.createHash("sha512").update(s).digest("hex");
}

// Compute HMAC hex digest using the given algorithm
function hmacSign(skey, canon, algorithm) {
  return crypto.createHmac(algorithm, skey).update(canon).digest("hex");
}

// Timing-safe comparison of two hex signature strings (case-insensitive)
function signaturesMatch(a, b) {
  const bufA = Buffer.from(a.toLowerCase(), "utf8");
  const bufB = Buffer.from(b.toLowerCase(), "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Get the raw request body as a UTF-8 string.
// Firebase Cloud Functions populates req.rawBody as a Buffer.
function getRawBody(req) {
  if (req.rawBody) {
    return typeof req.rawBody === "string"
      ? req.rawBody
      : req.rawBody.toString("utf8");
  }
  return "";
}

// ── Signature verification ───────────────────────────────────────────────────

// Lazily yield candidate HMAC signatures for the incoming request.
// Duo clients may use sig_version 2 or 5 with sha1 or sha512 in any
// combination, and Content-Type is NOT a reliable indicator of which version
// was used (e.g. sig_version=5 GET requests omit Content-Type: application/json).
// We try the two standard pairings first (v5+sha512, v2+sha1), then the two
// non-standard ones (v2+sha512, v5+sha1). Canonical strings are computed
// lazily so we only pay for what we actually need.
function* candidateSignatures(req, skey, extractParams, routePrefix) {
  const date = req.headers["x-duo-date"] || req.headers["date"] || "";
  const method = req.method.toUpperCase();
  const host = (req.headers["host"] || "").toLowerCase();
  const duoPath = `/${routePrefix}${req.path}`;
  const isBodyMethod = ["POST", "PUT", "PATCH"].includes(method);
  const rawBody = getRawBody(req);

  // v2 params: extracted from body / query string
  // v5 params: body methods → params empty (body goes into hash); else query
  let v2Canon, v5Canon;
  const getV2Canon = () => (v2Canon ??= canonicalize(
    method, host, duoPath, extractParams(req), date));
  const getV5Canon = () => (v5Canon ??= canonicalizeV5(
    method, host, duoPath,
    isBodyMethod ? {} : (req.query || {}), date,
    isBodyMethod ? rawBody : ""));

  // Standard pairings first
  yield hmacSign(skey, getV5Canon(), "sha512"); // v5 + sha512
  yield hmacSign(skey, getV2Canon(), "sha1");   // v2 + sha1

  // Non-standard but supported
  yield hmacSign(skey, getV2Canon(), "sha512"); // v2 + sha512
  yield hmacSign(skey, getV5Canon(), "sha1");   // v5 + sha1
}

// Verify the incoming request's Authorization header against the expected
// ikey/skey pair. Returns { ok: true } or { ok: false, reason: "..." }.
function verifySignature(req, ikey, skey, extractParams, routePrefix) {
  const authHeader = req.headers["authorization"] || "";
  if (!authHeader.startsWith("Basic ")) {
    return { ok: false, reason: "Missing or malformed Authorization header" };
  }

  const decoded = Buffer.from(authHeader.slice(6), "base64").toString();
  const colonIdx = decoded.indexOf(":");
  if (colonIdx === -1) {
    return { ok: false, reason: "Invalid Basic auth format" };
  }

  const providedIkey = decoded.substring(0, colonIdx);
  const providedSig = decoded.substring(colonIdx + 1);

  if (providedIkey !== ikey) {
    return { ok: false, code: 40102, reason: "Invalid integration key in request credentials" };
  }

  for (const sig of candidateSignatures(req, skey, extractParams, routePrefix)) {
    if (signaturesMatch(providedSig, sig)) {
      return { ok: true };
    }
  }

  const method = req.method.toUpperCase();
  const host = (req.headers["host"] || "").toLowerCase();
  const duoPath = `/${routePrefix}${req.path}`;
  const date = req.headers["x-duo-date"] || req.headers["date"] || "";

  logger.warn("Signature mismatch debug", {
    method,
    host,
    duoPath,
    date,
    paramsKeys: Object.keys(extractParams(req)),
    providedSigLen: providedSig.length,
  });
  return { ok: false, code: 40103, reason: "Invalid signature in request credentials" };
}

// ── Express middleware factory ────────────────────────────────────────────────

// Returns an Express middleware that verifies the Duo signature.
// ikeyGetter/skeyGetter are functions that return the current ikey/skey values
// (needed because Firebase parameterized config is resolved at runtime).
// extractParams is passed in from the caller so this module stays decoupled
// from the body-parsing logic in index.js.
function duoSignatureMiddleware(ikeyGetter, skeyGetter, extractParams, routePrefix) {
  return (req, res, next) => {
    const ikey = ikeyGetter();
    const skey = skeyGetter();
    const result = verifySignature(req, ikey, skey, extractParams, routePrefix);
    if (!result.ok) {
      logger.warn("Signature verification failed", {
        routePrefix,
        reason: result.reason,
      });
      const body = { stat: "FAIL", message: result.reason };
      if (result.code) body.code = result.code;
      res.status(401).json(body);
      return;
    }
    next();
  };
}

module.exports = { duoSignatureMiddleware };
