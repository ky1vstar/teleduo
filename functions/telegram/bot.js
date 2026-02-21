const { Bot } = require("grammy");
const logger = require("firebase-functions/logger");
const { TELEGRAM_BOT_TOKEN } = require("../config");
const { t } = require("./i18n");

// ── Lazy Bot initialization ──────────────────────────────────────────────────

let _bot = null;

function getBot() {
  if (!_bot) {
    _bot = new Bot(TELEGRAM_BOT_TOKEN.value());
  }
  return _bot;
}

// ── Cached bot username (from getMe) ─────────────────────────────────────────

let _botUsername = null;

async function getBotUsername() {
  if (!_botUsername) {
    const bot = getBot();
    const me = await bot.api.getMe();
    _botUsername = me.username;
    logger.info("Bot username resolved", { username: _botUsername });
  }
  return _botUsername;
}

// ── Send push authentication message ─────────────────────────────────────────

/**
 * Send a push authentication message to a Telegram chat with Approve/Deny buttons.
 * @param {number} chatId - Telegram chat ID
 * @param {string} text - Message text
 * @param {string} txid - Transaction ID for callback data
 * @returns {number} Message ID of the sent message
 */
async function sendPushMessage(chatId, text, txid, locale = "en") {
  const bot = getBot();
  const result = await bot.api.sendMessage(chatId, text, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          { text: t(locale, "btn-approve"), callback_data: `approve:${txid}` },
          { text: t(locale, "btn-deny"), callback_data: `deny:${txid}` },
        ],
      ],
    },
  });
  return result.message_id;
}

/**
 * Edit a Telegram message (remove buttons, show result).
 */
async function editPushMessage(chatId, messageId, text) {
  const bot = getBot();
  try {
    await bot.api.editMessageText(chatId, messageId, text, {
      parse_mode: "HTML",
    });
  } catch (err) {
    logger.warn("Failed to edit Telegram message", { chatId, messageId, error: err.message });
  }
}

module.exports = { getBot, getBotUsername, sendPushMessage, editPushMessage };
