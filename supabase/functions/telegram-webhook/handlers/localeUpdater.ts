import { supabase } from "../../_shared/supabaseClient.ts";

// deno-lint-ignore no-explicit-any
export async function updateLocaleMiddleware(ctx: any, next: () => Promise<void>) {
  const chatId = ctx.chat?.id;
  const locale: string | undefined = ctx.from?.language_code;

  if (chatId && locale) {
    // Fire-and-forget
    supabase
      .from("devices")
      .update({ locale })
      .eq("telegram_chat_id", chatId)
      .neq("locale", locale)
      .then(({ error }) => {
        if (error) {
          console.warn("Failed to update device locale", {
            chatId,
            locale,
            error: error.message,
          });
        }
      });
  }

  await next();
}
