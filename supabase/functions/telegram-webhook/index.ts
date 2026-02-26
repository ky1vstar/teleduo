// ── Telegram Webhook Edge Function ────────────────────────────────────────────
// Receives Telegram Bot updates via Grammy webhookCallback inside Express.
// All paths prefixed with /telegram-webhook (the function name).
// ─────────────────────────────────────────────────────────────────────────────

import express from "express";
import { webhookCallback } from "grammy";

import { getBot } from "../_shared/telegram/bot.ts";
import { i18n } from "../_shared/telegram/i18n.ts";
import { handleStartCommand } from "./handlers/commands.ts";
import { handleCallbackQuery } from "./handlers/callbacks.ts";
import { updateLocaleMiddleware } from "./handlers/localeUpdater.ts";

const app = express();
app.use(express.json());

// deno-lint-ignore no-explicit-any
let _webhookMiddleware: any = null;

// deno-lint-ignore no-explicit-any
app.use("/telegram-webhook", (req: any, res: any, next: any) => {
  if (!_webhookMiddleware) {
    const bot = getBot();
    bot.use(i18n);
    bot.use(updateLocaleMiddleware);
    bot.command("start", handleStartCommand);
    bot.on("callback_query:data", handleCallbackQuery);
    _webhookMiddleware = webhookCallback(bot, "express");
  }
  _webhookMiddleware(req, res, next);
});

app.listen(3000);
