import type { Request, Response } from "express";
import crypto from "node:crypto";
import { supabase } from "../../_shared/supabaseClient.ts";
import {
  extractParams,
  resolveEmail,
  extractUsername,
  resolvePublicBaseUrl,
  duoError,
  duoSuccess,
} from "../../_shared/helpers.ts";

// ── Build portal enrollment response ─────────────────────────────────────────

async function buildEnrollPortalResponse(
  req: Request,
  username: string,
): Promise<{ enroll_portal_url: string; result: string; status_msg: string }> {
  const { data: existing } = await supabase
    .from("portal_enrollments")
    .select("code")
    .eq("username", username)
    .gt("expires_at", new Date().toISOString())
    .limit(1)
    .maybeSingle();

  let code: string;
  if (existing) {
    code = existing.code;
  } else {
    code = crypto.randomBytes(24).toString("base64url");
    await supabase.from("portal_enrollments").insert({
      code,
      username,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });
  }

  const baseUrl = resolvePublicBaseUrl(req);
  const enrollPortalUrl = `${baseUrl}frame/portal/v4/enroll?code=${code}`;

  return {
    enroll_portal_url: enrollPortalUrl,
    result: "enroll",
    status_msg: "Enroll an authentication device to proceed",
  };
}

export async function handlePreauth(req: Request, res: Response) {
  try {
    const params = extractParams(req);
    const userId = params.user_id || null;
    const username = params.username || null;

    if (!userId && !username) {
      return duoError(
        res,
        40001,
        "Missing required request parameters",
        "user_id or username",
      );
    }

    let appUserId = userId;

    if (!appUserId && username) {
      const email = resolveEmail(username);
      const { data: user } = await supabase
        .from("users")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (!user) {
        const enrollResp = await buildEnrollPortalResponse(req, username);
        return duoSuccess(res, enrollResp);
      }
      appUserId = user.id;
    }

    const { data: userData } = await supabase
      .from("users")
      .select("*")
      .eq("id", appUserId)
      .maybeSingle();

    if (!userData) {
      const uname = username || extractUsername(appUserId!);
      const enrollResp = await buildEnrollPortalResponse(req, uname);
      return duoSuccess(res, enrollResp);
    }

    if (userData.status === "bypass") {
      return duoSuccess(res, {
        result: "allow",
        status_msg: "Bypassing authentication",
      });
    }
    if (userData.status === "disabled") {
      return duoSuccess(res, {
        result: "deny",
        status_msg: "Account is disabled",
      });
    }

    const { data: devices } = await supabase
      .from("devices")
      .select("*")
      .eq("user_id", appUserId);

    if (!devices || devices.length === 0) {
      const uname = username || extractUsername(userData.email);
      const enrollResp = await buildEnrollPortalResponse(req, uname);
      return duoSuccess(res, enrollResp);
    }

    // deno-lint-ignore no-explicit-any
    const deviceList = devices.map((d: any) => ({
      device: d.id,
      display_name: d.display_name || "Telegram",
      name: d.name || "Telegram",
      number: "",
      type: d.type || "phone",
      capabilities: ["auto", "push"],
    }));

    duoSuccess(res, {
      result: "auth",
      status_msg: "Account is active",
      devices: deviceList,
    });
  } catch (err) {
    console.error("preauth error", err);
    duoError(res, 50000, "Internal server error");
  }
}
