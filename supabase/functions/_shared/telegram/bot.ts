import { Bot } from "grammy";
import { config } from "../config.ts";
import { t, MyContext } from "./i18n.ts";

// ── Bot initialization ──────────────────────────────────────────────────────

export const bot = new Bot<MyContext>(config.TELEGRAM_BOT_TOKEN, {
  client: {
    environment: config.TELEGRAM_ENVIRONMENT,
  }
});

// ── Cached bot username (from getMe) ─────────────────────────────────────────

let _botUsername: string | null = null;

export async function getBotUsername(): Promise<string> {
  if (!_botUsername) {
    const me = await bot.api.getMe();
    _botUsername = me.username;
    console.log("Bot username resolved", { username: _botUsername });
  }
  return _botUsername!;
}

// ── Send push authentication message ─────────────────────────────────────────

export async function sendPushMessage(
  chatId: number,
  text: string,
  txid: string,
  locale = "en",
): Promise<number> {
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

/** Send a plain text message to a Telegram chat. */
export async function sendPlainMessage(
  chatId: number,
  text: string,
): Promise<void> {
  try {
    await bot.api.sendMessage(chatId, text);
  } catch (err) {
    console.warn("Failed to send Telegram message", {
      chatId,
      error: (err as Error).message,
    });
  }
}

/** Edit a Telegram message (remove buttons, show result). */
export async function editPushMessage(
  chatId: number,
  messageId: number,
  text: string,
): Promise<void> {
  try {
    await bot.api.editMessageText(chatId, messageId, text, {
      parse_mode: "HTML",
    });
  } catch (err) {
    console.warn("Failed to edit Telegram message", {
      chatId,
      messageId,
      error: (err as Error).message,
    });
  }
}
