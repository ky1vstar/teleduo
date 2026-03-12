// ── Environment-based configuration ──────────────────────────────────────────
// Getters ensure env vars are read at access time, not at import time.
// This is critical for tests that set env vars in beforeEach.

export const config = {
  get AUTH_IKEY() { return Deno.env.get("AUTH_IKEY") ?? ""; },
  get AUTH_SKEY() { return Deno.env.get("AUTH_SKEY") ?? ""; },

  get ADMIN_IKEY() { return Deno.env.get("ADMIN_IKEY") ?? ""; },
  get ADMIN_SKEY() { return Deno.env.get("ADMIN_SKEY") ?? ""; },

  get TELEGRAM_BOT_TOKEN() { return Deno.env.get("TELEGRAM_BOT_TOKEN") ?? ""; },
  get TELEGRAM_WEBHOOK_SECRET() { return Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? ""; },
  get TELEGRAM_ENVIRONMENT(): "prod" | "test" { return (Deno.env.get("TELEGRAM_ENVIRONMENT") as "prod" | "test") ?? "prod"; },

  get ENROLL_ALLOW_EXISTING() { return Deno.env.get("ENROLL_ALLOW_EXISTING") === "true"; },
};
