// ── Auth Edge Function ───────────────────────────────────────────────────────
// Duo-compatible Auth API. All paths prefixed with /auth (the function name).
// ─────────────────────────────────────────────────────────────────────────────

import express from "express";
import type { Request, Response, NextFunction } from "express";
import { Buffer } from "node:buffer";

import { AUTH_IKEY, AUTH_SKEY } from "../_shared/config.ts";
import { extractParams } from "../_shared/helpers.ts";
import { duoSignatureMiddleware } from "../_shared/duoSignature.ts";

import { handlePing } from "./routes/ping.ts";
import { handleCheck } from "./routes/check.ts";
import { handleEnroll } from "./routes/enroll.ts";
import { handleEnrollStatus } from "./routes/enrollStatus.ts";
import { handlePreauth } from "./routes/preauth.ts";
import { handleAuth } from "./routes/auth.ts";
import { handleAuthStatus } from "./routes/authStatus.ts";
import { handleLogo } from "./routes/logo.ts";

const app = express();

const captureRawBody = (req: Request, _res: Response, buf: Buffer) => {
  (req as Request & { rawBody?: Buffer }).rawBody = buf;
};
app.use(express.json({ verify: captureRawBody as Parameters<typeof express.json>[0]["verify"] }));
app.use(express.urlencoded({ extended: true, verify: captureRawBody as Parameters<typeof express.urlencoded>[0]["verify"] }));

// Fallback: capture raw body for content types not handled above (e.g. multipart)
app.use((req: Request, _res: Response, next: NextFunction) => {
  if ((req as Request & { rawBody?: Buffer }).rawBody !== undefined) return next();
  const chunks: Uint8Array[] = [];
  req.on("data", (chunk: Uint8Array) => chunks.push(chunk));
  req.on("end", () => {
    (req as Request & { rawBody?: Buffer }).rawBody = Buffer.concat(chunks);
    next();
  });
  req.on("error", next);
});

// ── /auth/v2/ping — no signature verification ────────────────────────────────

app.get("/auth/v2/ping", handlePing);

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
