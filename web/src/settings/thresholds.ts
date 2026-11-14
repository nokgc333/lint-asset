import type { Thresholds } from "../wasm/lint_core.mjs";

export const DEFAULT_THRESHOLDS: Thresholds = {
  max_triangles: 100000,
  min_extent_m: 0.01,
  max_extent_m: 1000,
};
export const THRESHOLD_LIMITS = {
  maxTriangles: { min: 1, max: 100_000_000 },
  extent: { min: 0.000001, max: 1_000_000 },
};
export const THRESHOLDS_STORAGE_KEY = "lint-asset.thresholds";
export interface ThresholdInput {
  maxTriangles: string;
  minExtent: string;
  maxExtent: string;
}
type ThresholdErrorCode =
  | "required"
  | "notNumber"
  | "notInteger"
  | "tooSmall"
  | "tooLarge"
  | "notAboveMin";
interface ThresholdError {
  field: keyof ThresholdInput;
  code: ThresholdErrorCode;
}
type Storage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
} | null;
const numberSyntax = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

export function parseThresholds(
  input: ThresholdInput,
): { ok: true; value: Thresholds } | { ok: false; errors: ThresholdError[] } {
  const errors: ThresholdError[] = [];
  const values = { maxTriangles: 0, minExtent: 0, maxExtent: 0 };
  for (const field of Object.keys(values) as (keyof ThresholdInput)[]) {
    const text = input[field].trim();
    const range =
      field === "maxTriangles" ? THRESHOLD_LIMITS.maxTriangles : THRESHOLD_LIMITS.extent;
    const value = Number(text);
    let code: ThresholdErrorCode | undefined;
    if (!text) code = "required";
    else if (!numberSyntax.test(text)) code = "notNumber";
    else if (field === "maxTriangles" && !/^\d+$/.test(text)) code = "notInteger";
    else if (value < range.min) code = "tooSmall";
    else if (!Number.isFinite(value) || value > range.max) code = "tooLarge";
    if (code) errors.push({ field, code });
    values[field] = value;
  }
  if (
    !errors.some((error) => error.field !== "maxTriangles") &&
    values.maxExtent <= values.minExtent
  )
    errors.push({ field: "maxExtent", code: "notAboveMin" });
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      max_triangles: values.maxTriangles,
      min_extent_m: values.minExtent,
      max_extent_m: values.maxExtent,
    },
  };
}

export function formatThresholdInput(value: Thresholds): ThresholdInput {
  return {
    maxTriangles: String(value.max_triangles),
    minExtent: String(value.min_extent_m),
    maxExtent: String(value.max_extent_m),
  };
}

export function loadThresholds(storage: Storage): Thresholds {
  try {
    const value = JSON.parse(storage?.getItem(THRESHOLDS_STORAGE_KEY) ?? "null");
    if (
      !value ||
      typeof value !== "object" ||
      ![value.max_triangles, value.min_extent_m, value.max_extent_m].every(
        (item) => typeof item === "number" && Number.isFinite(item),
      ) ||
      !Number.isInteger(value.max_triangles)
    )
      return DEFAULT_THRESHOLDS;
    const parsed = parseThresholds(formatThresholdInput(value));
    return parsed.ok ? parsed.value : DEFAULT_THRESHOLDS;
  } catch {
    return DEFAULT_THRESHOLDS;
  }
}

export function saveThresholds(storage: Storage, value: Thresholds): boolean {
  try {
    if (!storage) return false;
    storage.setItem(THRESHOLDS_STORAGE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
