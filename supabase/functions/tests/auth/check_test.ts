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
import { createDuoClient, SIGNATURE_VERSION_2, SIGNATURE_VERSION_5 } from "../shared/duoClient.ts";
import app from "../../auth/app.ts";

const IKEY = "DIXXXXXXXXXXXXXXXXXX";
const SKEY = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
const IKEY_INVALID = "DIYYYYYYYYYYYYYYY";
const SKEY_INVALID = "beefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
const API_HOSTNAME = "api_hostname";

describe("/auth/v2/check", () => {
    let interceptor: AsyncDisposable;

    beforeAll(async () => {
        interceptor = await createHttpsInterceptor(API_HOSTNAME, app);
    });

    afterAll(async () => {
        await interceptor[Symbol.asyncDispose]();
    });

    beforeEach(() => {
        Deno.env.set("AUTH_IKEY", IKEY);
        Deno.env.set("AUTH_SKEY", SKEY);
    });

    it("responds with 200 OK for signature version 2", async () => {
        const client = createDuoClient(IKEY, SKEY, API_HOSTNAME, SIGNATURE_VERSION_2);

        const resp = await client.jsonApiCallAsync("GET", "/auth/v2/check", {});
        assertEquals(resp.stat, "OK");
    });

    it("responds with 200 OK for signature version 5", async () => {
        const client = createDuoClient(IKEY, SKEY, API_HOSTNAME, SIGNATURE_VERSION_5);

        const resp = await client.jsonApiCallAsync("GET", "/auth/v2/check", {});
        assertEquals(resp.stat, "OK");
    });

    it("responds with 401 Unauthorized for invalid IKEY", async () => {
        const client = createDuoClient(IKEY_INVALID, SKEY, API_HOSTNAME);

        const resp = await client.jsonApiCallAsync("GET", "/auth/v2/check", {});
        assertEquals(resp.stat, "FAIL");
        assertEquals(resp.message, "Invalid integration key in request credentials");
    });

    it("responds with 401 Unauthorized for invalid SKEY", async () => {
        const client = createDuoClient(IKEY, SKEY_INVALID, API_HOSTNAME);

        const resp = await client.jsonApiCallAsync("GET", "/auth/v2/check", {});
        assertEquals(resp.stat, "FAIL");
        assertEquals(resp.message, "Invalid signature in request credentials");
    });
});
