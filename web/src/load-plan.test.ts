import { describe, expect, it } from "vitest";
import { DEFAULT_LIMITS, planAfterLimitError, planIntake, RAISED_LIMITS } from "./load-plan";

const MIB = 1024 * 1024;

describe("the limits", () => {
  it("default to 100 MiB and 2,000,000 triangles", () => {
    expect(DEFAULT_LIMITS).toEqual({ maxFileBytes: 100 * MIB, maxTriangles: 2_000_000 });
  });

  it("can be raised to exactly twice the defaults, and no further", () => {
    expect(RAISED_LIMITS).toEqual({ maxFileBytes: 200 * MIB, maxTriangles: 4_000_000 });
  });
});

describe("planIntake (before the file is read)", () => {
  it("loads a file within the default limit", () => {
    expect(planIntake(0)).toEqual({ kind: "load", limits: DEFAULT_LIMITS });
    expect(planIntake(100 * MIB)).toEqual({ kind: "load", limits: DEFAULT_LIMITS });
  });

  it("asks first when the file is over the default limit, offering the raised limits", () => {
    expect(planIntake(100 * MIB + 1)).toEqual({ kind: "confirm", limits: RAISED_LIMITS });
    expect(planIntake(200 * MIB)).toEqual({ kind: "confirm", limits: RAISED_LIMITS });
  });

  it("refuses a file over the raised limit without offering to continue", () => {
    expect(planIntake(200 * MIB + 1)).toEqual({ kind: "reject" });
  });
});

describe("planAfterLimitError (the model has too many triangles)", () => {
  it("offers to retry with the raised limits when the default limits were used", () => {
    expect(planAfterLimitError(DEFAULT_LIMITS)).toEqual({
      kind: "confirm",
      limits: RAISED_LIMITS,
    });
  });

  it("gives up when the raised limits were already used", () => {
    expect(planAfterLimitError(RAISED_LIMITS)).toEqual({ kind: "final" });
  });
});
