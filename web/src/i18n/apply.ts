import type { createTranslator } from "./translate";
export interface Translatable {
  dataset: { i18n?: string; i18nAttr?: string };
  textContent: string | null;
  setAttribute(name: string, value: string): void;
}
export function applyStaticTranslations(
  root: { querySelectorAll(selector: string): Iterable<Translatable> },
  translator: ReturnType<typeof createTranslator>,
): void {
  for (const element of root.querySelectorAll("[data-i18n], [data-i18n-attr]")) {
    if (element.dataset.i18n) element.textContent = translator.t(element.dataset.i18n.trim());
    for (const pair of (element.dataset.i18nAttr ?? "").split(";")) {
      const parts = pair.split(":");
      const name = parts[0]?.trim();
      const key = parts[1]?.trim();
      if (parts.length === 2 && name && key) element.setAttribute(name, translator.t(key));
    }
  }
}
export function applyDocument(
  doc: { documentElement: { lang: string }; title: string },
  translator: ReturnType<typeof createTranslator>,
): void {
  doc.documentElement.lang = translator.locale;
  doc.title = translator.t("app.name");
}
