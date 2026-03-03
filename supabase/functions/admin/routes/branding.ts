import type { Request, Response } from "express";
import { Buffer } from "node:buffer";
import { supabase } from "shared/supabaseClient.ts";
import { BRANDING_BUCKET, BRANDING_LOGO_KEY } from "shared/branding.ts";
import { extractParams, duoError, duoSuccess } from "shared/helpers.ts";

const MAX_LOGO_BYTES = 200 * 1024; // 200 KB

/** Read current logo from storage and return base64 or null. */
async function readLogo(): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BRANDING_BUCKET)
    .download(BRANDING_LOGO_KEY);
  if (error || !data) return null;
  const buf = Buffer.from(await data.arrayBuffer());
  return buf.toString("base64");
}

function brandingResponse(logo: string | null) {
  return {
    background_image: null,
    card_accent_color: null,
    logo,
    page_background_color: null,
    powered_by_duo: null,
  };
}

// ── GET /admin/v1/branding ───────────────────────────────────────────────────

export async function handleGetBranding(_req: Request, res: Response) {
  try {
    const logo = await readLogo();
    duoSuccess(res, brandingResponse(logo));
  } catch (err) {
    console.error("getBranding error", err);
    duoError(res, 50000, "Internal server error");
  }
}

// ── POST /admin/v1/branding ──────────────────────────────────────────────────

export async function handlePostBranding(req: Request, res: Response) {
  try {
    const params = extractParams(req);
    const logoParam: string | undefined = params.logo;

    // If logo param present, process it
    if (logoParam !== undefined) {
      if (logoParam === "") {
        // Reset logo – delete from storage
        await supabase.storage.from(BRANDING_BUCKET).remove([BRANDING_LOGO_KEY]);
      } else {
        // Decode base64
        let buf: Buffer;
        try {
          buf = Buffer.from(logoParam, "base64");
          // Verify that it round-trips (catches non-base64 input)
          if (buf.toString("base64") !== logoParam.replace(/\s/g, "")) {
            return duoError(res, 60001, "File is not a valid PNG image");
          }
        } catch {
          return duoError(res, 60001, "File is not a valid PNG image");
        }

        if (buf.length > MAX_LOGO_BYTES) {
          return duoError(res, 60001, "The file size exceeds the allowed limit");
        }

        // Upload – storage validates mime type via bucket config
        const { error } = await supabase.storage
          .from(BRANDING_BUCKET)
          .upload(BRANDING_LOGO_KEY, buf, {
            contentType: "image/png",
            upsert: true,
          });
        if (error) {
          return duoError(res, 60001, "File is not a valid PNG image");
        }
      }
    }

    // Return current state
    const logo = await readLogo();
    duoSuccess(res, brandingResponse(logo));
  } catch (err) {
    console.error("postBranding error", err);
    duoError(res, 50000, "Internal server error");
  }
}
