import type { Locale } from "./i18n/locale";
import { createTranslator } from "./i18n/translate";

export interface Counts {
  readonly meshes: number;
  readonly primitives: number;
  readonly triangles: number;
}

export function describeCounts(counts: Counts, locale: Locale = "en"): string {
  const { plural } = createTranslator(locale);
  return (["meshes", "primitives", "triangles"] as const)
    .map((kind) => plural(`counts.${kind}`, counts[kind]))
    .join(locale === "ja" ? "、" : ", ");
}
