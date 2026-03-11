import "../shared/setupTestEnv.ts";
import { assertEquals, assertExists } from "jsr:@std/assert@1";
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

describe("GET /admin/v1/users", () => {
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

  it("returns list of users", async () => {
    const user = await createTestUser();
    const resp = await duoClient.jsonApiCallAsync(
      "GET",
      "/admin/v1/users",
      {},
    );
    assertEquals(resp.stat, "OK");
    assertEquals(Array.isArray(resp.response), true);
    assertExists(resp.metadata);
    assertEquals(typeof resp.metadata.total_objects, "number");
  });

  it("filters by username", async () => {
    const user = await createTestUser();
    const resp = await duoClient.jsonApiCallAsync("GET", "/admin/v1/users", {
      username: user.username,
    });
    assertEquals(resp.stat, "OK");
    assertEquals(resp.response.length, 1);
    assertEquals(resp.response[0].username, user.username);
    assertEquals(resp.response[0].user_id, user.id);
  });

  it("returns empty for non-existent username filter", async () => {
    const resp = await duoClient.jsonApiCallAsync("GET", "/admin/v1/users", {
      username: "nonexistent_user_" + Date.now(),
    });
    assertEquals(resp.stat, "OK");
    assertEquals(resp.response.length, 0);
  });

  it("filters by user_id_list", async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const resp = await duoClient.jsonApiCallAsync("GET", "/admin/v1/users", {
      user_id_list: JSON.stringify([user1.id, user2.id]),
    });
    assertEquals(resp.stat, "OK");
    assertEquals(resp.response.length, 2);
  });

  it("filters by username_list", async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const resp = await duoClient.jsonApiCallAsync("GET", "/admin/v1/users", {
      username_list: JSON.stringify([user1.username, user2.username]),
    });
    assertEquals(resp.stat, "OK");
    assertEquals(resp.response.length, 2);
  });

  it("rejects mutually exclusive filters", async () => {
    const resp = await duoClient.jsonApiCallAsync("GET", "/admin/v1/users", {
      username: "test",
      email: "test@test.com",
    });
    assertEquals(resp.stat, "FAIL");
  });

  it("respects pagination with limit and offset", async () => {
    // Create a few users to have data
    await createTestUser();
    await createTestUser();

    const resp = await duoClient.jsonApiCallAsync("GET", "/admin/v1/users", {
      limit: "1",
      offset: "0",
    });
    assertEquals(resp.stat, "OK");
    assertEquals(resp.response.length, 1);
    assertExists(resp.metadata);
    if (resp.metadata.total_objects > 1) {
      assertEquals(resp.metadata.next_offset, 1);
    }
  });

  it("returns user with phones when device exists", async () => {
    const user = await createTestUser();
    await createTestDevice(user.id);

    const resp = await duoClient.jsonApiCallAsync("GET", "/admin/v1/users", {
      username: user.username,
    });
    assertEquals(resp.stat, "OK");
    assertEquals(resp.response.length, 1);
    assertEquals(resp.response[0].phones.length, 1);
    assertEquals(resp.response[0].is_enrolled, true);
    assertEquals(
      resp.response[0].phones[0].capabilities.includes("push"),
      true,
    );
  });

  it("returns invalid user_id_list error for non-JSON", async () => {
    const resp = await duoClient.jsonApiCallAsync("GET", "/admin/v1/users", {
      user_id_list: "not_json",
    });
    assertEquals(resp.stat, "FAIL");
  });
});
