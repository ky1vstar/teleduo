import { Context } from "grammy";
import { I18n, I18nFlavor } from "@grammyjs/i18n";
import { EN_LOCALE, RU_LOCALE, UK_LOCALE } from "../locales.ts";

export type MyContext = Context & I18nFlavor;

// ── Shared I18n instance ─────────────────────────────────────────────────

export const i18n = new I18n<MyContext>({
  defaultLocale: "en",
  fluentBundleOptions: { useIsolating: false },
});

i18n.loadLocale("en", { source: EN_LOCALE });
i18n.loadLocale("ru", { source: RU_LOCALE });
i18n.loadLocale("uk", { source: UK_LOCALE });

/**
 * Translate a key for a given locale (outside of grammY context).
 * Useful for push notifications from auth handlers.
 */
export function t(
  locale: string,
  key: string,
  params?: Record<string, string>,
): string {
  return i18n.t(locale, key, params);
}
