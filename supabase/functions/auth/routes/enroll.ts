import type { Request, Response } from "express";
import { supabase } from "../../_shared/supabaseClient.ts";
import { ENROLL_ALLOW_EXISTING } from "../../_shared/config.ts";
import { getBotUsername } from "../../_shared/telegram/bot.ts";
import {
  extractParams,
  generateActivationCode,
  generateRandomUsername,
  resolveEmail,
  resolvePublicBaseUrl,
  duoError,
  duoSuccess,
} from "../../_shared/helpers.ts";

export async function handleEnroll(req: Request, res: Response) {
  try {
    const params = extractParams(req);
    const username: string = params.username || generateRandomUsername();
    const validSecs = parseInt(params.valid_secs, 10) || 86400;
    const email = resolveEmail(username);

    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    let userId: string;

    if (existingUser) {
      if (!ENROLL_ALLOW_EXISTING) {
        return duoError(
          res,
          40002,
          "Invalid request parameters",
          "username already exists",
        );
      }
      userId = existingUser.id;
      // Delete existing devices for re-enrollment
      await supabase.from("devices").delete().eq("user_id", userId);
    } else {
      const { data: authData, error: authErr } =
        await supabase.auth.admin.createUser({ email, email_confirm: true });
      if (authErr) throw authErr;
      userId = authData.user.id;

      await supabase.from("users").insert({
        id: userId,
        username,
        email,
        status: "active",
      });
    }

    const activationCode = generateActivationCode();
    const expiresAt = new Date(Date.now() + validSecs * 1000).toISOString();
    const botUsername = await getBotUsername();
    const activationUrl = `https://t.me/${botUsername}?start=${activationCode}`;

    await supabase.from("enrollments").insert({
      activation_code: activationCode,
      user_id: userId,
      username,
      status: "waiting",
      expires_at: expiresAt,
    });

    const baseUrl = resolvePublicBaseUrl(req);
    const barcodeUrl = `${baseUrl}frame/qr?value=${encodeURIComponent(activationUrl)}`;
    const expiration = Math.floor(new Date(expiresAt).getTime() / 1000);

    duoSuccess(res, {
      activation_barcode: barcodeUrl,
      activation_code: activationUrl,
      activation_url: activationUrl,
      expiration,
      user_id: userId,
      username,
    });
  } catch (err) {
    console.error("enroll error", err);
    duoError(res, 50000, "Internal server error");
  }
}
