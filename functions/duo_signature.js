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

  const date = req.headers["x-duo-date"] || req.headers["date"] || "";
  const method = req.method.toUpperCase();
  const host = (req.headers["host"] || "").toLowerCase();
  const duoPath = `/${routePrefix}${req.path}`;
  const ct = (req.headers["content-type"] || "").toLowerCase();
  const isV5 = ct.includes("application/json");

  let expectedSig;

  if (isV5) {
    const isBodyMethod = ["POST", "PUT", "PATCH"].includes(method);
    const rawBody = getRawBody(req);
    const params = isBodyMethod ? {} : (req.query || {});
    const body = isBodyMethod ? rawBody : "";
    const canon = canonicalizeV5(method, host, duoPath, params, date, body);
    expectedSig = hmacSign(skey, canon, "sha512");
  } else {
    const params = extractParams(req);
    const canon = canonicalize(method, host, duoPath, params, date);

    if (providedSig.length === 128) {
      expectedSig = hmacSign(skey, canon, "sha512");
    } else if (providedSig.length === 40) {
      expectedSig = hmacSign(skey, canon, "sha1");
    } else {
      expectedSig = hmacSign(skey, canon, "sha512");
    }
  }

  if (!signaturesMatch(providedSig, expectedSig)) {
    logger.warn("Signature mismatch debug", {
      method,
      host,
      duoPath,
      date,
      isV5,
      paramsKeys: Object.keys(extractParams(req)),
      providedSigLen: providedSig.length,
    });
    return { ok: false, code: 40103, reason: "Invalid signature in request credentials" };
  }

  return { ok: true };
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
