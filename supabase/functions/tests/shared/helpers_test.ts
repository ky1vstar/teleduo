import { assertEquals } from "jsr:@std/assert@1";
import {
  afterEach,
  beforeEach,
  describe,
  it,
} from "jsr:@std/testing@1/bdd";
import type { Request } from "express";
import { resolvePublicBaseUrl } from "shared/helpers.ts";

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
