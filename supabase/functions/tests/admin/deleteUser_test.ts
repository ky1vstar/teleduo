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
import { supabase } from "shared/supabaseClient.ts";

const API_HOSTNAME = "admin_api_hostname";

describe("DELETE /admin/v1/users/:user_id", () => {
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

  it("deletes an existing user", async () => {
    const user = await createTestUser();
    const resp = await duoClient.jsonApiCallAsync(
      "DELETE",
      `/admin/v1/users/${user.id}`,
      {},
    );
    assertEquals(resp.stat, "OK");

    // Verify user is actually gone from public.users
    const { data } = await supabase
      .from("users")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    assertEquals(data, null);
  });

  it("cascades deletion to devices", async () => {
    const user = await createTestUser();
    const device = await createTestDevice(user.id);

    const resp = await duoClient.jsonApiCallAsync(
      "DELETE",
      `/admin/v1/users/${user.id}`,
      {},
    );
    assertEquals(resp.stat, "OK");

    const { data } = await supabase
      .from("devices")
      .select("id")
      .eq("id", device.id)
      .maybeSingle();
    assertEquals(data, null);
  });

  it("returns 404 for non-existent user", async () => {
    const resp = await duoClient.jsonApiCallAsync(
      "DELETE",
      "/admin/v1/users/00000000-0000-0000-0000-000000000000",
      {},
    );
    assertEquals(resp.stat, "FAIL");
    assertEquals(resp.code, 40401);
  });

  it("returns 404 for invalid UUID", async () => {
    const resp = await duoClient.jsonApiCallAsync(
      "DELETE",
      "/admin/v1/users/not-a-uuid",
      {},
    );
    assertEquals(resp.stat, "FAIL");
    assertEquals(resp.code, 40401);
  });
});
