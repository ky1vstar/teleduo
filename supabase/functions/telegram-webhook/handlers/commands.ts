import { supabase } from "../../_shared/supabaseClient.ts";
import { generateDeviceId } from "../../_shared/helpers.ts";

// deno-lint-ignore no-explicit-any
export async function handleStartCommand(ctx: any) {
  try {
    const payload = ctx.match;
    if (!payload) {
      return ctx.reply(ctx.t("welcome"));
    }

    const activationCode = payload;
    const chatId = ctx.chat.id;
    const telegramUsername: string = ctx.from.username || "";

    const { data: enrollData } = await supabase
      .from("enrollments")
      .select("*")
      .eq("activation_code", activationCode)
      .maybeSingle();

    if (!enrollData) {
      return ctx.reply(ctx.t("activation-invalid"));
    }

    if (new Date(enrollData.expires_at) < new Date()) {
      return ctx.reply(ctx.t("activation-invalid"));
    }

    if (enrollData.status === "success") {
      return ctx.reply(ctx.t("activation-already-used"));
    }

    const userId: string = enrollData.user_id;
    const username: string = enrollData.username;

    // Create device
    const deviceId = generateDeviceId();
    const displayName = telegramUsername
      ? `Telegram (@${telegramUsername})`
      : "Telegram";

    await supabase.from("devices").insert({
      id: deviceId,
      user_id: userId,
      type: "phone",
      name: "Telegram",
      display_name: displayName,
      telegram_chat_id: chatId,
      telegram_username: telegramUsername,
      locale: ctx.from.language_code || "en",
    });

    // Update enrollment status
    await supabase
      .from("enrollments")
      .update({ status: "success" })
      .eq("activation_code", activationCode);

    console.log("Device enrolled via Telegram", {
      userId,
      username,
      deviceId,
      chatId,
      telegramUsername,
    });

    return ctx.reply(ctx.t("activation-success"));
  } catch (err) {
    console.error("Error handling /start command", err);
    return ctx.reply(ctx.t("cb-error"));
  }
}
