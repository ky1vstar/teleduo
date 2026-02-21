const { onRequest } = require("firebase-functions/v2/https");
const functions = require("firebase-functions/v1");
const logger = require("firebase-functions/logger");
const express = require("express");
const { duoSignatureMiddleware } = require("./duo_signature");
const { AUTH_IKEY, AUTH_SKEY } = require("./config");
const { extractParams } = require("./helpers");

// ── Auth endpoint handlers ───────────────────────────────────────────────────

const { handlePing } = require("./auth/ping");
const { handleCheck } = require("./auth/check");
const { handleEnroll } = require("./auth/enroll");
const { handleEnrollStatus } = require("./auth/enrollStatus");
const { handlePreauth } = require("./auth/preauth");
const { handleAuth } = require("./auth/auth");
const { handleAuthStatus } = require("./auth/authStatus");
const { handleLogo } = require("./auth/logo");

// ── QR endpoint ──────────────────────────────────────────────────────────────

const { handleQr } = require("./frame/qr");
const { handlePortalEnroll } = require("./frame/portalEnroll");

// ── Admin API (proxy to Duo, unchanged logic) ────────────────────────────────

const { adminApp } = require("./admin");

// ── Telegram webhook ─────────────────────────────────────────────────────────

const { createTelegramWebhookApp } = require("./telegram/webhook");

// ── Triggers ─────────────────────────────────────────────────────────────────

const { onUserDeleted: onUserDeletedHandler } = require("./triggers/onUserDeleted");
const { lazyCleanup } = require("./triggers/cleanupExpired");

// ── Auth API Express app (standalone Duo-compatible) ─────────────────────────

const authApp = express();

// /auth/v2/ping — no signature verification
authApp.get("/v2/ping", handlePing);

// Lazy cleanup of expired documents (fire-and-forget, throttled)
authApp.use((req, res, next) => { lazyCleanup(); next(); });

// All other /auth/v2/* endpoints require HMAC signature verification
authApp.use(
  duoSignatureMiddleware(
    () => AUTH_IKEY.value(),
    () => AUTH_SKEY.value(),
    extractParams,
    "auth"
  )
);

authApp.get("/v2/check", handleCheck);
authApp.post("/v2/enroll", handleEnroll);
authApp.post("/v2/enroll_status", handleEnrollStatus);
authApp.post("/v2/preauth", handlePreauth);
authApp.post("/v2/auth", handleAuth);
authApp.get("/v2/auth_status", handleAuthStatus);
authApp.get("/v2/logo", handleLogo);

// ── Frame app (QR code generation, no auth) ──────────────────────────────────

const frameApp = express();
frameApp.get("/qr", handleQr);
frameApp.get("/portal/v4/enroll", handlePortalEnroll);

// ── Cloud Functions (2nd gen) ────────────────────────────────────────────────

exports.auth = onRequest(authApp);
exports.admin = onRequest(adminApp);
exports.frame = onRequest(frameApp);
exports.telegramWebhook = onRequest(createTelegramWebhookApp());
exports.onUserDeleted = functions.auth.user().onDelete(onUserDeletedHandler);
