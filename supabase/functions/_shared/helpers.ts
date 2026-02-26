import crypto from "node:crypto";
import type { Request, Response } from "express";

// ── Device ID generation ─────────────────────────────────────────────────────

/** Generate a device ID in Duo format: DP + 18 uppercase alphanumeric characters. */
export function generateDeviceId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = crypto.randomBytes(18);
  let id = "DP";
  for (let i = 0; i < 18; i++) {
    id += chars[bytes[i] % chars.length];
  }
  return id;
}

// ── Activation code generation ───────────────────────────────────────────────

/** Generate a cryptographically random activation code (base64url-safe, 20+ chars). */
export function generateActivationCode(): string {
  return crypto.randomBytes(24).toString("base64url");
}

// ── Transaction ID generation ────────────────────────────────────────────────

/** Generate a UUID v4 for transaction IDs. */
export function generateTxId(): string {
  return crypto.randomUUID();
}

// ── Email resolution ─────────────────────────────────────────────────────────

export function resolveEmail(username: string): string {
  if (username.includes("@")) return username;
  return `${username}@teleduo.local`;
}

export function extractUsername(email: string): string {
  if (email.endsWith("@teleduo.local")) {
    return email.replace("@teleduo.local", "");
  }
  return email;
}

// ── Random username generation ───────────────────────────────────────────────

export function generateRandomUsername(): string {
  return "user_" + crypto.randomBytes(8).toString("hex");
}

// ── Multipart parser ─────────────────────────────────────────────────────────

export function parseMultipart(
  rawBody: string,
  boundary: string,
): Record<string, string> {
  const params: Record<string, string> = {};
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

export function extractParams(req: Request): Record<string, string> {
  const method: string = req.method.toUpperCase();

  if (["POST", "PUT", "PATCH"].includes(method)) {
    const ct: string = (req.headers["content-type"] || "").toLowerCase();

    if (ct.includes("application/json")) {
      return req.body || {};
    }

    if (ct.includes("multipart/form-data")) {
      const boundaryMatch = (req.headers["content-type"] || "").match(
        /boundary=(.+)/i,
      );
      if (boundaryMatch) {
        const raw = getRawBody(req);
        return parseMultipart(raw, boundaryMatch[1]);
      }
      return {};
    }

    // application/x-www-form-urlencoded
    let bodyParams: Record<string, string>;
    if (typeof req.body === "string") {
      bodyParams = Object.fromEntries(new URLSearchParams(req.body));
    } else {
      bodyParams = req.body || {};
    }

    // If POST body is empty, fall back to query string params.
    if (
      Object.keys(bodyParams).length === 0 &&
      req.query &&
      Object.keys(req.query).length > 0
    ) {
      return req.query as Record<string, string>;
    }
    return bodyParams;
  }

  // GET / DELETE – params from query string
  return (req.query || {}) as Record<string, string>;
}

/** Get the raw body as a UTF-8 string (set by our body-parser middleware). */
export function getRawBody(req: Request): string {
  const rawBody = (req as Request & { rawBody?: string | Uint8Array }).rawBody;
  if (rawBody) {
    if (typeof rawBody === "string") return rawBody;
    if (rawBody instanceof Uint8Array) {
      return new TextDecoder().decode(rawBody);
    }
    return String(rawBody);
  }
  return "";
}

// ── Host / URL resolution ────────────────────────────────────────────────────

const DEFAULT_PORTS: Record<string, string> = { http: "80", https: "443" };

/**
 * Derive the public-facing functions hostname from SUPABASE_URL.
 * e.g. https://abc.supabase.co → abc.functions.supabase.co
 */
function deriveFunctionsHost(): string | null {
  const raw = Deno.env.get("SUPABASE_URL");
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const m = url.hostname.match(/^([^.]+)\.supabase\.co$/);
    if (m) return `${m[1]}.functions.supabase.co`;
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve the canonical host for Duo HMAC signature verification.
 * Must match the host the client used when computing the signature.
 *
 * Production:  derived from SUPABASE_URL             →  <ref>.functions.supabase.co
 * Local dev:   x-forwarded-host + x-forwarded-port   →  127.0.0.1:54321
 * Fallback:    raw Host header
 *
 * Note: on Supabase production x-forwarded-host is the internal
 * edge-runtime.supabase.com, so SUPABASE_URL takes precedence.
 */
export function resolveSignatureHost(req: Request): string {
  const functionsHost = deriveFunctionsHost();
  if (functionsHost) return functionsHost.toLowerCase();

  const fwdHost: string | undefined = req.headers["x-forwarded-host"];
  if (fwdHost) {
    const proto = (
      req.headers["x-forwarded-proto"] || "http"
    ).split(",")[0].trim().toLowerCase();
    const fwdPort: string | undefined = req.headers["x-forwarded-port"];
    const host = fwdHost.toLowerCase();
    if (fwdPort && fwdPort !== DEFAULT_PORTS[proto]) {
      return `${host}:${fwdPort}`;
    }
    return host;
  }

  return (req.headers["host"] || "").toLowerCase();
}

/**
 * Resolve the public-facing base URL for Supabase Edge Functions.
 * Returns a URL with trailing slash, suitable for appending function paths.
 *
 * Production:  https://<ref>.functions.supabase.co/
 * Local dev:   http://127.0.0.1:54321/functions/v1/
 *
 * SUPABASE_URL-based derivation takes priority over x-forwarded-host
 * because on Supabase production x-forwarded-host is the internal
 * edge-runtime.supabase.com, not the public hostname.
 */
export function resolvePublicBaseUrl(req: Request): string {
  const functionsHost = deriveFunctionsHost();
  if (functionsHost) return `https://${functionsHost}/`;

  const fwdHost: string | undefined = req.headers["x-forwarded-host"];
  if (fwdHost) {
    const proto = (
      req.headers["x-forwarded-proto"] || "http"
    ).split(",")[0].trim();
    const port: string | undefined = req.headers["x-forwarded-port"];
    const prefix = (req.headers["x-forwarded-prefix"] || "/").replace(
      /\/*$/,
      "/",
    );
    const hostPart =
      port && port !== DEFAULT_PORTS[proto] ? `${fwdHost}:${port}` : fwdHost;
    return `${proto}://${hostPart}${prefix}`;
  }

  // Last-resort fallback
  const proto =
    req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["host"] || req.hostname || "localhost";
  return `${proto}://${host}/`;
}

// ── Duo response helpers ─────────────────────────────────────────────────────

export function duoError(
  res: Response,
  code: number,
  message: string,
  messageDetail?: string,
): void {
  const httpStatus = Math.floor(code / 100);
  const body: Record<string, unknown> = { stat: "FAIL", code, message };
  if (messageDetail !== undefined) {
    body.message_detail = messageDetail;
  }
  res.status(httpStatus).json(body);
}

export function duoSuccess(res: Response, response: unknown): void {
  res.status(200).json({ stat: "OK", response });
}
