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
import { supabase } from "shared/supabaseClient.ts";
import { generateRandomUsername } from "shared/helpers.ts";

const API_HOSTNAME = "api_hostname";
const TG_CHAT_ID = 2;

describe("telegram-webhook: /start command", () => {
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

  it("activates device with valid activation code", async () => {
    const username = generateRandomUsername();
    const enrollResp = await duoClient.jsonApiCallAsync(
      "POST",
      "/auth/v2/enroll",
      { username },
    );
    assertEquals(enrollResp.stat, "OK");

    const startArg = new URL(enrollResp.response.activation_url).searchParams
      .get("start");
    const message = tgClient.makeCommand(`/start ${startArg}`);
    await tgClient.sendMessage(message);
    await tgServer.waitBotMessage();

    const updates = await tgClient.getUpdates();
    assertEquals(
      updates.result.at(-1)!.message.text,
      t("en", "activation-success"),
    );

    // Verify device was created
    const { data: devices } = await supabase
      .from("devices")
      .select("*")
      .eq("user_id", enrollResp.response.user_id);
    assertEquals(devices!.length, 1);
    assertEquals(devices![0].telegram_chat_id, TG_CHAT_ID);
  });

  it("rejects expired activation code", async () => {
    const username = generateRandomUsername();
    const enrollResp = await duoClient.jsonApiCallAsync(
      "POST",
      "/auth/v2/enroll",
      { username, valid_secs: "1" },
    );
    assertEquals(enrollResp.stat, "OK");

    // Wait for expiration
    await new Promise((r) => setTimeout(r, 1500));

    const startArg = new URL(enrollResp.response.activation_url).searchParams
      .get("start");
    const message = tgClient.makeCommand(`/start ${startArg}`);
    await tgClient.sendMessage(message);
    await tgServer.waitBotMessage();

    const updates = await tgClient.getUpdates();
    assertEquals(
      updates.result.at(-1)!.message.text,
      t("en", "activation-invalid"),
    );
  });

  it("rejects already-used activation code", async () => {
    const username = generateRandomUsername();
    Deno.env.set("ENROLL_ALLOW_EXISTING", "true");
    try {
      const enrollResp = await duoClient.jsonApiCallAsync(
        "POST",
        "/auth/v2/enroll",
        { username },
      );

      const startArg = new URL(enrollResp.response.activation_url).searchParams
        .get("start");

      // First activation
      const msg1 = tgClient.makeCommand(`/start ${startArg}`);
      await tgClient.sendMessage(msg1);
      await tgServer.waitBotMessage();

      // Second activation with same code
      const msg2 = tgClient.makeCommand(`/start ${startArg}`);
      await tgClient.sendMessage(msg2);
      await tgServer.waitBotMessage();

      const updates = await tgClient.getUpdates();
      assertEquals(
        updates.result.at(-1)!.message.text,
        t("en", "activation-already-used"),
      );
    } finally {
      Deno.env.delete("ENROLL_ALLOW_EXISTING");
    }
  });

  it("replaces old device on re-enrollment", async () => {
    Deno.env.set("ENROLL_ALLOW_EXISTING", "true");
    try {
      const username = generateRandomUsername();

      // First enroll + activate
      const enroll1 = await duoClient.jsonApiCallAsync(
        "POST",
        "/auth/v2/enroll",
        { username },
      );
      const start1 = new URL(enroll1.response.activation_url).searchParams.get(
        "start",
      );
      await tgClient.sendMessage(tgClient.makeCommand(`/start ${start1}`));
      await tgServer.waitBotMessage();

      // Second enroll + activate
      const enroll2 = await duoClient.jsonApiCallAsync(
        "POST",
        "/auth/v2/enroll",
        { username },
      );
      const start2 = new URL(enroll2.response.activation_url).searchParams.get(
        "start",
      );
      await tgClient.sendMessage(tgClient.makeCommand(`/start ${start2}`));
      await tgServer.waitBotMessage();

      // Should have exactly one device (old one replaced)
      const { data: devices } = await supabase
        .from("devices")
        .select("*")
        .eq("user_id", enroll1.response.user_id);
      assertEquals(devices!.length, 1);
    } finally {
      Deno.env.delete("ENROLL_ALLOW_EXISTING");
    }
  });

  it("/start without code replies with welcome message", async () => {
    const message = tgClient.makeCommand("/start");
    await tgClient.sendMessage(message);
    await tgServer.waitBotMessage();

    const updates = await tgClient.getUpdates();
    assertEquals(updates.result.at(-1)!.message.text, t("en", "welcome"));
  });
});
