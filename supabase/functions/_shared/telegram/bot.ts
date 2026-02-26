import { Bot } from "grammy";
import { TELEGRAM_BOT_TOKEN } from "../config.ts";
import { t, MyContext } from "./i18n.ts";

// ── Lazy Bot initialization ──────────────────────────────────────────────────

let _bot: Bot<MyContext> | null = null;

export function getBot(): Bot<MyContext> {
  if (!_bot) {
    _bot = new Bot(TELEGRAM_BOT_TOKEN);
  }
  return _bot;
}

// ── Cached bot username (from getMe) ─────────────────────────────────────────

let _botUsername: string | null = null;

export async function getBotUsername(): Promise<string> {
  if (!_botUsername) {
    const bot = getBot();
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

/** Edit a Telegram message (remove buttons, show result). */
export async function editPushMessage(
  chatId: number,
  messageId: number,
  text: string,
): Promise<void> {
  const bot = getBot();
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
