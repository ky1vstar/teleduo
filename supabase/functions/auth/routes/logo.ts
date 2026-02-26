import { Buffer } from "node:buffer";
import { LOGO_URL } from "../../_shared/config.ts";
import { duoError } from "../../_shared/helpers.ts";

// deno-lint-ignore no-explicit-any
export async function handleLogo(_req: any, res: any) {
  try {
    if (!LOGO_URL) return duoError(res, 40401, "Resource not found");

    const response = await fetch(LOGO_URL);
    if (!response.ok) return duoError(res, 40401, "Resource not found");

    const contentType = response.headers.get("content-type") || "image/png";
    const buffer = Buffer.from(await response.arrayBuffer());

    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=3600");
    res.send(buffer);
  } catch (err) {
    console.error("logo error", err);
    duoError(res, 50000, "Internal server error");
  }
}
