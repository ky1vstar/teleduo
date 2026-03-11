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

const API_HOSTNAME = "api_hostname";
const TG_CHAT_ID = 2;

describe("/auth/v2/auth", { sanitizeOps: false, sanitizeResources: false }, () => {
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

  it("returns error when factor is missing", async () => {
    const user = await createTestUser();
    await createTestDevice(user.id);

    const resp = await duoClient.jsonApiCallAsync("POST", "/auth/v2/auth", {
      user_id: user.id,
    });
    assertEquals(resp.stat, "FAIL");
    assertEquals(resp.message_detail, "factor");
  });

  it("returns error for unsupported factor", async () => {
    const user = await createTestUser();
    await createTestDevice(user.id);

    const resp = await duoClient.jsonApiCallAsync("POST", "/auth/v2/auth", {
      user_id: user.id,
      factor: "sms",
    });
    assertEquals(resp.stat, "FAIL");
  });

  it("returns error for unknown user", async () => {
    const resp = await duoClient.jsonApiCallAsync("POST", "/auth/v2/auth", {
      username: "nonexistent_user_xyz_" + Date.now(),
      factor: "push",
    });
    assertEquals(resp.stat, "FAIL");
  });

  it("returns error when user has no device", async () => {
    const user = await createTestUser();

    const resp = await duoClient.jsonApiCallAsync("POST", "/auth/v2/auth", {
      user_id: user.id,
      factor: "push",
    });
    assertEquals(resp.stat, "FAIL");
    assertEquals(resp.message_detail, "no capable device");
  });

  it("returns 'allow' for bypass user", async () => {
    const user = await createTestUser({ status: "bypass" });
    await createTestDevice(user.id);

    const resp = await duoClient.jsonApiCallAsync("POST", "/auth/v2/auth", {
      user_id: user.id,
      factor: "push",
    });
    assertEquals(resp.stat, "OK");
    assertEquals(resp.response.result, "allow");
    assertEquals(resp.response.status, "bypass");
  });

  it("returns 'deny' for disabled user", async () => {
    const user = await createTestUser({ status: "disabled" });
    await createTestDevice(user.id);

    const resp = await duoClient.jsonApiCallAsync("POST", "/auth/v2/auth", {
      user_id: user.id,
      factor: "push",
    });
    assertEquals(resp.stat, "OK");
    assertEquals(resp.response.result, "deny");
  });

  it("sends push and returns 'allow' when user approves (async mode)", async () => {
    const user = await createTestUser();
    const device = await createTestDevice(user.id, {
      telegramChatId: TG_CHAT_ID,
    });

    // Use async mode so we can interact between request and response
    const botMsgP = tgServer.waitBotMessage();
    const authResp = await duoClient.jsonApiCallAsync("POST", "/auth/v2/auth", {
      user_id: user.id,
      factor: "push",
      device: device.id,
      async: "1",
    });
    assertEquals(authResp.stat, "OK");
    assertEquals(typeof authResp.response.txid, "string");

    // Wait for Telegram push message
    await botMsgP;

    const updates = await tgClient.getUpdates();
    const pushMsg = updates.result.find(
      (u) => u.message?.reply_markup?.inline_keyboard,
    );
    const approveBtn = pushMsg!.message.reply_markup.inline_keyboard[0][0];

    // Click "Approve" button
    const editP = tgServer.waitBotEdits();
    await tgClient.sendCallback(tgClient.makeCallbackQuery(approveBtn.callback_data));
    await editP;

    // Check auth_status
    const statusResp = await duoClient.jsonApiCallAsync(
      "GET",
      "/auth/v2/auth_status",
      { txid: authResp.response.txid },
    );
    assertEquals(statusResp.stat, "OK");
    assertEquals(statusResp.response.result, "allow");
  });

  it("sends push and returns 'deny' when user denies (async mode)", async () => {
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

  it("works with factor=auto", async () => {
    const user = await createTestUser();
    const device = await createTestDevice(user.id, {
      telegramChatId: TG_CHAT_ID,
    });

    const botMsgP = tgServer.waitBotMessage();
    const authResp = await duoClient.jsonApiCallAsync("POST", "/auth/v2/auth", {
      user_id: user.id,
      factor: "auto",
      device: device.id,
      async: "1",
    });
    assertEquals(authResp.stat, "OK");
    assertEquals(typeof authResp.response.txid, "string");

    // Push message should still arrive
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

  it("resolves user by username", async () => {
    const user = await createTestUser();
    await createTestDevice(user.id, {
      telegramChatId: TG_CHAT_ID,
    });

    const authResp = await duoClient.jsonApiCallAsync("POST", "/auth/v2/auth", {
      username: user.username,
      factor: "push",
      async: "1",
    });
    assertEquals(authResp.stat, "OK");
    assertEquals(typeof authResp.response.txid, "string");
  });
});
