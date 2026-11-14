import { detectLocale, LOCALE_STORAGE_KEY, type Locale } from "./locale";
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export interface LocaleController {
  readonly locale: Locale;
  set(locale: Locale): void;
  subscribe(listener: (locale: Locale) => void): () => void;
}
export function createLocaleController({
  storage,
  languages,
}: {
  storage: StorageLike | null;
  languages: readonly string[];
}): LocaleController {
  let stored: string | null = null;
  try {
    stored = storage?.getItem(LOCALE_STORAGE_KEY) ?? null;
  } catch {}
  let locale = detectLocale(languages, stored);
  const listeners = new Set<(locale: Locale) => void>();
  return {
    get locale() {
      return locale;
    },
    set(next) {
      try {
        storage?.setItem(LOCALE_STORAGE_KEY, next);
      } catch {}
      if (next === locale) return;
      locale = next;
      for (const listener of listeners) {
        try {
          listener(locale);
        } catch {}
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
