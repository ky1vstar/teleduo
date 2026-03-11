// ── Admin Edge Function ──────────────────────────────────────────────────────
// Duo-compatible Admin API. All paths prefixed with /admin (the function name).
// ─────────────────────────────────────────────────────────────────────────────

import express from "express";
import type { Request, Response, NextFunction } from "express";
import { Buffer } from "node:buffer";

import { config } from "shared/config.ts";
import { extractParams } from "shared/helpers.ts";
import { duoSignatureMiddleware } from "shared/duoSignature.ts";

import { handleGetUsers } from "./routes/getUsers.ts";
import { handleGetUser } from "./routes/getUser.ts";
import { handleDeleteUser } from "./routes/deleteUser.ts";
import { handleGetBranding, handlePostBranding } from "./routes/branding.ts";
import exp from "node:constants";

const app = express();

const captureRawBody = (req: Request, _res: Response, buf: Buffer) => {
  (req as Request & { rawBody?: Buffer }).rawBody = buf;
};
app.use(express.json({ limit: "1mb", verify: captureRawBody as Parameters<typeof express.json>[0]["verify"] }));
app.use(express.urlencoded({ limit: "1mb", extended: true, verify: captureRawBody as Parameters<typeof express.urlencoded>[0]["verify"] }));

// Fallback: capture raw body for content types not handled above (e.g. multipart)
app.use((req: Request, _res: Response, next: NextFunction) => {
  if ((req as Request & { rawBody?: Buffer }).rawBody !== undefined) return next();
  // Skip body reading for requests without a body to avoid Deno AbortError
  if (!req.headers["content-length"] && !req.headers["transfer-encoding"]) {
    (req as Request & { rawBody?: Buffer }).rawBody = Buffer.alloc(0);
    return next();
  }
  const chunks: Uint8Array[] = [];
  req.on("data", (chunk: Uint8Array) => chunks.push(chunk));
  req.on("end", () => {
    (req as Request & { rawBody?: Buffer }).rawBody = Buffer.concat(chunks);
    next();
  });
  req.on("error", next);
});

// ── Duo HMAC signature verification ──────────────────────────────────────────

app.use("/admin", (req: Request, res: Response, next: NextFunction) => {
  duoSignatureMiddleware(config.ADMIN_IKEY, config.ADMIN_SKEY, extractParams)(req, res, next);
});

// ── Routes ───────────────────────────────────────────────────────────────────

app.get("/admin/v1/users", handleGetUsers);
app.get("/admin/v1/users/:user_id", handleGetUser);
app.delete("/admin/v1/users/:user_id", handleDeleteUser);
app.get("/admin/v1/branding", handleGetBranding);
app.post("/admin/v1/branding", handlePostBranding);

export default app;
