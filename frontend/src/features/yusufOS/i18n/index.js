import i18n from "@/i18n";
import en from "./en";
import ar from "./ar";

export const YUSUF_OS_NS = "yusufOS";

/**
 * Registers the Yusuf OS namespace on the app's existing i18next instance.
 *
 * A namespace rather than new keys in `common`: `common` is verified across
 * every shipped locale, and Gate G ships English and Arabic only. Locales
 * without a Yusuf OS bundle fall back to English for this namespace alone,
 * leaving the rest of AnythingLLM untouched.
 */
let registered = false;
export function registerYusufOSTranslations() {
  if (registered) return;
  i18n.addResourceBundle("en", YUSUF_OS_NS, en, true, true);
  i18n.addResourceBundle("ar", YUSUF_OS_NS, ar, true, true);
  registered = true;
}

/** Locales whose script runs right to left. */
const RTL_LANGUAGES = new Set(["ar", "fa", "he", "ur"]);

export function isRtlLanguage(language) {
  if (typeof language !== "string") return false;
  return RTL_LANGUAGES.has(language.toLowerCase().split("-")[0]);
}
