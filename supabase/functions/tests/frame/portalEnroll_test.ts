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
import { handlePortalEnroll } from "../../frame/routes/portalEnroll.ts";
import { TelegramServer } from "../shared/telegramTestApi.ts";
import { bot } from "shared/telegram/bot.ts";
import { supabase } from "shared/supabaseClient.ts";
import { generateRandomUsername, resolveEmail } from "shared/helpers.ts";
import crypto from "node:crypto";

describe("/frame/portal/v4/enroll", { sanitizeOps: false, sanitizeResources: false }, () => {
  let server: http.Server;
  let baseUrl: string;
  let tgServer: TelegramServer;

  beforeAll(async () => {
    const app = express();
    app.get("/frame/portal/v4/enroll", handlePortalEnroll);
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  });

  beforeEach(async () => {
    tgServer = new TelegramServer();
    tgServer.bindBot(bot);
    await tgServer.start();
  });

  afterEach(async () => {
    await tgServer.stop();
  });

  it("redirects to Telegram for valid portal code", async () => {
    const username = generateRandomUsername();
    const code = crypto.randomBytes(24).toString("base64url");

    // Create portal enrollment directly
    await supabase.from("portal_enrollments").insert({
      code,
      username,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });

    // Need a user in DB for the portal handler to work
    const email = resolveEmail(username);
    const { data: authData } = await supabase.auth.admin.createUser({ email });
    await supabase.from("users").insert({
      id: authData!.user!.id,
      username,
      email,
      status: "active",
    });

    const resp = await fetch(`${baseUrl}/frame/portal/v4/enroll?code=${code}`, {
      redirect: "manual",
    });
    assertEquals(resp.status, 302);
    const location = resp.headers.get("location")!;
    assertMatch(location, /^https:\/\/t\.me\//);
  });

  it("shows expired message for invalid code", async () => {
    const resp = await fetch(
      `${baseUrl}/frame/portal/v4/enroll?code=nonexistent`,
      { redirect: "manual" },
    );
    assertEquals(resp.status, 200);
    const text = await resp.text();
    assertEquals(text.includes("expired"), true);
  });

  it("shows expired message for expired code", async () => {
    const code = crypto.randomBytes(24).toString("base64url");
    await supabase.from("portal_enrollments").insert({
      code,
      username: generateRandomUsername(),
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });

    const resp = await fetch(
      `${baseUrl}/frame/portal/v4/enroll?code=${code}`,
      { redirect: "manual" },
    );
    assertEquals(resp.status, 200);
    const text = await resp.text();
    assertEquals(text.includes("expired"), true);
  });

  it("returns 400 when code parameter is missing", async () => {
    const resp = await fetch(`${baseUrl}/frame/portal/v4/enroll`);
    assertEquals(resp.status, 400);
  });
});
