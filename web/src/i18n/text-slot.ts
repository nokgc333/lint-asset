import type { Locale } from "./locale";
export type Text = (locale: Locale) => string;
export interface TextSlot {
  set(text: Text | string | null): void;
  refresh(): void;
}
export function createTextSlot(
  element: { textContent: string | null },
  getLocale: () => Locale,
): TextSlot {
  let text: Text | string | null | undefined;
  function refresh(): void {
    if (text === undefined) return;
    element.textContent = typeof text === "function" ? text(getLocale()) : (text ?? "");
  }
  return {
    set(next) {
      text = next;
      refresh();
    },
    refresh,
  };
}
