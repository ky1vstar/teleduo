const logger = require("firebase-functions/logger");
const { db } = require("../firebaseInit");

/**
 * Middleware that updates the stored locale for the user's device
 * whenever they interact with the bot (message, callback, etc.).
 * This keeps the locale in sync with the user's Telegram client language.
 */
async function updateLocaleMiddleware(ctx, next) {
  const chatId = ctx.chat?.id;
  const locale = ctx.from?.language_code;

  if (chatId && locale) {
    // Fire-and-forget: update locale on all devices linked to this chat
    db.collectionGroup("devices")
      .where("telegramChatId", "==", chatId)
      .get()
      .then((snap) => {
        const batch = db.batch();
        let changed = false;
        snap.forEach((doc) => {
          if (doc.data().locale !== locale) {
            batch.update(doc.ref, { locale });
            changed = true;
          }
        });
        if (changed) {
          return batch.commit();
        }
      })
      .catch((err) => {
        logger.warn("Failed to update device locale", { chatId, locale, error: err.message });
      });
  }

  await next();
}

module.exports = { updateLocaleMiddleware };
