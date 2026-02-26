import crypto from "node:crypto";

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

// deno-lint-ignore no-explicit-any
export function extractParams(req: any): Record<string, string> {
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
      return req.query;
    }
    return bodyParams;
  }

  // GET / DELETE – params from query string
  return req.query || {};
}

/** Get the raw body as a UTF-8 string (set by our body-parser middleware). */
// deno-lint-ignore no-explicit-any
export function getRawBody(req: any): string {
  if (req.rawBody) {
    if (typeof req.rawBody === "string") return req.rawBody;
    if (req.rawBody instanceof Uint8Array) {
      return new TextDecoder().decode(req.rawBody);
    }
    return String(req.rawBody);
  }
  return "";
}

// ── Duo response helpers ─────────────────────────────────────────────────────

export function duoError(
  // deno-lint-ignore no-explicit-any
  res: any,
  code: number,
  message: string,
  messageDetail?: string,
): void {
  const httpStatus = Math.floor(code / 100);
  // deno-lint-ignore no-explicit-any
  const body: any = { stat: "FAIL", code, message };
  if (messageDetail !== undefined) {
    body.message_detail = messageDetail;
  }
  res.status(httpStatus).json(body);
}

// deno-lint-ignore no-explicit-any
export function duoSuccess(res: any, response: unknown): void {
  res.status(200).json({ stat: "OK", response });
}
