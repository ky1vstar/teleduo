import "../shared/setupTestEnv.ts";
import { assertEquals } from "jsr:@std/assert@1";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
} from "jsr:@std/testing@1/bdd";
import { createHttpsInterceptor } from "../shared/httpsInterceptor.ts";
import { createDuoClient, DuoClient } from "../shared/duoClient.ts";
import { createTestUser, createTestDevice } from "../shared/testData.ts";
import { default as authApp } from "../../auth/app.ts";
import { default as webhookApp } from "../../telegram-webhook/app.ts";
import { TelegramClient, TelegramServer } from "../shared/telegramTestApi.ts";
import { bot } from "shared/telegram/bot.ts";
import { config } from "shared/config.ts";
import { supabase } from "shared/supabaseClient.ts";

const API_HOSTNAME = "api_hostname";
const TG_CHAT_ID = 2;

describe("/auth/v2/auth_status", { sanitizeOps: false, sanitizeResources: false }, () => {
  let interceptor: AsyncDisposable;
  let duoClient: DuoClient;
  let tgServer: TelegramServer;
  let tgClient: TelegramClient;

  beforeAll(async () => {
    interceptor = await createHttpsInterceptor(API_HOSTNAME, authApp);
  });

  afterAll(async () => {
    await interceptor[Symbol.asyncDispose]();
  });

  beforeEach(async () => {
    duoClient = createDuoClient(
      config.AUTH_IKEY,
      config.AUTH_SKEY,
      API_HOSTNAME,
    );

    tgServer = new TelegramServer();
    tgServer.bindBot(bot);
    tgServer.setWebhook(
      { handler: webhookApp, path: "/telegram-webhook" },
      bot.token,
    );
    await tgServer.start();

    tgClient = tgServer.getClient(bot.token, { chatId: TG_CHAT_ID });
  });

  afterEach(async () => {
    await tgServer.stop();
  });

  it("returns error for missing txid", async () => {
    const resp = await duoClient.jsonApiCallAsync(
      "GET",
      "/auth/v2/auth_status",
      {},
    );
    assertEquals(resp.stat, "FAIL");
    assertEquals(resp.message_detail, "txid");
  });

  it("returns error for invalid txid", async () => {
    const resp = await duoClient.jsonApiCallAsync(
      "GET",
      "/auth/v2/auth_status",
      { txid: "nonexistent-txid-000" },
    );
    assertEquals(resp.stat, "FAIL");
    assertEquals(resp.message_detail, "Invalid txid");
  });

  it("returns 'waiting' for a pending transaction", async () => {
    const user = await createTestUser();
    const device = await createTestDevice(user.id, {
      telegramChatId: TG_CHAT_ID,
    });

    const botMsgP = tgServer.waitBotMessage();
    const authResp = await duoClient.jsonApiCallAsync("POST", "/auth/v2/auth", {
      user_id: user.id,
      factor: "push",
      device: device.id,
      async: "1",
    });
    assertEquals(authResp.stat, "OK");

    await botMsgP;

    const statusResp = await duoClient.jsonApiCallAsync(
      "GET",
      "/auth/v2/auth_status",
      { txid: authResp.response.txid },
    );
    assertEquals(statusResp.stat, "OK");
    assertEquals(statusResp.response.result, "waiting");
  });

  it("returns 'allow' after approval", async () => {
    const user = await createTestUser();
    const device = await createTestDevice(user.id, {
      telegramChatId: TG_CHAT_ID,
    });

    const botMsgP = tgServer.waitBotMessage();
    const authResp = await duoClient.jsonApiCallAsync("POST", "/auth/v2/auth", {
      user_id: user.id,
      factor: "push",
      device: device.id,
      async: "1",
    });
    assertEquals(authResp.stat, "OK");

    await botMsgP;

    const updates = await tgClient.getUpdates();
    const pushMsg = updates.result.find(
      (u) => u.message?.reply_markup?.inline_keyboard,
    );
    const approveBtn = pushMsg!.message.reply_markup.inline_keyboard[0][0];
    const editP = tgServer.waitBotEdits();
    await tgClient.sendCallback(tgClient.makeCallbackQuery(approveBtn.callback_data));
    await editP;

    const statusResp = await duoClient.jsonApiCallAsync(
      "GET",
      "/auth/v2/auth_status",
      { txid: authResp.response.txid },
    );
    assertEquals(statusResp.stat, "OK");
    assertEquals(statusResp.response.result, "allow");
  });

  it("returns 'deny' after denial", async () => {
    const user = await createTestUser();
    const device = await createTestDevice(user.id, {
      telegramChatId: TG_CHAT_ID,
    });

    const botMsgP = tgServer.waitBotMessage();
    const authResp = await duoClient.jsonApiCallAsync("POST", "/auth/v2/auth", {
      user_id: user.id,
      factor: "push",
      device: device.id,
      async: "1",
    });

    await botMsgP;

    const updates = await tgClient.getUpdates();
    const pushMsg = updates.result.find(
      (u) => u.message?.reply_markup?.inline_keyboard,
    );
    const denyBtn = pushMsg!.message.reply_markup.inline_keyboard[0][1];
    const editP = tgServer.waitBotEdits();
    await tgClient.sendCallback(tgClient.makeCallbackQuery(denyBtn.callback_data));
    await editP;

    const statusResp = await duoClient.jsonApiCallAsync(
      "GET",
      "/auth/v2/auth_status",
      { txid: authResp.response.txid },
    );
    assertEquals(statusResp.stat, "OK");
    assertEquals(statusResp.response.result, "deny");
  });

  it("returns 'timeout' for expired transaction", async () => {
    const user = await createTestUser();
    const device = await createTestDevice(user.id, {
      telegramChatId: TG_CHAT_ID,
    });

    const botMsgP = tgServer.waitBotMessage();
    const authResp = await duoClient.jsonApiCallAsync("POST", "/auth/v2/auth", {
      user_id: user.id,
      factor: "push",
      device: device.id,
      async: "1",
    });
    assertEquals(authResp.stat, "OK");

    await botMsgP;

    // Manually expire the transaction in the database
    await supabase
      .from("auth_transactions")
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq("txid", authResp.response.txid);

    const statusResp = await duoClient.jsonApiCallAsync(
      "GET",
      "/auth/v2/auth_status",
      { txid: authResp.response.txid },
    );
    assertEquals(statusResp.stat, "OK");
    assertEquals(statusResp.response.result, "deny");
    assertEquals(statusResp.response.status, "timeout");
  });
});
