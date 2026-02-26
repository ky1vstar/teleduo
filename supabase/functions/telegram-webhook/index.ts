// ── Telegram Webhook Edge Function ────────────────────────────────────────────
// Receives Telegram Bot updates via Grammy webhookCallback inside Express.
// All paths prefixed with /telegram-webhook (the function name).
// ─────────────────────────────────────────────────────────────────────────────

import express from "express";
import { webhookCallback } from "grammy";

import { bot } from "../_shared/telegram/bot.ts";
import { i18n } from "../_shared/telegram/i18n.ts";
import { handleStartCommand } from "./handlers/commands.ts";
import { handleCallbackQuery } from "./handlers/callbacks.ts";
import { updateLocaleMiddleware } from "./handlers/localeUpdater.ts";

bot.use(i18n);
bot.use(updateLocaleMiddleware);
bot.command("start", handleStartCommand);
bot.on("callback_query:data", handleCallbackQuery);

const app = express();
app.use(express.json());
app.use("/telegram-webhook", webhookCallback(bot, "express"));

app.listen(3000);
