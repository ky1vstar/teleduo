// ── Duo-compatible user response formatting ──────────────────────────────────

import { LOCAL_EMAIL_DOMAIN } from "../../_shared/helpers.ts";

// deno-lint-ignore no-explicit-any
type DbUser = Record<string, any>;
// deno-lint-ignore no-explicit-any
type DbDevice = Record<string, any>;

/** Format an ISO timestamp to the Duo-style local datetime (no timezone). */
function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 19); // "2026-02-20T22:16:10"
}

/** Map a DB device row to a Duo phone response object. */
function formatPhone(d: DbDevice) {
  const activated = d.telegram_chat_id != null;
  return {
    activated,
    app_version: "",
    capabilities: activated ? ["auto", "push"] : [],
    creation_date: "",
    encrypted: "",
    extension: "",
    fingerprint: "",
    last_activated_date: "",
    last_seen: activated ? formatDateTime(d.last_used_at) : "",
    model: "Unknown",
    name: d.name ?? "",
    number: "",
    os_version: "",
    phone_id: d.id,
    platform: "Unknown",
    screenlock: "",
    sms_passcodes_sent: false,
    tampered: "",
    type: "Unknown",
  };
}

/**
 * Format a DB user + its devices into a Duo Admin API user response object.
 *
 * @param user       Row from public.users
 * @param devices    Rows from public.devices belonging to this user
 * @param lastLogin  Unix timestamp of last successful auth, or null
 */
export function formatUser(
  user: DbUser,
  devices: DbDevice[],
  lastLogin: number | null,
) {
  const userDevices = devices.filter((d) => d.user_id === user.id);
  const isEnrolled = userDevices.some((d) => d.telegram_chat_id != null);
  const created = Math.floor(new Date(user.created_at).getTime() / 1000);

  // Hide internal local email domain
  const email = user.email?.endsWith(LOCAL_EMAIL_DOMAIN) ? "" : (user.email ?? "");

  return {
    alias1: null,
    alias2: null,
    alias3: null,
    alias4: null,
    aliases: {},
    created,
    custom_attributes: {},
    date_of_birth: null,
    desktop_authenticators: [],
    desktoptokens: [],
    email,
    enable_auto_prompt: true,
    entra_federated_user_id: null,
    firstname: "",
    groups: [],
    is_enrolled: isEnrolled,
    last_directory_sync: null,
    last_login: lastLogin,
    lastname: "",
    lockout_reason: null,
    notes: "",
    phones: userDevices.map(formatPhone),
    realname: "",
    status: user.status,
    tokens: [],
    u2ftokens: [],
    user_id: user.id,
    username: user.username ?? "",
    webauthncredentials: [],
  };
}
