// ── Environment-based configuration ──────────────────────────────────────────

export const AUTH_IKEY = Deno.env.get("AUTH_IKEY") ?? "";
export const AUTH_SKEY = Deno.env.get("AUTH_SKEY") ?? "";

export const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";

export const ENROLL_ALLOW_EXISTING =
  Deno.env.get("ENROLL_ALLOW_EXISTING") === "true";

export const LOGO_URL = Deno.env.get("LOGO_URL") ?? "";

export const DUO_HOST = Deno.env.get("DUO_HOST") ?? "";
export const ADMIN_IKEY = Deno.env.get("ADMIN_IKEY") ?? "";
export const ADMIN_SKEY = Deno.env.get("ADMIN_SKEY") ?? "";
