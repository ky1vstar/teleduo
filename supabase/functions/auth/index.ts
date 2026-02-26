// ── Auth Edge Function ───────────────────────────────────────────────────────
// Duo-compatible Auth API. All paths prefixed with /auth (the function name).
// ─────────────────────────────────────────────────────────────────────────────

import express from "express";
import { Buffer } from "node:buffer";

import { AUTH_IKEY, AUTH_SKEY } from "../_shared/config.ts";
import { extractParams } from "../_shared/helpers.ts";
import { duoSignatureMiddleware } from "../_shared/duoSignature.ts";
import { supabase } from "../_shared/supabaseClient.ts";

import { handlePing } from "./routes/ping.ts";
import { handleCheck } from "./routes/check.ts";
import { handleEnroll } from "./routes/enroll.ts";
import { handleEnrollStatus } from "./routes/enrollStatus.ts";
import { handlePreauth } from "./routes/preauth.ts";
import { handleAuth } from "./routes/auth.ts";
import { handleAuthStatus } from "./routes/authStatus.ts";
import { handleLogo } from "./routes/logo.ts";

const app = express();

// deno-lint-ignore no-explicit-any
const captureRawBody = (req: any, _res: any, buf: Buffer) => {
  req.rawBody = buf;
};
app.use(express.json({ verify: captureRawBody }));
app.use(express.urlencoded({ extended: true, verify: captureRawBody }));

// Fallback: capture raw body for content types not handled above (e.g. multipart)
// deno-lint-ignore no-explicit-any
app.use((req: any, _res: any, next: any) => {
  if (req.rawBody !== undefined) return next();
  const chunks: Uint8Array[] = [];
  req.on("data", (chunk: Uint8Array) => chunks.push(chunk));
  req.on("end", () => {
    req.rawBody = Buffer.concat(chunks);
    next();
  });
  req.on("error", next);
});

// ── /auth/v2/ping — no signature verification ────────────────────────────────

app.get("/auth/v2/ping", handlePing);

// ── Lazy cleanup (fire-and-forget, throttled via PG function) ────────────────

// deno-lint-ignore no-explicit-any
app.use((_req: any, _res: any, next: any) => {
  supabase.rpc("cleanup_expired_if_needed").then(({ error }) => {
    if (error) console.error("Lazy cleanup failed", error);
  });
  next();
});

// ── Duo HMAC signature verification for all other /auth routes ───────────────

app.use(
  "/auth",
  duoSignatureMiddleware(AUTH_IKEY, AUTH_SKEY, extractParams),
);

// ── Authenticated routes ─────────────────────────────────────────────────────

app.get("/auth/v2/check", handleCheck);
app.post("/auth/v2/enroll", handleEnroll);
app.post("/auth/v2/enroll_status", handleEnrollStatus);
app.post("/auth/v2/preauth", handlePreauth);
app.post("/auth/v2/auth", handleAuth);
app.get("/auth/v2/auth_status", handleAuthStatus);
app.get("/auth/v2/logo", handleLogo);

app.listen(3000);
