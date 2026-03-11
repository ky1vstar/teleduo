/**
 * Helpers for creating test data directly in the database.
 * Used by unit tests that need enrolled users/devices without
 * going through the full Telegram activation flow.
 */
import { supabase } from "shared/supabaseClient.ts";
import {
  generateDeviceId,
  generateRandomUsername,
  resolveEmail,
} from "shared/helpers.ts";

export interface TestUser {
  id: string;
  username: string;
  email: string;
}

export interface TestDevice {
  id: string;
  userId: string;
  telegramChatId: number;
}

/** Create a user in both auth.users and public.users tables. */
export async function createTestUser(
  opts: { username?: string; status?: string } = {},
): Promise<TestUser> {
  const username = opts.username ?? generateRandomUsername();
  const email = resolveEmail(username);
  const status = opts.status ?? "active";

  const { data: authData, error: authErr } =
    await supabase.auth.admin.createUser({ email });
  if (authErr) throw authErr;
  const id = authData.user.id;

  await supabase.from("users").insert({
    id,
    username,
    email,
    status,
  });

  return { id, username, email };
}

/** Create a device linked to a user with a fake Telegram chat ID. */
export async function createTestDevice(
  userId: string,
  opts: { telegramChatId?: number; locale?: string } = {},
): Promise<TestDevice> {
  const deviceId = generateDeviceId();
  const telegramChatId =
    opts.telegramChatId ?? Math.floor(Math.random() * 1_000_000_000);

  await supabase.from("devices").insert({
    id: deviceId,
    user_id: userId,
    type: "phone",
    name: "Telegram",
    display_name: "Telegram (test)",
    telegram_chat_id: telegramChatId,
    telegram_username: "testuser",
    locale: opts.locale ?? "en",
  });

  return { id: deviceId, userId, telegramChatId };
}
