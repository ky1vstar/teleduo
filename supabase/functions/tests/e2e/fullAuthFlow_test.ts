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
import { default as authApp } from "../../auth/app.ts";
import { default as webhookApp } from "../../telegram-webhook/app.ts";
import { TelegramClient, TelegramServer } from "../shared/telegramTestApi.ts";
import { bot } from "shared/telegram/bot.ts";
import { config } from "shared/config.ts";
import { generateRandomUsername } from "shared/helpers.ts";

const API_HOSTNAME = "api_hostname";

describe("e2e: full auth flow", { sanitizeOps: false, sanitizeResources: false }, () => {
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

    tgClient = tgServer.getClient(bot.token);
  });

  afterEach(async () => {
    await tgServer.stop();
  });

  it("enroll → activate → preauth → push auth → approve → auth_status", async () => {
    const username = generateRandomUsername();

    // 1. Enroll
    const enrollResp = await duoClient.jsonApiCallAsync(
      "POST",
      "/auth/v2/enroll",
      { username },
    );
    assertEquals(enrollResp.stat, "OK");
    const userId = enrollResp.response.user_id;

    // 2. Activate via Telegram
    const startArg = new URL(enrollResp.response.activation_url).searchParams
      .get("start");
    await tgClient.sendMessage(tgClient.makeCommand(`/start ${startArg}`));
    await tgServer.waitBotMessage();

    // 3. Verify enroll_status = success
    const enrollStatusResp = await duoClient.jsonApiCallAsync(
      "POST",
      "/auth/v2/enroll_status",
      {
        user_id: userId,
        activation_code: enrollResp.response.activation_code,
      },
    );
    assertEquals(enrollStatusResp.response, "success");

    // 4. Preauth — should return "auth" with device list
    const preauthResp = await duoClient.jsonApiCallAsync(
      "POST",
      "/auth/v2/preauth",
      { username },
    );
    assertEquals(preauthResp.stat, "OK");
    assertEquals(preauthResp.response.result, "auth");
    assertEquals(preauthResp.response.devices.length, 1);
    const deviceId = preauthResp.response.devices[0].device;

    // 5. Auth (push, async mode)
    const botMsgP = tgServer.waitBotMessage();
    const authResp = await duoClient.jsonApiCallAsync(
      "POST",
      "/auth/v2/auth",
      {
        user_id: userId,
        factor: "push",
        device: deviceId,
        async: "1",
      },
    );
    assertEquals(authResp.stat, "OK");
    const txid = authResp.response.txid;

    // 6. Wait for Telegram push and approve
    await botMsgP;

    const updates = await tgClient.getUpdates();
    const pushMsg = updates.result.find(
      (u) => u.message?.reply_markup?.inline_keyboard,
    );
    const approveBtn = pushMsg!.message.reply_markup.inline_keyboard[0][0];
    const editP = tgServer.waitBotEdits();
    await tgClient.sendCallback(tgClient.makeCallbackQuery(approveBtn.callback_data));
    await editP;

    // 7. Verify auth_status = allow
    const authStatusResp = await duoClient.jsonApiCallAsync(
      "GET",
      "/auth/v2/auth_status",
      { txid },
    );
    assertEquals(authStatusResp.stat, "OK");
    assertEquals(authStatusResp.response.result, "allow");
    assertEquals(authStatusResp.response.status, "allow");
  });

  it("enroll → activate → push auth → deny", async () => {
    const username = generateRandomUsername();

    // Enroll
    const enrollResp = await duoClient.jsonApiCallAsync(
      "POST",
      "/auth/v2/enroll",
      { username },
    );
    const userId = enrollResp.response.user_id;

    // Activate
    const startArg = new URL(enrollResp.response.activation_url).searchParams
      .get("start");
    await tgClient.sendMessage(tgClient.makeCommand(`/start ${startArg}`));
    await tgServer.waitBotMessage();

    // Preauth to get device
    const preauthResp = await duoClient.jsonApiCallAsync(
      "POST",
      "/auth/v2/preauth",
      { username },
    );
    const deviceId = preauthResp.response.devices[0].device;

    // Auth push
    const botMsgP = tgServer.waitBotMessage();
    const authResp = await duoClient.jsonApiCallAsync(
      "POST",
      "/auth/v2/auth",
      {
        user_id: userId,
        factor: "push",
        device: deviceId,
        async: "1",
      },
    );

    await botMsgP;

    const updates = await tgClient.getUpdates();
    const pushMsg = updates.result.find(
      (u) => u.message?.reply_markup?.inline_keyboard,
    );
    const denyBtn = pushMsg!.message.reply_markup.inline_keyboard[0][1];
    const editP = tgServer.waitBotEdits();
    await tgClient.sendCallback(tgClient.makeCallbackQuery(denyBtn.callback_data));
    await editP;

    // auth_status = deny
    const statusResp = await duoClient.jsonApiCallAsync(
      "GET",
      "/auth/v2/auth_status",
      { txid: authResp.response.txid },
    );
    assertEquals(statusResp.stat, "OK");
    assertEquals(statusResp.response.result, "deny");
  });
});
