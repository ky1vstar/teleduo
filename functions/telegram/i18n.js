const { I18n } = require("@grammyjs/i18n");
const path = require("path");

// ── Shared I18n instance ─────────────────────────────────────────────────────

const i18n = new I18n({
  defaultLocale: "en",
  directory: path.join(__dirname, "..", "locales"),
  fluentBundleOptions: { useIsolating: false },
});

/**
 * Translate a key for a given locale (outside of grammY context).
 * Useful when sending messages from non-middleware code (e.g. auth.js push notifications).
 * @param {string} locale - Language code (e.g. "en", "ru", "uk")
 * @param {string} key - Translation key
 * @param {object} [params] - Placeholders
 * @returns {string}
 */
function t(locale, key, params) {
  return i18n.t(locale, key, params);
}

module.exports = { i18n, t };
