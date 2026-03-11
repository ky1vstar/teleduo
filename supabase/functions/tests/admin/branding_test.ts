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
import app from "../../admin/app.ts";
import { config } from "shared/config.ts";

const API_HOSTNAME = "admin_api_hostname";

describe("/admin/v1/branding", { sanitizeOps: false, sanitizeResources: false }, () => {
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

  it("GET returns branding with null logo by default", async () => {
    // Reset: delete any existing logo first
    await duoClient.jsonApiCallAsync("POST", "/admin/v1/branding", {
      logo: "",
    });

    const resp = await duoClient.jsonApiCallAsync(
      "GET",
      "/admin/v1/branding",
      {},
    );
    assertEquals(resp.stat, "OK");
    assertEquals(resp.response.logo, null);
  });

  it("POST uploads a logo and GET returns it", async () => {
    // Minimal valid PNG (1x1 pixel)
    const pngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    const postResp = await duoClient.jsonApiCallAsync(
      "POST",
      "/admin/v1/branding",
      { logo: pngBase64 },
    );
    assertEquals(postResp.stat, "OK");
    assertEquals(typeof postResp.response.logo, "string");
    assertEquals(postResp.response.logo.length > 0, true);

    const getResp = await duoClient.jsonApiCallAsync(
      "GET",
      "/admin/v1/branding",
      {},
    );
    assertEquals(getResp.stat, "OK");
    assertEquals(typeof getResp.response.logo, "string");
  });

  it("POST with empty logo deletes it", async () => {
    // First upload something
    const pngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    await duoClient.jsonApiCallAsync("POST", "/admin/v1/branding", {
      logo: pngBase64,
    });

    // Delete
    const delResp = await duoClient.jsonApiCallAsync(
      "POST",
      "/admin/v1/branding",
      { logo: "" },
    );
    assertEquals(delResp.stat, "OK");
    assertEquals(delResp.response.logo, null);
  });
});
