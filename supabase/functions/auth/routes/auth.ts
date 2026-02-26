import { supabase } from "../../_shared/supabaseClient.ts";
import { sendPushMessage } from "../../_shared/telegram/bot.ts";
import { t } from "../../_shared/telegram/i18n.ts";
import {
  extractParams,
  resolveEmail,
  extractUsername,
  generateTxId,
  duoError,
  duoSuccess,
} from "../../_shared/helpers.ts";

// ── Long-poll helper (Realtime subscription) ─────────────────────────────────

interface AuthResult {
  result: string;
  status: string;
  status_msg: string;
}

async function waitForAuthResult(
  txid: string,
  timeoutMs = 55000,
): Promise<AuthResult> {
  // Check if already resolved before subscribing
  const { data: existing } = await supabase
    .from("auth_transactions")
    .select("result, status, status_msg")
    .eq("txid", txid)
    .single();

  if (existing && existing.result !== "waiting") {
    return {
      result: existing.result,
      status: existing.status,
      status_msg: existing.status_msg,
    };
  }

  return new Promise<AuthResult>((resolve) => {
    let settled = false;
    const channelName = `auth-tx-${txid}`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "auth_transactions",
          filter: `txid=eq.${txid}`,
        },
        (payload) => {
          const row = payload.new as Record<string, string>;
          if (row.result && row.result !== "waiting" && !settled) {
            settled = true;
            supabase.removeChannel(channel);
            resolve({
              result: row.result,
              status: row.status,
              status_msg: row.status_msg,
            });
          }
        },
      )
      .subscribe();

    // Timeout fallback
    setTimeout(async () => {
      if (settled) return;
      settled = true;
      supabase.removeChannel(channel);

      await supabase
        .from("auth_transactions")
        .update({
          result: "deny",
          status: "timeout",
          status_msg: "Login timed out.",
          resolved_at: new Date().toISOString(),
        })
        .eq("txid", txid)
        .eq("result", "waiting");

      resolve({
        result: "deny",
        status: "timeout",
        status_msg: "Login timed out.",
      });
    }, timeoutMs);
  });
}

// ── Resolve user + device ────────────────────────────────────────────────────

async function resolveUserAndDevice(
  params: Record<string, string>,
) {
  const userId = params.user_id || null;
  const username = params.username || null;

  if (!userId && !username) {
    return {
      error: {
        code: 40001,
        message: "Missing required request parameters",
        detail: "user_id or username",
      },
    };
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
      return { error: { code: 40401, message: "Resource not found" } };
    }
    appUserId = user.id;
  }

  const { data: userData } = await supabase
    .from("users")
    .select("*")
    .eq("id", appUserId)
    .maybeSingle();

  if (!userData) {
    return { error: { code: 40401, message: "Resource not found" } };
  }

  const deviceParam = params.device || "auto";
  // deno-lint-ignore no-explicit-any
  let deviceData: any = null;

  if (deviceParam === "auto") {
    const { data: devices } = await supabase
      .from("devices")
      .select("*")
      .eq("user_id", appUserId)
      .limit(1);
    if (devices && devices.length > 0) deviceData = devices[0];
  } else {
    const { data: device } = await supabase
      .from("devices")
      .select("*")
      .eq("id", deviceParam)
      .eq("user_id", appUserId)
      .maybeSingle();
    deviceData = device;
  }

  if (!deviceData) {
    return {
      error: {
        code: 40002,
        message: "Invalid request parameters",
        detail: "no capable device",
      },
    };
  }

  const resolvedUsername =
    username || extractUsername(userData.email || appUserId!);

  return {
    uid: appUserId!,
    userData,
    deviceId: deviceData.id,
    deviceData,
    username: resolvedUsername,
  };
}

// ── Format push message ──────────────────────────────────────────────────────

function formatPushMessage(
  params: Record<string, string>,
  username: string,
  locale = "en",
): string {
  const displayUsername = params.display_username || username;
  const pushinfo = params.pushinfo || "";
  const ipaddr = params.ipaddr || "unknown";
  const now =
    new Date().toISOString().replace("T", " ").substring(0, 19) + " UTC";

  let domain = "";
  let type = "";
  if (pushinfo) {
    const parts = new URLSearchParams(pushinfo);
    domain = parts.get("domain") || "";
    type = parts.get("type") || "";
  }

  let text =
    t(locale, "push-title") +
    "\n\n" +
    t(locale, "push-user", { username: displayUsername });
  if (type) text += "\n" + t(locale, "push-app", { type });
  if (domain) text += "\n" + t(locale, "push-domain", { domain });
  text += "\n" + t(locale, "push-ip", { ipaddr });
  text += "\n" + t(locale, "push-time", { time: now });

  return text;
}

// ── Main handler ─────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
export async function handleAuth(req: any, res: any) {
  try {
    const params = extractParams(req);
    const factor = params.factor;

    if (!factor) {
      return duoError(
        res,
        40001,
        "Missing required request parameters",
        "factor",
      );
    }
    if (factor !== "push" && factor !== "auto") {
      return duoError(
        res,
        40002,
        "Invalid request parameters",
        `Unsupported factor: ${factor}`,
      );
    }

    const resolved = await resolveUserAndDevice(params);
    if ("error" in resolved && resolved.error) {
      return duoError(
        res,
        resolved.error.code,
        resolved.error.message,
        "detail" in resolved.error ? resolved.error.detail : undefined,
      );
    }

    const { uid, userData, deviceId, deviceData, username } = resolved;

    if (userData.status === "bypass") {
      return duoSuccess(res, {
        result: "allow",
        status: "bypass",
        status_msg: "Bypassing authentication",
      });
    }
    if (userData.status === "disabled") {
      return duoSuccess(res, {
        result: "deny",
        status: "deny",
        status_msg: "Account is disabled",
      });
    }

    const isAsync = params.async === "1";
    const txid = generateTxId();

    const txData = {
      txid,
      user_id: uid,
      device_id: deviceId,
      factor,
      status: "pushed",
      status_msg: "Pushed a login request to your phone...",
      result: "waiting",
      push_info: params.pushinfo
        ? Object.fromEntries(new URLSearchParams(params.pushinfo))
        : {},
      display_username: params.display_username || username,
      ipaddr: params.ipaddr || "",
      telegram_message_id: null,
      telegram_chat_id: deviceData.telegram_chat_id || null,
      expires_at: new Date(Date.now() + 60000).toISOString(),
    };

    await supabase.from("auth_transactions").insert(txData);

    // Send Telegram push
    const chatId = deviceData.telegram_chat_id;
    if (chatId) {
      const locale: string = deviceData.locale || "en";
      const text = formatPushMessage(params, username, locale);
      try {
        const messageId = await sendPushMessage(chatId, text, txid, locale);
        await supabase
          .from("auth_transactions")
          .update({ telegram_message_id: messageId })
          .eq("txid", txid);
      } catch (err) {
        console.error("Failed to send Telegram push", err);
      }
    }

    if (isAsync) {
      return duoSuccess(res, { txid });
    }

    const result = await waitForAuthResult(txid, 55000);
    duoSuccess(res, result);
  } catch (err) {
    console.error("auth error", err);
    duoError(res, 50000, "Internal server error");
  }
}
