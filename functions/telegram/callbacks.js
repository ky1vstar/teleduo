const logger = require("firebase-functions/logger");
const { db } = require("../firebaseInit");
const { editPushMessage } = require("./bot");
const { t } = require("./i18n");

/**
 * Handle inline button callback queries (Approve / Deny).
 */
async function handleCallbackQuery(ctx) {
  try {
    const data = ctx.callbackQuery.data;
    if (!data) return;

    const [action, txid] = data.split(":");
    if (!txid || (action !== "approve" && action !== "deny")) {
      return ctx.answerCallbackQuery({ text: ctx.t("cb-invalid-action") });
    }

    const chatId = ctx.chat.id;

    // Read transaction
    const txRef = db.collection("auth_transactions").doc(txid);
    const txDoc = await txRef.get();

    if (!txDoc.exists) {
      return ctx.answerCallbackQuery({ text: ctx.t("cb-request-not-found") });
    }

    const txData = txDoc.data();

    // Verify chat ID matches (security check)
    if (txData.telegramChatId !== chatId) {
      return ctx.answerCallbackQuery({ text: ctx.t("cb-no-access") });
    }

    // Check if already resolved
    if (txData.result !== "waiting") {
      return ctx.answerCallbackQuery({ text: ctx.t("cb-already-processed") });
    }

    // Check if expired
    const now = new Date();
    if (txData.expiresAt && txData.expiresAt.toDate() < now) {
      await txRef.update({
        result: "deny",
        status: "timeout",
        statusMsg: "Login timed out.",
        resolvedAt: now,
      });

      // Edit Telegram message to show timeout
      if (txData.telegramMessageId) {
        const locale = ctx.from?.language_code || "en";
        const timeStr = now.toISOString().replace("T", " ").substring(11, 19) + " UTC";
        await editPushMessage(chatId, txData.telegramMessageId, t(locale, "push-result-timeout", { time: timeStr }));
      }

      return ctx.answerCallbackQuery({ text: ctx.t("cb-expired") });
    }

    const timeStr = now.toISOString().replace("T", " ").substring(11, 19) + " UTC";

    if (action === "approve") {
      await txRef.update({
        result: "allow",
        status: "allow",
        statusMsg: "Success. Logging you in...",
        resolvedAt: now,
      });

      // Edit Telegram message
      if (txData.telegramMessageId) {
        const locale = ctx.from?.language_code || "en";
        await editPushMessage(chatId, txData.telegramMessageId, t(locale, "push-result-approved", { time: timeStr }));
      }

      await ctx.answerCallbackQuery({ text: ctx.t("cb-approved") });
    } else {
      // deny
      await txRef.update({
        result: "deny",
        status: "deny",
        statusMsg: "Login request denied.",
        resolvedAt: now,
      });

      // Edit Telegram message
      if (txData.telegramMessageId) {
        const locale = ctx.from?.language_code || "en";
        await editPushMessage(chatId, txData.telegramMessageId, t(locale, "push-result-denied", { time: timeStr }));
      }

      await ctx.answerCallbackQuery({ text: ctx.t("cb-denied") });
    }

    logger.info("Auth callback processed", { txid, action, chatId });
  } catch (err) {
    logger.error("Error handling callback query", err);
    try {
      await ctx.answerCallbackQuery({ text: ctx.t("cb-error") });
    } catch {
      // ignore
    }
  }
}

module.exports = { handleCallbackQuery };
