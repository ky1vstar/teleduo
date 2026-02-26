import type { Request, Response } from "express";
import { supabase } from "../../_shared/supabaseClient.ts";
import { getBotUsername } from "../../_shared/telegram/bot.ts";
import {
  generateActivationCode,
  resolveEmail,
} from "../../_shared/helpers.ts";

const EXPIRED_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Enrollment link expired</title>
<style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f5f5f5}
.card{background:#fff;border-radius:8px;padding:40px;max-width:420px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.1)}
h1{font-size:22px;margin:0 0 12px}p{color:#666;margin:0}</style></head>
<body><div class="card"><h1>Enrollment link expired</h1>
<p>Your enrollment link sent by email has expired. Contact your IT help desk for a new link.</p></div></body></html>`;

export async function handlePortalEnroll(req: Request, res: Response) {
  try {
    const code = req.query.code;
    if (!code) return res.status(400).send("Missing code parameter");

    const { data: portalData } = await supabase
      .from("portal_enrollments")
      .select("*")
      .eq("code", code)
      .maybeSingle();

    if (!portalData) return res.status(200).send(EXPIRED_HTML);
    if (new Date(portalData.expires_at) < new Date()) {
      return res.status(200).send(EXPIRED_HTML);
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
