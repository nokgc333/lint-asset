import { catalogs } from "./i18n/catalog";
import type { Locale } from "./i18n/locale";
import { createTranslator } from "./i18n/translate";

export interface LoadMessage {
  readonly cause: string;
  readonly action: string;
}

function messageKey(code: string): string {
  const key = `load.${code}`;
  return Object.hasOwn(catalogs.en, `${key}.cause`) ? key : "load.fallback";
}

export function messageFor(code: string, locale: Locale = "en"): LoadMessage {
  const { t } = createTranslator(locale);
  const key = messageKey(code);
  return { cause: t(`${key}.cause`), action: t(`${key}.action`) };
}

export function formatLoadError(code: string, detail: string, locale: Locale = "en"): string {
  const { t } = createTranslator(locale);
  return t(`${messageKey(code)}.format`, { code }) + (detail ? t("load.detail", { detail }) : "");
}
