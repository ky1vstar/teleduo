import { loadSync } from "jsr:@std/dotenv";

const conf = loadSync({ envPath: ".env.test" });

Deno.env.set("SUPABASE_URL", conf["API_URL"]!);
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", conf["SERVICE_ROLE_KEY"]!);
Deno.env.set("SUPABASE_ANON_KEY", conf["ANON_KEY"]!);
Deno.env.set("AUTH_IKEY", "DIXXXXXXXXXXXXXXXXXX");
Deno.env.set("AUTH_SKEY", "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef");
Deno.env.set("ADMIN_IKEY", "DIYYYYYYYYYYYYYYYYYY");
Deno.env.set("ADMIN_SKEY", "beefdeadbeefdeadbeefdeadbeefdeadbeefdead");
Deno.env.set("TELEGRAM_BOT_TOKEN", "sampleToken");
Deno.env.delete("TELEGRAM_WEBHOOK_SECRET");

// Polyfill EdgeRuntime for tests (only available in Supabase Edge Runtime)
if (typeof globalThis.EdgeRuntime === "undefined") {
  (globalThis as Record<string, unknown>).EdgeRuntime = {
    waitUntil(_promise: Promise<unknown>) {
      // no-op in test environment
    },
  };
}