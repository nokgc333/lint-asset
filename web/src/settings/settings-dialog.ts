import type { Locale } from "../i18n/locale";
import { createTranslator } from "../i18n/translate";
import type { Thresholds } from "../wasm/lint_core.mjs";
import {
  DEFAULT_THRESHOLDS,
  formatThresholdInput,
  parseThresholds,
  saveThresholds,
  THRESHOLD_LIMITS,
  type ThresholdInput,
} from "./thresholds";

interface Options {
  doc: Document;
  getThresholds(): Thresholds;
  onSave(thresholds: Thresholds): void;
  getLocale(): Locale;
}

export function setupSettingsDialog({ doc, getThresholds, onSave, getLocale }: Options) {
  function required<T extends HTMLElement>(id: string): T {
    const element = doc.getElementById(`settings-${id}`);
    if (!element) throw new Error(`Missing settings element: ${id}`);
    return element as T;
  }
  const dialog = required<HTMLDialogElement>("dialog");
  const opener = required<HTMLButtonElement>("open");
  const fields = {
    maxTriangles: "max-triangles",
    minExtent: "min-extent",
    maxExtent: "max-extent",
  };
  const names = Object.keys(fields) as (keyof ThresholdInput)[];
  const inputs = Object.fromEntries(
    names.map((field) => [field, required<HTMLInputElement>(fields[field])]),
  ) as Record<keyof ThresholdInput, HTMLInputElement>;
  let errors: Extract<ReturnType<typeof parseThresholds>, { ok: false }>["errors"] = [];
  let fallback = false;
  function refresh(): void {
    const { t } = createTranslator(getLocale());
    const number = (value: number) =>
      new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 6 }).format(value);
    const defaults = formatThresholdInput(DEFAULT_THRESHOLDS);
    for (const field of names) {
      const range =
        field === "maxTriangles" ? THRESHOLD_LIMITS.maxTriangles : THRESHOLD_LIMITS.extent;
      const params = {
        min: number(range.min),
        max: number(range.max),
        default: number(Number(defaults[field])),
      };
      required(`${fields[field]}-hint`).textContent = t(
        field === "maxTriangles" ? "settings.hint.triangles" : "settings.hint.extent",
        params,
      );
      const error = errors.find((error) => error.field === field);
      required(`${fields[field]}-error`).textContent = error
        ? `! ${t(`settings.error.${error.code}`, params)}`
        : "";
      if (error) inputs[field].setAttribute("aria-invalid", "true");
      else inputs[field].removeAttribute("aria-invalid");
    }
  }
  function fill(value: Thresholds): void {
    const formatted = formatThresholdInput(value);
    for (const field of names) inputs[field].value = formatted[field];
    errors = [];
    refresh();
  }
  function close(): void {
    if (!dialog.open) return;
    if (fallback) {
      dialog.removeAttribute("open");
      opener.focus();
    } else dialog.close();
  }
  opener.addEventListener("click", () => {
    if (dialog.open) return;
    fill(getThresholds());
    try {
      dialog.showModal();
      fallback = false;
    } catch {
      fallback = true;
      dialog.setAttribute("open", "");
    }
    inputs.maxTriangles.focus();
  });
  required("reset").addEventListener("click", () => fill(DEFAULT_THRESHOLDS));
  required("save").addEventListener("click", () => {
    const result = parseThresholds({
      maxTriangles: inputs.maxTriangles.value,
      minExtent: inputs.minExtent.value,
      maxExtent: inputs.maxExtent.value,
    });
    if (!result.ok) {
      errors = result.errors;
      refresh();
      const first = errors[0];
      if (first) inputs[first.field].focus();
      return;
    }
    try {
      saveThresholds(doc.defaultView?.localStorage ?? null, result.value);
    } catch {}
    onSave(result.value);
    close();
  });
  required("cancel").addEventListener("click", close);
  dialog.addEventListener("close", () => opener.focus());
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      close();
  });
  refresh();
  return { refresh };
}
