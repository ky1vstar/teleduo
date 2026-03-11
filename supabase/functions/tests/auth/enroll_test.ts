import "../shared/setupTestEnv.ts";
import { assertEquals, assertExists, assertMatch } from "jsr:@std/assert@1";
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
import { TelegramServer } from "../shared/telegramTestApi.ts";
import { bot } from "shared/telegram/bot.ts";
import { config } from "shared/config.ts";
import { generateRandomUsername } from "shared/helpers.ts";

const API_HOSTNAME = "api_hostname";

describe("/auth/v2/enroll", () => {
  let interceptor: AsyncDisposable;
  let duoClient: DuoClient;
  let tgServer: TelegramServer;

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

    // TelegramServer is needed so getBotUsername() can resolve via getMe
    tgServer = new TelegramServer();
    tgServer.bindBot(bot);
    await tgServer.start();
  });

  afterEach(async () => {
    await tgServer.stop();
  });

  it("enrolls with explicit username", async () => {
    const username = generateRandomUsername();
    const resp = await duoClient.jsonApiCallAsync("POST", "/auth/v2/enroll", {
      username,
    });
    assertEquals(resp.stat, "OK");
    assertEquals(resp.response.username, username);
    assertExists(resp.response.user_id);
    assertExists(resp.response.activation_code);
    assertExists(resp.response.activation_url);
    assertExists(resp.response.activation_barcode);
  });

  it("enrolls without username — generates random", async () => {
    const resp = await duoClient.jsonApiCallAsync(
      "POST",
      "/auth/v2/enroll",
      {},
    );
    assertEquals(resp.stat, "OK");
    assertMatch(resp.response.username, /^user_[0-9a-f]{16}$/);
  });

  it("returns activation_url as Telegram deep link", async () => {
    const resp = await duoClient.jsonApiCallAsync(
      "POST",
      "/auth/v2/enroll",
      {},
    );
    assertEquals(resp.stat, "OK");
    assertMatch(resp.response.activation_url, /^https:\/\/t\.me\/.+\?start=.+$/);
  });

  it("respects custom valid_secs", async () => {
    const username = generateRandomUsername();
    const validSecs = 60;
    const before = Math.floor(Date.now() / 1000);
    const resp = await duoClient.jsonApiCallAsync("POST", "/auth/v2/enroll", {
      username,
      valid_secs: String(validSecs),
    });
    const after = Math.floor(Date.now() / 1000);

    assertEquals(resp.stat, "OK");
    // expiration should be within valid_secs of now
    const expiration: number = resp.response.expiration;
    assertEquals(expiration >= before + validSecs - 1, true);
    assertEquals(expiration <= after + validSecs + 1, true);
  });

  it("rejects duplicate username when ENROLL_ALLOW_EXISTING=false", async () => {
    const username = generateRandomUsername();

    // First enroll succeeds
    const resp1 = await duoClient.jsonApiCallAsync("POST", "/auth/v2/enroll", {
      username,
    });
    assertEquals(resp1.stat, "OK");

    // Ensure ENROLL_ALLOW_EXISTING is unset (defaults to false)
    Deno.env.delete("ENROLL_ALLOW_EXISTING");

    // Second enroll with same username fails
    const resp2 = await duoClient.jsonApiCallAsync("POST", "/auth/v2/enroll", {
      username,
    });
    assertEquals(resp2.stat, "FAIL");
    assertEquals(resp2.message_detail, "username already exists");
  });

  it("allows re-enrollment when ENROLL_ALLOW_EXISTING=true", async () => {
    const username = generateRandomUsername();

    const resp1 = await duoClient.jsonApiCallAsync("POST", "/auth/v2/enroll", {
      username,
    });
    assertEquals(resp1.stat, "OK");

    Deno.env.set("ENROLL_ALLOW_EXISTING", "true");
    try {
      const resp2 = await duoClient.jsonApiCallAsync(
        "POST",
        "/auth/v2/enroll",
        { username },
      );
      assertEquals(resp2.stat, "OK");
      // Same user_id, new activation code
      assertEquals(resp2.response.user_id, resp1.response.user_id);
    } finally {
      Deno.env.delete("ENROLL_ALLOW_EXISTING");
    }
  });
});

describe("/auth/v2/enroll_status", () => {
  let interceptor: AsyncDisposable;
  let duoClient: DuoClient;
  let tgServer: TelegramServer;

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
    await tgServer.start();
  });

  afterEach(async () => {
    await tgServer.stop();
  });

  it("returns 'waiting' before activation", async () => {
    const enrollResp = await duoClient.jsonApiCallAsync(
      "POST",
      "/auth/v2/enroll",
      {},
    );
    assertEquals(enrollResp.stat, "OK");

    const statusResp = await duoClient.jsonApiCallAsync(
      "POST",
      "/auth/v2/enroll_status",
      {
        user_id: enrollResp.response.user_id,
        activation_code: enrollResp.response.activation_code,
      },
    );
    assertEquals(statusResp.stat, "OK");
    assertEquals(statusResp.response, "waiting");
  });

  it("returns error for invalid activation_code", async () => {
    const enrollResp = await duoClient.jsonApiCallAsync(
      "POST",
      "/auth/v2/enroll",
      {},
    );

    const statusResp = await duoClient.jsonApiCallAsync(
      "POST",
      "/auth/v2/enroll_status",
      {
        user_id: enrollResp.response.user_id,
        activation_code: "invalid_code_that_does_not_exist",
      },
    );
    assertEquals(statusResp.stat, "FAIL");
  });

  it("returns error when user_id is missing", async () => {
    const resp = await duoClient.jsonApiCallAsync(
      "POST",
      "/auth/v2/enroll_status",
      { activation_code: "some_code" },
    );
    assertEquals(resp.stat, "FAIL");
    assertEquals(resp.message_detail, "user_id");
  });

  it("returns error when activation_code is missing", async () => {
    const resp = await duoClient.jsonApiCallAsync(
      "POST",
      "/auth/v2/enroll_status",
      { user_id: "some_id" },
    );
    assertEquals(resp.stat, "FAIL");
    assertEquals(resp.message_detail, "activation_code");
  });
});
