// ── Admin Edge Function ──────────────────────────────────────────────────────
// Duo-compatible Admin API. All paths prefixed with /admin (the function name).
// ─────────────────────────────────────────────────────────────────────────────

import express from "express";
import type { Request, Response, NextFunction } from "express";
import { Buffer } from "node:buffer";

import { ADMIN_IKEY, ADMIN_SKEY } from "../_shared/config.ts";
import { extractParams } from "../_shared/helpers.ts";
import { duoSignatureMiddleware } from "../_shared/duoSignature.ts";

import { handleGetUsers } from "./routes/getUsers.ts";
import { handleGetUser } from "./routes/getUser.ts";
import { handleDeleteUser } from "./routes/deleteUser.ts";

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

// ── Duo HMAC signature verification ──────────────────────────────────────────

app.use(
  "/admin",
  duoSignatureMiddleware(ADMIN_IKEY, ADMIN_SKEY, extractParams),
);

// ── Routes ───────────────────────────────────────────────────────────────────

app.get("/admin/v1/users", handleGetUsers);
app.get("/admin/v1/users/:user_id", handleGetUser);
app.delete("/admin/v1/users/:user_id", handleDeleteUser);

app.listen(3000);
