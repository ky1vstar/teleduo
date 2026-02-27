// ── Telegram Webhook Edge Function ────────────────────────────────────────────
// Receives Telegram Bot updates via Grammy webhookCallback inside Express.
// All paths prefixed with /telegram-webhook (the function name).
// ─────────────────────────────────────────────────────────────────────────────

import express from "express";
import { webhookCallback } from "grammy";
import type { Request, Response, NextFunction } from "express";

import { bot } from "../_shared/telegram/bot.ts";
import { TELEGRAM_WEBHOOK_SECRET } from "../_shared/config.ts";
import { i18n } from "../_shared/telegram/i18n.ts";
import { handleStartCommand } from "./handlers/commands.ts";
import { handleCallbackQuery } from "./handlers/callbacks.ts";
import { updateLocaleMiddleware } from "./handlers/localeUpdater.ts";

bot.use(i18n);
bot.use(updateLocaleMiddleware);
bot.command("start", handleStartCommand);
bot.on("callback_query:data", handleCallbackQuery);

/** Verify the X-Telegram-Bot-Api-Secret-Token header matches our secret. */
function verifySecretToken(req: Request, res: Response, next: NextFunction) {
  if (TELEGRAM_WEBHOOK_SECRET) {
    const header = req.header("X-Telegram-Bot-Api-Secret-Token");
    if (header !== TELEGRAM_WEBHOOK_SECRET) {
      res.status(403).json({ error: "Invalid secret token" });
      return;
    }
  }
  next();
}

const app = express();
app.use(express.json());
app.use("/telegram-webhook", verifySecretToken, webhookCallback(bot, "express"));

app.listen(3000);
