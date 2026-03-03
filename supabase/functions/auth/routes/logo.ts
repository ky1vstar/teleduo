import type { Request, Response } from "express";
import { Buffer } from "node:buffer";
import { supabase } from "shared/supabaseClient.ts";
import { BRANDING_BUCKET, BRANDING_LOGO_KEY } from "shared/branding.ts";
import { duoError } from "shared/helpers.ts";

export async function handleLogo(_req: Request, res: Response) {
  try {
    const { data, error } = await supabase.storage
      .from(BRANDING_BUCKET)
      .download(BRANDING_LOGO_KEY);

    if (error || !data) return duoError(res, 40401, "Resource not found");

    const buffer = Buffer.from(await data.arrayBuffer());
    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "public, max-age=3600");
    res.send(buffer);
  } catch (err) {
    console.error("logo error", err);
    duoError(res, 50000, "Internal server error");
  }
}
