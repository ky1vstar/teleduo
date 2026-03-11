import "../shared/setupTestEnv.ts";
import { assertEquals, assertMatch } from "jsr:@std/assert@1";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
} from "jsr:@std/testing@1/bdd";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { createHttpsInterceptor } from "../shared/httpsInterceptor.ts";
import { createDuoClient, DuoClient } from "../shared/duoClient.ts";
import { default as authApp } from "../../auth/app.ts";
import { default as webhookApp } from "../../telegram-webhook/app.ts";
import { handlePortalEnroll } from "../../frame/routes/portalEnroll.ts";
import { TelegramClient, TelegramServer } from "../shared/telegramTestApi.ts";
import { bot } from "shared/telegram/bot.ts";
import { config } from "shared/config.ts";
import { generateRandomUsername } from "shared/helpers.ts";

const API_HOSTNAME = "api_hostname";

describe("e2e: portal enroll flow", { sanitizeOps: false, sanitizeResources: false }, () => {
  let interceptor: AsyncDisposable;
  let duoClient: DuoClient;
  let tgServer: TelegramServer;
  let tgClient: TelegramClient;
  let frameServer: http.Server;
  let frameBaseUrl: string;

  beforeAll(async () => {
    interceptor = await createHttpsInterceptor(API_HOSTNAME, authApp);

    const frameApp = express();
    frameApp.get("/frame/portal/v4/enroll", handlePortalEnroll);
    frameServer = http.createServer(frameApp);
    await new Promise<void>((resolve) => frameServer.listen(0, resolve));
    const port = (frameServer.address() as AddressInfo).port;
    frameBaseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await interceptor[Symbol.asyncDispose]();
    await new Promise<void>((resolve, reject) =>
      frameServer.close((err) => (err ? reject(err) : resolve()))
    );
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

  it("preauth (new user) → portal enroll → telegram activate → preauth returns auth", async () => {
    const username = generateRandomUsername();

    // 1. Preauth for unknown user → enroll_portal_url
    const preauthResp = await duoClient.jsonApiCallAsync(
      "POST",
      "/auth/v2/preauth",
      { username },
    );
    assertEquals(preauthResp.stat, "OK");
    assertEquals(preauthResp.response.result, "enroll");
    const portalUrl: string = preauthResp.response.enroll_portal_url;

    // Extract code from portal URL
    const portalCode = new URL(portalUrl).searchParams.get("code")!;

    // 2. Visit portal enroll — should redirect to Telegram
    const portalResp = await fetch(
      `${frameBaseUrl}/frame/portal/v4/enroll?code=${portalCode}`,
      { redirect: "manual" },
    );
    assertEquals(portalResp.status, 302);
    const tgUrl = portalResp.headers.get("location")!;
    assertMatch(tgUrl, /^https:\/\/t\.me\//);

    // Parse activation code from Telegram deep link
    const startArg = new URL(tgUrl).searchParams.get("start")!;

    // 3. Activate via Telegram
    await tgClient.sendMessage(tgClient.makeCommand(`/start ${startArg}`));
    await tgServer.waitBotMessage();

    // 4. Preauth again → should now return "auth" with devices
    const preauth2 = await duoClient.jsonApiCallAsync(
      "POST",
      "/auth/v2/preauth",
      { username },
    );
    assertEquals(preauth2.stat, "OK");
    assertEquals(preauth2.response.result, "auth");
    assertEquals(preauth2.response.devices.length, 1);
  });
});
