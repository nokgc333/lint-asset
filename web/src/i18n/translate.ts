import { catalogs } from "./catalog";
import type { Locale } from "./locale";

type Parameters = Record<string, string | number>;

export function createTranslator(locale: Locale, source = catalogs) {
  const catalog = source[locale];
  const rules = new Intl.PluralRules(locale);
  const numbers = new Intl.NumberFormat(locale);

  function t(key: string, params: Parameters = {}): string {
    const template = Object.hasOwn(catalog, key) ? catalog[key] : undefined;
    if (template === undefined) return key;
    return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (mark: string, name: string) =>
      Object.hasOwn(params, name) ? String(params[name]) : mark,
    );
  }

  function plural(key: string, count: number, params: Parameters = {}): string {
    const selected = `${key}.${rules.select(count)}`;
    return t(Object.hasOwn(catalog, selected) ? selected : `${key}.other`, {
      count: numbers.format(count),
      ...params,
    });
  }

  return { locale, t, plural };
}
