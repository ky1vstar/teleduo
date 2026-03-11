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

describe("telegram-webhook: callback queries", { sanitizeOps: false, sanitizeResources: false }, () => {
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

  /** Helper: create user+device, initiate push auth, return txid and push message. */
  async function initiatePush() {
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

    return {
      user,
      device,
      txid: authResp.response.txid as string,
      approveData: pushMsg!.message.reply_markup.inline_keyboard[0][0]
        .callback_data as string,
      denyData: pushMsg!.message.reply_markup.inline_keyboard[0][1]
        .callback_data as string,
    };
  }

  it("approve callback sets transaction to 'allow'", async () => {
    const { txid, approveData } = await initiatePush();

    const editP = tgServer.waitBotEdits();
    await tgClient.sendCallback(tgClient.makeCallbackQuery(approveData));
    await editP;

    const { data: tx } = await supabase
      .from("auth_transactions")
      .select("result, status")
      .eq("txid", txid)
      .single();
    assertEquals(tx!.result, "allow");
    assertEquals(tx!.status, "allow");
  });

  it("deny callback sets transaction to 'deny'", async () => {
    const { txid, denyData } = await initiatePush();

    const editP = tgServer.waitBotEdits();
    await tgClient.sendCallback(tgClient.makeCallbackQuery(denyData));
    await editP;

    const { data: tx } = await supabase
      .from("auth_transactions")
      .select("result, status")
      .eq("txid", txid)
      .single();
    assertEquals(tx!.result, "deny");
    assertEquals(tx!.status, "deny");
  });

  it("double-click on already-processed transaction does nothing", async () => {
    const { txid, approveData } = await initiatePush();

    // First click
    const editP = tgServer.waitBotEdits();
    await tgClient.sendCallback(tgClient.makeCallbackQuery(approveData));
    await editP;

    // Second click — only answerCallbackQuery, no message edit
    await tgClient.sendCallback(tgClient.makeCallbackQuery(approveData));
    await new Promise(r => setTimeout(r, 500));

    const { data: tx } = await supabase
      .from("auth_transactions")
      .select("result")
      .eq("txid", txid)
      .single();
    assertEquals(tx!.result, "allow");
  });

  it("callback on expired transaction sets timeout", async () => {
    const { txid, approveData } = await initiatePush();

    // Expire the transaction manually
    await supabase
      .from("auth_transactions")
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq("txid", txid);

    const editP = tgServer.waitBotEdits();
    await tgClient.sendCallback(tgClient.makeCallbackQuery(approveData));
    await editP;

    const { data: tx } = await supabase
      .from("auth_transactions")
      .select("result, status")
      .eq("txid", txid)
      .single();
    assertEquals(tx!.result, "deny");
    assertEquals(tx!.status, "timeout");
  });
});
