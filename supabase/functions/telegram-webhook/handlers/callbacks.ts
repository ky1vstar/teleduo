import { supabase } from "../../_shared/supabaseClient.ts";
import { editPushMessage } from "../../_shared/telegram/bot.ts";
import { t } from "../../_shared/telegram/i18n.ts";

// deno-lint-ignore no-explicit-any
export async function handleCallbackQuery(ctx: any) {
  try {
    const data = ctx.callbackQuery.data;
    if (!data) return;

    const [action, txid] = data.split(":");
    if (!txid || (action !== "approve" && action !== "deny")) {
      return ctx.answerCallbackQuery({ text: ctx.t("cb-invalid-action") });
    }

    const chatId = ctx.chat.id;

    const { data: txData } = await supabase
      .from("auth_transactions")
      .select("*")
      .eq("txid", txid)
      .maybeSingle();

    if (!txData) {
      return ctx.answerCallbackQuery({ text: ctx.t("cb-request-not-found") });
    }

    if (txData.telegram_chat_id !== chatId) {
      return ctx.answerCallbackQuery({ text: ctx.t("cb-no-access") });
    }

    if (txData.result !== "waiting") {
      return ctx.answerCallbackQuery({ text: ctx.t("cb-already-processed") });
    }

    const now = new Date();
    if (new Date(txData.expires_at) < now) {
      await supabase
        .from("auth_transactions")
        .update({
          result: "deny",
          status: "timeout",
          status_msg: "Login timed out.",
          resolved_at: now.toISOString(),
        })
        .eq("txid", txid);

      if (txData.telegram_message_id) {
        const locale: string = ctx.from?.language_code || "en";
        const timeStr =
          now.toISOString().replace("T", " ").substring(11, 19) + " UTC";
        await editPushMessage(
          chatId,
          txData.telegram_message_id,
          t(locale, "push-result-timeout", { time: timeStr }),
        );
      }

      return ctx.answerCallbackQuery({ text: ctx.t("cb-expired") });
    }

    const timeStr =
      now.toISOString().replace("T", " ").substring(11, 19) + " UTC";

    if (action === "approve") {
      await supabase
        .from("auth_transactions")
        .update({
          result: "allow",
          status: "allow",
          status_msg: "Success. Logging you in...",
          resolved_at: now.toISOString(),
        })
        .eq("txid", txid);

      if (txData.telegram_message_id) {
        const locale: string = ctx.from?.language_code || "en";
        await editPushMessage(
          chatId,
          txData.telegram_message_id,
          t(locale, "push-result-approved", { time: timeStr }),
        );
      }

      await ctx.answerCallbackQuery({ text: ctx.t("cb-approved") });
    } else {
      await supabase
        .from("auth_transactions")
        .update({
          result: "deny",
          status: "deny",
          status_msg: "Login request denied.",
          resolved_at: now.toISOString(),
        })
        .eq("txid", txid);

      if (txData.telegram_message_id) {
        const locale: string = ctx.from?.language_code || "en";
        await editPushMessage(
          chatId,
          txData.telegram_message_id,
          t(locale, "push-result-denied", { time: timeStr }),
        );
      }

      await ctx.answerCallbackQuery({ text: ctx.t("cb-denied") });
    }

    console.log("Auth callback processed", { txid, action, chatId });
  } catch (err) {
    console.error("Error handling callback query", err);
    try {
      await ctx.answerCallbackQuery({ text: ctx.t("cb-error") });
    } catch {
      // ignore
    }
  }
}
