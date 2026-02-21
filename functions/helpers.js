const crypto = require("crypto");
const querystring = require("querystring");

// ── Device ID generation ─────────────────────────────────────────────────────

/**
 * Generate a device ID in Duo format: DP + 18 uppercase alphanumeric characters.
 */
function generateDeviceId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = crypto.randomBytes(18);
  let id = "DP";
  for (let i = 0; i < 18; i++) {
    id += chars[bytes[i] % chars.length];
  }
  return id;
}

// ── Activation code generation ───────────────────────────────────────────────

/**
 * Generate a cryptographically random activation code (base64url-safe, 20+ chars).
 */
function generateActivationCode() {
  return crypto.randomBytes(24).toString("base64url");
}

// ── Transaction ID generation ────────────────────────────────────────────────

/**
 * Generate a UUID v4 for transaction IDs.
 */
function generateTxId() {
  return crypto.randomUUID();
}

// ── Email resolution ─────────────────────────────────────────────────────────

/**
 * Resolve a username to an email address.
 * If username contains '@' and looks like an email, return as-is.
 * Otherwise, return <username>@teleduo.local.
 */
function resolveEmail(username) {
  if (username.includes("@")) {
    return username;
  }
  return `${username}@teleduo.local`;
}

/**
 * Extract username from email. Reverses resolveEmail().
 */
function extractUsername(email) {
  if (email.endsWith("@teleduo.local")) {
    return email.replace("@teleduo.local", "");
  }
  return email;
}

// ── Random username generation ───────────────────────────────────────────────

function generateRandomUsername() {
  return "user_" + crypto.randomBytes(8).toString("hex");
}

// ── Multipart parser ─────────────────────────────────────────────────────────

/**
 * Parse multipart/form-data body into a plain key-value object.
 * Handles only simple text fields (no file uploads).
 */
function parseMultipart(rawBody, boundary) {
  const params = {};
  const parts = rawBody.split(`--${boundary}`);
  for (const part of parts) {
    if (!part || part.trim() === "--" || part.trim() === "") continue;

    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;

    const headerSection = part.substring(0, headerEnd);
    const value = part.substring(headerEnd + 4).replace(/\r\n$/, "");

    const nameMatch = headerSection.match(/name="([^"]+)"/);
    if (nameMatch) {
      params[nameMatch[1]] = value;
    }
  }
  return params;
}

// ── Extract params from Express request ──────────────────────────────────────

/**
 * Extract params from Express request depending on content type.
 */
function extractParams(req) {
  const method = req.method.toUpperCase();

  if (["POST", "PUT", "PATCH"].includes(method)) {
    const ct = (req.headers["content-type"] || "").toLowerCase();

    if (ct.includes("application/json")) {
      return req.body || {};
    }

    if (ct.includes("multipart/form-data")) {
      const boundaryMatch = (req.headers["content-type"] || "").match(
        /boundary=(.+)/i
      );
      if (boundaryMatch) {
        const raw =
          typeof req.rawBody === "string"
            ? req.rawBody
            : req.rawBody
              ? req.rawBody.toString()
              : "";
        return parseMultipart(raw, boundaryMatch[1]);
      }
      return {};
    }

    // application/x-www-form-urlencoded
    let bodyParams;
    if (typeof req.body === "string") {
      bodyParams = querystring.parse(req.body);
    } else {
      bodyParams = req.body || {};
    }

    // If POST body is empty, fall back to query string params.
    // This handles clients (e.g. Duo Postman collection) that send
    // POST parameters in the URL query string instead of the body.
    if (Object.keys(bodyParams).length === 0 && req.query && Object.keys(req.query).length > 0) {
      return req.query;
    }
    return bodyParams;
  }

  // GET / DELETE – params from query string
  return req.query || {};
}

// ── Duo error response helper ────────────────────────────────────────────────

/**
 * Send a Duo-formatted error response.
 * @param {object} res - Express response
 * @param {number} code - Duo error code (e.g. 40001, 40002, 40301, 40401)
 * @param {string} message - Short error description
 * @param {string} [messageDetail] - Optional detail
 */
function duoError(res, code, message, messageDetail) {
  const httpStatus = Math.floor(code / 100);
  const body = { stat: "FAIL", code, message };
  if (messageDetail !== undefined) {
    body.message_detail = messageDetail;
  }
  res.status(httpStatus).json(body);
}

/**
 * Send a Duo-formatted success response.
 */
function duoSuccess(res, response) {
  res.status(200).json({ stat: "OK", response });
}

module.exports = {
  generateDeviceId,
  generateActivationCode,
  generateTxId,
  generateRandomUsername,
  resolveEmail,
  extractUsername,
  extractParams,
  parseMultipart,
  duoError,
  duoSuccess,
};
