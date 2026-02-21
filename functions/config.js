const { defineString, defineBoolean } = require("firebase-functions/params");

// --- Auth API (standalone) ---
const AUTH_IKEY = defineString("AUTH_IKEY");
const AUTH_SKEY = defineString("AUTH_SKEY");

// --- Telegram ---
const TELEGRAM_BOT_TOKEN = defineString("TELEGRAM_BOT_TOKEN");
// BOT_USERNAME is determined automatically via getMe

// --- Enrollment ---
const ENROLL_ALLOW_EXISTING = defineBoolean("ENROLL_ALLOW_EXISTING", {
  default: false,
  description: "If true, repeated /enroll for existing user does not return 400",
});

// --- Logo ---
const LOGO_URL = defineString("LOGO_URL", {
  default: "",
  description: "Optional URL for /auth/v2/logo (proxied as image/png)",
});

// --- Admin API (proxy, unchanged) ---
const DUO_HOST = defineString("DUO_HOST");
const ADMIN_IKEY = defineString("ADMIN_IKEY");
const ADMIN_SKEY = defineString("ADMIN_SKEY");

module.exports = {
  AUTH_IKEY,
  AUTH_SKEY,
  TELEGRAM_BOT_TOKEN,
  ENROLL_ALLOW_EXISTING,
  LOGO_URL,
  DUO_HOST,
  ADMIN_IKEY,
  ADMIN_SKEY,
};
