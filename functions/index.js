const { onRequest } = require("firebase-functions/v2/https");
const { defineString } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const express = require("express");
const querystring = require("querystring");
const duo_api = require("@duosecurity/duo_api");
const { duoSignatureMiddleware } = require("./duo_signature");

// ── Firebase Parameterized configuration ─────────────────────────────────────

const DUO_HOST = defineString("DUO_HOST");
const AUTH_IKEY = defineString("AUTH_IKEY");
const AUTH_SKEY = defineString("AUTH_SKEY");
const ADMIN_IKEY = defineString("ADMIN_IKEY");
const ADMIN_SKEY = defineString("ADMIN_SKEY");

// ── Helpers ──────────────────────────────────────────────────────────────────

// Generate a short unique id for correlating request / response logs
let reqCounter = 0;
function nextReqId() {
  return `req-${++reqCounter}`;
}

// Parse multipart/form-data body into a plain key-value object.
// Handles only simple text fields (no file uploads), which is sufficient
// for Duo API params.
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

// Extract params from Express request depending on content type
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
        // Express may provide rawBody as a Buffer
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

    // application/x-www-form-urlencoded – Express parses it into req.body
    if (typeof req.body === "string") {
      return querystring.parse(req.body);
    }
    return req.body || {};
  }

  // GET / DELETE – params from query string
  return req.query || {};
}

// ── Duo proxy handler (shared by both /auth and /admin routes) ───────────────

function duoProxyHandler(client, routePrefix) {
  return (req, res) => {
    const reqId = nextReqId();
    const method = req.method.toUpperCase();
    // req.path is relative to the mount point, e.g. /v2/enroll
    // Reconstruct the full Duo API path: /<prefix>/v2/enroll
    const duoPath = `/${routePrefix}${req.path}`;
    const params = extractParams(req);

    logger.info("Incoming request", {
      reqId,
      method,
      url: req.originalUrl,
      headers: req.headers,
      duoPath,
      params,
    });

    client.jsonApiCall(method, duoPath, params, (duoResponse) => {
      logger.info("Duo response", {
        reqId,
        duoPath,
        response: duoResponse,
      });

      const statusCode = duoResponse.stat === "OK" ? 200 : 400;
      res.status(statusCode).json(duoResponse);
    });
  };
}

// ── Express apps ─────────────────────────────────────────────────────────────

// Auth API app
const authApp = express();
authApp.use(duoSignatureMiddleware(() => AUTH_IKEY.value(), () => AUTH_SKEY.value(), extractParams, "auth"));
authApp.all("*", (req, res) => {
  const client = new duo_api.Client(AUTH_IKEY.value(), AUTH_SKEY.value(), DUO_HOST.value());
  duoProxyHandler(client, "auth")(req, res);
});

// Admin API app
const adminApp = express();
adminApp.use(duoSignatureMiddleware(() => ADMIN_IKEY.value(), () => ADMIN_SKEY.value(), extractParams, "admin"));
adminApp.all("*", (req, res) => {
  const client = new duo_api.Client(ADMIN_IKEY.value(), ADMIN_SKEY.value(), DUO_HOST.value());
  duoProxyHandler(client, "admin")(req, res);
});

// ── Cloud Functions (2nd gen) ────────────────────────────────────────────────

exports.auth = onRequest(authApp);
exports.admin = onRequest(adminApp);
