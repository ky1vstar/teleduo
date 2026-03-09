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
import { t } from "shared/telegram/i18n.ts";
import { config } from "shared/config.ts";

const API_HOSTNAME = "api_hostname";

describe("/auth/v2/enroll", () => {
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

  it("enrolls user and receives Telegram message with activation success", async () => {
    const enrollResp = await duoClient.jsonApiCallAsync(
      "POST",
      "/auth/v2/enroll",
      {},
    );
    assertEquals(enrollResp.stat, "OK");

    const startArg = new URL(enrollResp.response.activation_url).searchParams
      .get("start");
    const message = tgClient.makeCommand(`/start ${startArg}`);
    await tgClient.sendMessage(message);

    await tgServer.waitBotMessage();

    const updates = await tgClient.getUpdates();
    assertEquals(updates.result[0].message.text, t("en", "activation-success"));

    const enrollStatusResp = await duoClient.jsonApiCallAsync(
      "POST",
      "/auth/v2/enroll_status",
      {
        activation_code: enrollResp.response.activation_code,
        user_id: enrollResp.response.user_id,
      },
    );
    assertEquals(enrollStatusResp.response, "success");
  });
});
