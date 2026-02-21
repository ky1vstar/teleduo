const express = require("express");
const { webhookCallback } = require("grammy");
const { getBot } = require("./bot");
const { i18n } = require("./i18n");
const { updateLocaleMiddleware } = require("./localeUpdater");
const { handleStartCommand } = require("./commands");
const { handleCallbackQuery } = require("./callbacks");

/**
 * Create an Express app for the Telegram webhook.
 * Uses grammy's webhookCallback for Express integration.
 * Bot initialization is deferred to first request (lazy).
 */
function createTelegramWebhookApp() {
  const app = express();

  let _webhookMiddleware = null;

  app.use((req, res, next) => {
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

  return app;
}

module.exports = { createTelegramWebhookApp };
