const express = require("express");
const querystring = require("querystring");
const duo_api = require("@duosecurity/duo_api");
const logger = require("firebase-functions/logger");
const { duoSignatureMiddleware } = require("./duo_signature");
const { DUO_HOST, ADMIN_IKEY, ADMIN_SKEY } = require("./config");
const { extractParams } = require("./helpers");

// ── Helpers ──────────────────────────────────────────────────────────────────

let reqCounter = 0;
function nextReqId() {
  return `admin-req-${++reqCounter}`;
}

// ── Duo proxy handler ────────────────────────────────────────────────────────

function duoProxyHandler(client) {
  return (req, res) => {
    const reqId = nextReqId();
    const method = req.method.toUpperCase();
    const duoPath = `/admin${req.path}`;
    const params = extractParams(req);

    logger.info("Incoming admin request", {
      reqId,
      method,
      url: req.originalUrl,
      headers: req.headers,
      duoPath,
      params,
    });

    client.jsonApiCall(method, duoPath, params, (duoResponse) => {
      logger.info("Duo admin response", {
        reqId,
        duoPath,
        response: duoResponse,
      });

      const statusCode = duoResponse.stat === "OK" ? 200 : 400;
      res.status(statusCode).json(duoResponse);
    });
  };
}

// ── Express app ──────────────────────────────────────────────────────────────

const adminApp = express();
adminApp.use(
  duoSignatureMiddleware(
    () => ADMIN_IKEY.value(),
    () => ADMIN_SKEY.value(),
    extractParams,
    "admin"
  )
);
adminApp.all("*", (req, res) => {
  const client = new duo_api.Client(
    ADMIN_IKEY.value(),
    ADMIN_SKEY.value(),
    DUO_HOST.value()
  );
  duoProxyHandler(client)(req, res);
});

module.exports = { adminApp };
