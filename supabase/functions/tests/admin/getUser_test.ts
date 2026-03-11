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
import app from "../../admin/app.ts";
import { config } from "shared/config.ts";

const API_HOSTNAME = "admin_api_hostname";

describe("GET /admin/v1/users/:user_id", () => {
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
      config.ADMIN_IKEY,
      config.ADMIN_SKEY,
      API_HOSTNAME,
    );
  });

  it("returns user by user_id", async () => {
    const user = await createTestUser();
    const resp = await duoClient.jsonApiCallAsync(
      "GET",
      `/admin/v1/users/${user.id}`,
      {},
    );
    assertEquals(resp.stat, "OK");
    assertEquals(resp.response.user_id, user.id);
    assertEquals(resp.response.username, user.username);
    assertEquals(resp.response.status, "active");
  });

  it("returns user with phones when device exists", async () => {
    const user = await createTestUser();
    await createTestDevice(user.id);

    const resp = await duoClient.jsonApiCallAsync(
      "GET",
      `/admin/v1/users/${user.id}`,
      {},
    );
    assertEquals(resp.stat, "OK");
    assertEquals(resp.response.phones.length, 1);
    assertEquals(resp.response.is_enrolled, true);
    assertEquals(
      resp.response.phones[0].capabilities.includes("push"),
      true,
    );
    assertEquals(
      resp.response.phones[0].capabilities.includes("auto"),
      true,
    );
  });

  it("returns user with empty phones when no device", async () => {
    const user = await createTestUser();
    const resp = await duoClient.jsonApiCallAsync(
      "GET",
      `/admin/v1/users/${user.id}`,
      {},
    );
    assertEquals(resp.stat, "OK");
    assertEquals(resp.response.phones.length, 0);
    assertEquals(resp.response.is_enrolled, false);
  });

  it("returns 404 for non-existent user_id", async () => {
    const resp = await duoClient.jsonApiCallAsync(
      "GET",
      "/admin/v1/users/00000000-0000-0000-0000-000000000000",
      {},
    );
    assertEquals(resp.stat, "FAIL");
    assertEquals(resp.code, 40401);
  });

  it("returns 404 for invalid UUID", async () => {
    const resp = await duoClient.jsonApiCallAsync(
      "GET",
      "/admin/v1/users/not-a-uuid",
      {},
    );
    assertEquals(resp.stat, "FAIL");
    assertEquals(resp.code, 40401);
  });
});
