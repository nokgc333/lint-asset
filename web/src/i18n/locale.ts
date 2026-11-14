export type Locale = "en" | "ja";

export const LOCALES = ["en", "ja"] as const;
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_STORAGE_KEY = "lint-asset.locale";

export function isLocale(value: unknown): value is Locale {
  return LOCALES.some((locale) => locale === value);
}

export function detectLocale(languages: readonly string[], stored: unknown): Locale {
  if (isLocale(stored)) return stored;
  for (const language of languages) {
    const primary = language.split("-")[0]?.toLowerCase();
    if (isLocale(primary)) return primary;
  }
  return DEFAULT_LOCALE;
}
