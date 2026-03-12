import "../shared/setupTestEnv.ts";
import { assertEquals } from "jsr:@std/assert@1";
import {
  afterAll,
  beforeAll,
  describe,
  it,
} from "jsr:@std/testing@1/bdd";
import http from "node:http";
import type { AddressInfo } from "node:net";

// Import the frame app. It calls app.listen(3000) at import time,
// so we import the individual route handlers and build our own app.
import express from "express";
import { handleQr } from "../../frame/routes/qr.ts";
import { handlePortalEnroll } from "../../frame/routes/portalEnroll.ts";

function createFrameApp() {
  const app = express();
  app.get("/frame/qr", handleQr);
  app.get("/frame/portal/v4/enroll", handlePortalEnroll);
  return app;
}

describe("/frame/qr", () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = createFrameApp();
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

  it("returns a PNG image for valid value", async () => {
    const resp = await fetch(
      `${baseUrl}/frame/qr?value=${encodeURIComponent("https://example.com")}`,
    );
    assertEquals(resp.status, 200);
    assertEquals(resp.headers.get("content-type"), "image/png");
    assertEquals(
      resp.headers.get("cache-control")?.includes("max-age=3600"),
      true,
    );
    const body = await resp.arrayBuffer();
    assertEquals(body.byteLength > 0, true);
  });

  it("returns 400 when value parameter is missing", async () => {
    const resp = await fetch(`${baseUrl}/frame/qr`);
    assertEquals(resp.status, 400);
    const body = await resp.json();
    assertEquals(body.stat, "FAIL");
  });
});
