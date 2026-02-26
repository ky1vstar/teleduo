import crypto from "node:crypto";
import { Buffer } from "node:buffer";
import { getRawBody, resolveSignatureHost } from "./helpers.ts";
import type { Request, Response, NextFunction } from "express";

// ── Duo signature helpers ────────────────────────────────────────────────────

function compare(a: string, b: string): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const ac = a.charCodeAt(i);
    const bc = b.charCodeAt(i);
    if (ac < bc) return -1;
    if (ac > bc) return 1;
  }
  if (a.length < b.length) return -1;
  if (a.length > b.length) return 1;
  return 0;
}

function canonParams(params: Record<string, string | string[]>): string {
  const ks = Object.keys(params).sort(compare);
  const qs = ks
    .map((k) => {
      const keq = encodeURIComponent(k) + "=";
      if (Array.isArray(params[k])) {
        return (params[k] as string[])
          .map((v) => keq + encodeURIComponent(v))
          .join("&");
      }
      return keq + encodeURIComponent(params[k] as string);
    })
    .join("&");

  return qs
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

function canonicalize(
  method: string,
  host: string,
  path: string,
  params: Record<string, string | string[]>,
  date: string,
): string {
  return [
    date,
    method.toUpperCase(),
    host.toLowerCase(),
    path,
    canonParams(params),
  ].join("\n");
}

function canonicalizeV5(
  method: string,
  host: string,
  path: string,
  params: Record<string, string | string[]>,
  date: string,
  body: string,
): string {
  return [
    date,
    method.toUpperCase(),
    host.toLowerCase(),
    path,
    canonParams(params),
    hashString(body),
    hashString(""),
  ].join("\n");
}

function hashString(s: string): string {
  return crypto.createHash("sha512").update(s).digest("hex");
}

function hmacSign(skey: string, canon: string, algorithm: string): string {
  return crypto.createHmac(algorithm, skey).update(canon).digest("hex");
}

function signaturesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a.toLowerCase(), "utf8");
  const bufB = Buffer.from(b.toLowerCase(), "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// ── Request helpers ──────────────────────────────────────────────────────────

/**
 * Resolve the canonical Duo API path from the original request URL.
 * Prefers x-forwarded-path (set by the Supabase gateway) which contains the
 * full path the client actually used (e.g. /functions/v1/auth/v2/check).
 * Falls back to req.originalUrl. Strips query string, keeps leading slash.
 */
function resolveDuoPath(req: Request): string {
  const raw: string = req.originalUrl || req.url || "/";
  const qIdx = raw.indexOf("?");
  return qIdx === -1 ? raw : raw.substring(0, qIdx);
}

// ── Signature verification ───────────────────────────────────────────────────

function* candidateSignatures(
  req: Request,
  skey: string,
  extractParamsFn: (req: Request) => Record<string, string>,
): Generator<string> {
  const date: string = req.headers["x-duo-date"] || req.headers["date"] || "";
  const method: string = req.method.toUpperCase();
  const host = resolveSignatureHost(req);
  const duoPath = resolveDuoPath(req);
  const isBodyMethod = ["POST", "PUT", "PATCH"].includes(method);
  const rawBody = getRawBody(req);

  let v2Canon: string | undefined;
  let v5Canon: string | undefined;
  const getV2Canon = () =>
    (v2Canon ??= canonicalize(
      method,
      host,
      duoPath,
      extractParamsFn(req),
      date,
    ));
  const getV5Canon = () =>
    (v5Canon ??= canonicalizeV5(
      method,
      host,
      duoPath,
      isBodyMethod ? {} : ((req.query || {}) as Record<string, string>),
      date,
      isBodyMethod ? rawBody : "",
    ));

  yield hmacSign(skey, getV5Canon(), "sha512");
  yield hmacSign(skey, getV2Canon(), "sha1");
  yield hmacSign(skey, getV2Canon(), "sha512");
  yield hmacSign(skey, getV5Canon(), "sha1");
}

function verifySignature(
  req: Request,
  ikey: string,
  skey: string,
  extractParamsFn: (req: Request) => Record<string, string>,
): { ok: boolean; code?: number; reason?: string } {
  const authHeader: string = req.headers["authorization"] || "";
  if (!authHeader.startsWith("Basic ")) {
    return { ok: false, reason: "Missing or malformed Authorization header" };
  }

  const decoded = Buffer.from(authHeader.slice(6), "base64").toString();
  const colonIdx = decoded.indexOf(":");
  if (colonIdx === -1) {
    return { ok: false, reason: "Invalid Basic auth format" };
  }

  const providedIkey = decoded.substring(0, colonIdx);
  const providedSig = decoded.substring(colonIdx + 1);

  if (providedIkey !== ikey) {
    return {
      ok: false,
      code: 40102,
      reason: "Invalid integration key in request credentials",
    };
  }

  for (const sig of candidateSignatures(
    req,
    skey,
    extractParamsFn,
  )) {
    if (signaturesMatch(providedSig, sig)) {
      return { ok: true };
    }
  }

  const method = req.method.toUpperCase();
  const host = resolveSignatureHost(req);
  const duoPath = resolveDuoPath(req);
  const date = req.headers["x-duo-date"] || req.headers["date"] || "";

  console.warn("Signature mismatch debug", {
    method,
    host,
    duoPath,
    date,
    paramsKeys: Object.keys(extractParamsFn(req)),
    providedSigLen: providedSig.length,
  });
  return {
    ok: false,
    code: 40103,
    reason: "Invalid signature in request credentials",
  };
}

// ── Express middleware factory ────────────────────────────────────────────────

export function duoSignatureMiddleware(
  ikey: string,
  skey: string,
  extractParamsFn: (req: Request) => Record<string, string>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = verifySignature(
      req,
      ikey,
      skey,
      extractParamsFn,
    );
    if (!result.ok) {
      console.warn("Signature verification failed", {
        reason: result.reason,
      });
      const body: Record<string, unknown> = { stat: "FAIL", message: result.reason };
      if (result.code) body.code = result.code;
      res.status(401).json(body);
      return;
    }
    next();
  };
}
