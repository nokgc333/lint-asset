export interface Limits {
  readonly maxFileBytes: number;
  readonly maxTriangles: number;
}

export const DEFAULT_LIMITS: Limits = {
  maxFileBytes: 100 * 1024 * 1024,
  maxTriangles: 2_000_000,
};
export const RAISE_FACTOR = 2;
export const RAISED_LIMITS: Limits = {
  maxFileBytes: DEFAULT_LIMITS.maxFileBytes * RAISE_FACTOR,
  maxTriangles: DEFAULT_LIMITS.maxTriangles * RAISE_FACTOR,
};

export type IntakePlan = { kind: "load" | "confirm"; limits: Limits } | { kind: "reject" };

export function planIntake(fileSize: number): IntakePlan {
  if (fileSize > RAISED_LIMITS.maxFileBytes) return { kind: "reject" };
  if (fileSize > DEFAULT_LIMITS.maxFileBytes) return { kind: "confirm", limits: RAISED_LIMITS };
  return { kind: "load", limits: DEFAULT_LIMITS };
}

export function planAfterLimitError(
  usedLimits: Limits,
): { kind: "confirm"; limits: Limits } | { kind: "final" } {
  if (
    usedLimits.maxFileBytes === DEFAULT_LIMITS.maxFileBytes &&
    usedLimits.maxTriangles === DEFAULT_LIMITS.maxTriangles
  ) {
    return { kind: "confirm", limits: RAISED_LIMITS };
  }
  return { kind: "final" };
}
