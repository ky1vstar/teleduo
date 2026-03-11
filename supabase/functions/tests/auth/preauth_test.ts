import "../shared/setupTestEnv.ts";
import { assertEquals } from "jsr:@std/assert@1";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  it,
} from "jsr:@std/testing@1/bdd";
import { createHttpsInterceptor } from "../shared/httpsInterceptor.ts";
import { createDuoClient, DuoClient } from "../shared/duoClient.ts";
import { createTestUser, createTestDevice } from "../shared/testData.ts";
import app from "../../auth/app.ts";
import { config } from "shared/config.ts";
import { generateRandomUsername } from "shared/helpers.ts";

const API_HOSTNAME = "api_hostname";

describe("/auth/v2/preauth", () => {
  let interceptor: AsyncDisposable;
  let duoClient: DuoClient;

  beforeAll(async () => {
    interceptor = await createHttpsInterceptor(API_HOSTNAME, app);
  });

  afterAll(async () => {
    await interceptor[Symbol.asyncDispose]();
  });

  beforeEach(() => {
    duoClient = createDuoClient(
      config.AUTH_IKEY,
      config.AUTH_SKEY,
      API_HOSTNAME,
    );
  });

  it("returns 'enroll' for unknown username", async () => {
    const username = generateRandomUsername();
    const resp = await duoClient.jsonApiCallAsync("POST", "/auth/v2/preauth", {
      username,
    });
    assertEquals(resp.stat, "OK");
    assertEquals(resp.response.result, "enroll");
    assertEquals(typeof resp.response.enroll_portal_url, "string");
  });

  it("returns 'allow' for user with bypass status", async () => {
    const user = await createTestUser({ status: "bypass" });
    const resp = await duoClient.jsonApiCallAsync("POST", "/auth/v2/preauth", {
      username: user.username,
    });
    assertEquals(resp.stat, "OK");
    assertEquals(resp.response.result, "allow");
  });

  it("returns 'deny' for user with disabled status", async () => {
    const user = await createTestUser({ status: "disabled" });
    const resp = await duoClient.jsonApiCallAsync("POST", "/auth/v2/preauth", {
      username: user.username,
    });
    assertEquals(resp.stat, "OK");
    assertEquals(resp.response.result, "deny");
  });

  it("returns 'enroll' for user with no devices", async () => {
    const user = await createTestUser();
    const resp = await duoClient.jsonApiCallAsync("POST", "/auth/v2/preauth", {
      username: user.username,
    });
    assertEquals(resp.stat, "OK");
    assertEquals(resp.response.result, "enroll");
  });

  it("returns 'auth' with device list when user has devices", async () => {
    const user = await createTestUser();
    const device = await createTestDevice(user.id);

    const resp = await duoClient.jsonApiCallAsync("POST", "/auth/v2/preauth", {
      username: user.username,
    });
    assertEquals(resp.stat, "OK");
    assertEquals(resp.response.result, "auth");
    assertEquals(Array.isArray(resp.response.devices), true);
    assertEquals(resp.response.devices.length, 1);
    assertEquals(resp.response.devices[0].device, device.id);
    assertEquals(resp.response.devices[0].capabilities.includes("push"), true);
    assertEquals(resp.response.devices[0].capabilities.includes("auto"), true);
  });

  it("resolves user by user_id", async () => {
    const user = await createTestUser();
    await createTestDevice(user.id);

    const resp = await duoClient.jsonApiCallAsync("POST", "/auth/v2/preauth", {
      user_id: user.id,
    });
    assertEquals(resp.stat, "OK");
    assertEquals(resp.response.result, "auth");
  });

  it("returns error when neither user_id nor username is provided", async () => {
    const resp = await duoClient.jsonApiCallAsync(
      "POST",
      "/auth/v2/preauth",
      {},
    );
    assertEquals(resp.stat, "FAIL");
  });
});
