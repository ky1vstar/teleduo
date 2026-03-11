import "../shared/setupTestEnv.ts";
import { assertEquals, assertExists } from "jsr:@std/assert@1";
import {
  afterAll,
  beforeAll,
  describe,
  it,
} from "jsr:@std/testing@1/bdd";
import { createHttpsInterceptor } from "../shared/httpsInterceptor.ts";
import { createDuoClient } from "../shared/duoClient.ts";
import app from "../../auth/app.ts";
import { config } from "shared/config.ts";

const API_HOSTNAME = "api_hostname";

describe("/auth/v2/ping", () => {
  let interceptor: AsyncDisposable;

  beforeAll(async () => {
    interceptor = await createHttpsInterceptor(API_HOSTNAME, app);
  });

  afterAll(async () => {
    await interceptor[Symbol.asyncDispose]();
  });

  it("responds with OK and a timestamp", async () => {
    // ping does not require auth, but we use the duo client to reach
    // the intercepted HTTPS server conveniently
    const client = createDuoClient(
      config.AUTH_IKEY,
      config.AUTH_SKEY,
      API_HOSTNAME,
    );
    const resp = await client.jsonApiCallAsync("GET", "/auth/v2/ping", {});
    assertEquals(resp.stat, "OK");
    assertExists(resp.response.time);
    assertEquals(typeof resp.response.time, "number");
  });
});
