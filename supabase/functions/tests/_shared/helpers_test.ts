import { assertEquals, assertMatch } from "jsr:@std/assert@1";
import {
  afterEach,
  beforeEach,
  describe,
  it,
} from "jsr:@std/testing@1/bdd";
import type { Request, Response } from "express";
import {
  resolvePublicBaseUrl,
  generateDeviceId,
  generateActivationCode,
  generateTxId,
  generateRandomUsername,
  resolveEmail,
  extractUsername,
  LOCAL_EMAIL_DOMAIN,
  duoError,
  duoSuccess,
} from "shared/helpers.ts";

/** Build a minimal Express-like Request with the given headers. */
function fakeReq(headers: Record<string, string>): Request {
  return { headers } as unknown as Request;
}

describe("resolvePublicBaseUrl", () => {
  let savedSupabaseUrl: string | undefined;

  beforeEach(() => {
    savedSupabaseUrl = Deno.env.get("SUPABASE_URL");
  });

  afterEach(() => {
    if (savedSupabaseUrl !== undefined) {
      Deno.env.set("SUPABASE_URL", savedSupabaseUrl);
    } else {
      Deno.env.delete("SUPABASE_URL");
    }
  });

  // ── Production (Supabase hosted) ───────────────────────────────────────────

  it("prod: derives URL from SUPABASE_URL", () => {
    Deno.env.set(
      "SUPABASE_URL",
      "https://lvjmdfdhutrkoujxoogj.supabase.co",
    );

    const req = fakeReq({
      host: "edge-runtime.supabase.com",
      "x-forwarded-proto": "https",
      "x-forwarded-port": "443",
    });

    assertEquals(
      resolvePublicBaseUrl(req),
      "https://lvjmdfdhutrkoujxoogj.functions.supabase.co/",
    );
  });

  // ── Local development (via Kong) ───────────────────────────────────────────

  it("local: builds URL from x-forwarded-* headers", () => {
    // Local env has SUPABASE_URL=http://kong:8000 which doesn't match *.supabase.co
    Deno.env.set("SUPABASE_URL", "http://kong:8000");

    const req = fakeReq({
      host: "supabase_edge_runtime_teleduo:8081",
      "x-forwarded-host": "127.0.0.1",
      "x-forwarded-port": "54321",
      "x-forwarded-proto": "http",
      "x-forwarded-prefix": "/functions/v1/",
    });

    assertEquals(
      resolvePublicBaseUrl(req),
      "http://127.0.0.1:54321/functions/v1/",
    );
  });
});

// ── generateDeviceId ─────────────────────────────────────────────────────────

describe("generateDeviceId", () => {
  it("starts with DP and has 20 characters total", () => {
    const id = generateDeviceId();
    assertEquals(id.startsWith("DP"), true);
    assertEquals(id.length, 20);
  });

  it("contains only uppercase alphanumeric characters after prefix", () => {
    const id = generateDeviceId();
    assertMatch(id, /^DP[A-Z0-9]{18}$/);
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateDeviceId()));
    assertEquals(ids.size, 50);
  });
});

// ── generateActivationCode ───────────────────────────────────────────────────

describe("generateActivationCode", () => {
  it("generates a base64url-safe string", () => {
    const code = generateActivationCode();
    assertMatch(code, /^[A-Za-z0-9_-]+$/);
  });

  it("has reasonable length (32 chars for 24 random bytes)", () => {
    const code = generateActivationCode();
    assertEquals(code.length, 32);
  });
});

// ── generateTxId ─────────────────────────────────────────────────────────────

describe("generateTxId", () => {
  it("generates a valid UUID v4", () => {
    const txid = generateTxId();
    assertMatch(
      txid,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

// ── generateRandomUsername ───────────────────────────────────────────────────

describe("generateRandomUsername", () => {
  it("matches pattern user_XXXX", () => {
    const username = generateRandomUsername();
    assertMatch(username, /^user_[0-9a-f]{16}$/);
  });
});

// ── resolveEmail / extractUsername ────────────────────────────────────────────

describe("resolveEmail", () => {
  it("appends local domain to plain username", () => {
    assertEquals(resolveEmail("alice"), `alice${LOCAL_EMAIL_DOMAIN}`);
  });

  it("returns email as-is if it contains @", () => {
    assertEquals(resolveEmail("alice@example.com"), "alice@example.com");
  });
});

describe("extractUsername", () => {
  it("strips local domain suffix", () => {
    assertEquals(extractUsername(`bob${LOCAL_EMAIL_DOMAIN}`), "bob");
  });

  it("returns email as-is if not local domain", () => {
    assertEquals(extractUsername("bob@example.com"), "bob@example.com");
  });
});

// ── duoError / duoSuccess ────────────────────────────────────────────────────

describe("duoError", () => {
  it("responds with correct structure", () => {
    let captured: { status: number; body: unknown } | undefined;
    const fakeRes = {
      status(s: number) {
        captured = { status: s, body: undefined };
        return this;
      },
      json(b: unknown) {
        captured!.body = b;
      },
    } as unknown as Response;

    duoError(fakeRes, 40001, "Missing required request parameters", "factor");
    assertEquals(captured!.status, 400);
    // deno-lint-ignore no-explicit-any
    const body = captured!.body as any;
    assertEquals(body.stat, "FAIL");
    assertEquals(body.code, 40001);
    assertEquals(body.message, "Missing required request parameters");
    assertEquals(body.message_detail, "factor");
  });
});

describe("duoSuccess", () => {
  it("responds with stat OK and response payload", () => {
    let captured: { status: number; body: unknown } | undefined;
    const fakeRes = {
      status(s: number) {
        captured = { status: s, body: undefined };
        return this;
      },
      json(b: unknown) {
        captured!.body = b;
      },
    } as unknown as Response;

    duoSuccess(fakeRes, { time: 123 });
    assertEquals(captured!.status, 200);
    // deno-lint-ignore no-explicit-any
    const body = captured!.body as any;
    assertEquals(body.stat, "OK");
    assertEquals(body.response.time, 123);
  });
});
