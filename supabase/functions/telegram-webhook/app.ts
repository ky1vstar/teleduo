// ── Telegram Webhook Edge Function ────────────────────────────────────────────
// Receives Telegram Bot updates via Grammy webhookCallback inside Express.
// All paths prefixed with /telegram-webhook (the function name).
// ─────────────────────────────────────────────────────────────────────────────

import express from "express";
import { webhookCallback } from "grammy";

import { bot } from "shared/telegram/bot.ts";
import { config } from "shared/config.ts";
import { i18n } from "shared/telegram/i18n.ts";
import { handleStartCommand } from "./handlers/commands.ts";
import { handleCallbackQuery } from "./handlers/callbacks.ts";
import { updateLocaleMiddleware } from "./handlers/localeUpdater.ts";

bot.use(i18n);
bot.use(updateLocaleMiddleware);
bot.command("start", handleStartCommand);
bot.on("callback_query:data", handleCallbackQuery);

const app = express();
app.use(express.json());
app.use("/telegram-webhook", webhookCallback(bot, "express", { secretToken: config.TELEGRAM_WEBHOOK_SECRET || undefined }));

export default app;
