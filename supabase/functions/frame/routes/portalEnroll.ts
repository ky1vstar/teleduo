import type { Request, Response } from "express";
import { supabase } from "shared/supabaseClient.ts";
import { getBotUsername } from "shared/telegram/bot.ts";
import {
  generateActivationCode,
  resolveEmail,
} from "shared/helpers.ts";

const EXPIRED_TEXT =
  "Enrollment link expired\n\nYour enrollment link has expired. Contact your IT help desk for a new link.";

export async function handlePortalEnroll(req: Request, res: Response) {
  try {
    const code = req.query.code;
    if (!code) return res.status(400).send("Missing code parameter");

    const { data: portalData } = await supabase
      .from("portal_enrollments")
      .select("*")
      .eq("code", code)
      .maybeSingle();

    if (!portalData) return res.type("text").status(200).send(EXPIRED_TEXT);
    if (new Date(portalData.expires_at) < new Date()) {
      return res.type("text").status(200).send(EXPIRED_TEXT);
    }

    // Reuse existing enrollment if already created for this portal code
    if (portalData.activation_url) {
      return res.redirect(302, portalData.activation_url);
    }

    const username: string = portalData.username;
    const email = resolveEmail(username);

    // Find or create Supabase Auth user
    let userId: string;
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingUser) {
      userId = existingUser.id;
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

    // Generate enrollment
    const activationCode = generateActivationCode();
    const botUsername = await getBotUsername();
    const activationUrl = `https://t.me/${botUsername}?start=${activationCode}`;

    await supabase.from("enrollments").insert({
      activation_code: activationCode,
      user_id: userId,
      username,
      status: "waiting",
      expires_at: portalData.expires_at,
    });

    // Save URL so repeat visits reuse the same enrollment
    await supabase
      .from("portal_enrollments")
      .update({ activation_url: activationUrl, user_id: userId })
      .eq("code", code);

    console.log("Portal enrollment created", { code, username, userId });
    res.redirect(302, activationUrl);
  } catch (err) {
    console.error("Portal enrollment error", err);
    res.status(500).send("Internal server error");
  }
}
