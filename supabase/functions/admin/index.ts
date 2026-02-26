// ── Admin Edge Function ──────────────────────────────────────────────────────
// Proxies requests to the Duo Admin API with HMAC signature verification.
// All paths prefixed with /admin (the function name).
// ─────────────────────────────────────────────────────────────────────────────

import express from "express";
import type { Request, Response, NextFunction } from "express";
import { Buffer } from "node:buffer";
import duo_api from "@duosecurity/duo_api";

import { ADMIN_IKEY, ADMIN_SKEY, DUO_HOST } from "../_shared/config.ts";
import { extractParams } from "../_shared/helpers.ts";
import { duoSignatureMiddleware } from "../_shared/duoSignature.ts";

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

// ── Duo proxy handler ────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
function duoProxyHandler(client: any) {
  return (req: Request, res: Response) => {
    const method: string = req.method.toUpperCase();
    // req.path already starts with /admin/..., map to Duo /admin/...
    const duoPath = req.path;
    const params = extractParams(req);

    console.log("Incoming admin request", {
      method,
      url: req.originalUrl,
      duoPath,
      params,
    });

    // deno-lint-ignore no-explicit-any
    client.jsonApiCall(method, duoPath, params, (duoResponse: any) => {
      console.log("Duo admin response", { duoPath, response: duoResponse });
      const statusCode = duoResponse.stat === "OK" ? 200 : 400;
      res.status(statusCode).json(duoResponse);
    });
  };
}

// All /admin/* requests are proxied to Duo
app.all("/admin/*", (req: Request, res: Response) => {
  const client = new duo_api.Client(ADMIN_IKEY, ADMIN_SKEY, DUO_HOST);
  duoProxyHandler(client)(req, res);
});

app.listen(3000);
