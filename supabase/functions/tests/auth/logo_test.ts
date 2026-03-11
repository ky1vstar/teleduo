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
import app from "../../auth/app.ts";
import { config } from "shared/config.ts";

const API_HOSTNAME = "api_hostname";

describe("/auth/v2/logo", { sanitizeOps: false, sanitizeResources: false }, () => {
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

  it("returns 404 when no logo is uploaded", async () => {
    const resp = await duoClient.jsonApiCallAsync(
      "GET",
      "/auth/v2/logo",
      {},
    );
    // handleLogo returns duoError 40401 when logo not found
    assertEquals(resp.stat, "FAIL");
    assertEquals(resp.code, 40401);
  });
});
