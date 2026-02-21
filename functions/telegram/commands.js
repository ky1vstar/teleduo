const logger = require("firebase-functions/logger");
const { db } = require("../firebaseInit");
const { generateDeviceId } = require("../helpers");

/**
 * Handle /start <activation_code> command from Telegram.
 * Links a Telegram chat to a user via the enrollment activation code.
 */
async function handleStartCommand(ctx) {
  try {
    const payload = ctx.match; // grammy extracts the payload after /start
    if (!payload) {
      return ctx.reply(ctx.t("welcome"));
    }

    const activationCode = payload;
    const chatId = ctx.chat.id;
    const telegramUsername = ctx.from.username || "";

    // Find enrollment document
    const enrollDoc = await db.collection("enrollments").doc(activationCode).get();

    if (!enrollDoc.exists) {
      return ctx.reply(ctx.t("activation-invalid"));
    }

    const data = enrollDoc.data();

    // Check expiration
    const now = new Date();
    if (data.expiresAt && data.expiresAt.toDate() < now) {
      return ctx.reply(ctx.t("activation-invalid"));
    }

    // Check if already used
    if (data.status === "success") {
      return ctx.reply(ctx.t("activation-already-used"));
    }

    const userId = data.userId;
    const username = data.username;

    // Create device in subcollection
    const deviceId = generateDeviceId();
    const displayName = telegramUsername
      ? `Telegram (@${telegramUsername})`
      : "Telegram";

    await db
      .collection("users")
      .doc(userId)
      .collection("devices")
      .doc(deviceId)
      .set({
        type: "phone",
        name: "Telegram",
        displayName,
        telegramChatId: chatId,
        telegramUsername,
        locale: ctx.from.language_code || "en",
        createdAt: new Date(),
        lastUsedAt: new Date(),
      });

    // Update enrollment status
    await db.collection("enrollments").doc(activationCode).update({
      status: "success",
    });

    logger.info("Device enrolled via Telegram", {
      userId,
      username,
      deviceId,
      chatId,
      telegramUsername,
    });

    return ctx.reply(ctx.t("activation-success"));
  } catch (err) {
    logger.error("Error handling /start command", err);
    return ctx.reply(ctx.t("cb-error"));
  }
}

module.exports = { handleStartCommand };
