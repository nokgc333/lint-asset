import { describe, expect, it } from "vitest";
import {
  DEFAULT_THRESHOLDS,
  formatThresholdInput,
  loadThresholds,
  parseThresholds,
  saveThresholds,
  THRESHOLD_LIMITS,
  THRESHOLDS_STORAGE_KEY,
  type ThresholdInput,
} from "./thresholds";

const input = (overrides: Partial<ThresholdInput> = {}): ThresholdInput => ({
  maxTriangles: "100000",
  minExtent: "0.01",
  maxExtent: "1000",
  ...overrides,
});

function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
  };
}

describe("DEFAULT_THRESHOLDS", () => {
  it("are the limits of the requirements: 100,000 triangles and 0.01 m to 1000 m", () => {
    expect(DEFAULT_THRESHOLDS).toEqual({
      max_triangles: 100000,
      min_extent_m: 0.01,
      max_extent_m: 1000,
    });
  });
});

describe("parseThresholds", () => {
  it("accepts the default values", () => {
    expect(parseThresholds(input())).toEqual({ ok: true, value: DEFAULT_THRESHOLDS });
  });

  it("accepts other valid values, with spaces around them", () => {
    expect(
      parseThresholds(input({ maxTriangles: " 250000 ", minExtent: " 0.5 ", maxExtent: " 20 " })),
    ).toEqual({
      ok: true,
      value: { max_triangles: 250000, min_extent_m: 0.5, max_extent_m: 20 },
    });
  });

  it("accepts a decimal point without a leading digit and scientific notation", () => {
    const result = parseThresholds(input({ minExtent: ".05", maxExtent: "1e3" }));
    expect(result).toEqual({
      ok: true,
      value: { max_triangles: 100000, min_extent_m: 0.05, max_extent_m: 1000 },
    });
  });

  it("accepts the ends of the allowed ranges", () => {
    const low = parseThresholds(
      input({
        maxTriangles: String(THRESHOLD_LIMITS.maxTriangles.min),
        minExtent: String(THRESHOLD_LIMITS.extent.min),
        maxExtent: "1",
      }),
    );
    expect(low.ok).toBe(true);
    const high = parseThresholds(
      input({
        maxTriangles: String(THRESHOLD_LIMITS.maxTriangles.max),
        minExtent: "1",
        maxExtent: String(THRESHOLD_LIMITS.extent.max),
      }),
    );
    expect(high.ok).toBe(true);
  });

  it("has the ranges 1 to 100,000,000 triangles and 0.000001 m to 1,000,000 m", () => {
    expect(THRESHOLD_LIMITS).toEqual({
      maxTriangles: { min: 1, max: 100_000_000 },
      extent: { min: 0.000001, max: 1_000_000 },
    });
  });

  it("reports an empty field as required", () => {
    const result = parseThresholds(input({ maxTriangles: "  ", minExtent: "" }));
    expect(result).toEqual({
      ok: false,
      errors: [
        { field: "maxTriangles", code: "required" },
        { field: "minExtent", code: "required" },
      ],
    });
  });

  it("reports text that is not a number", () => {
    for (const bad of ["abc", "1,000", "10 000", "--1", "0x10", "NaN", "Infinity", "1e", "1.2.3"]) {
      const result = parseThresholds(input({ maxExtent: bad }));
      expect(result, bad).toEqual({
        ok: false,
        errors: [{ field: "maxExtent", code: "notNumber" }],
      });
    }
  });

  it("reports a triangle limit that is not a whole number", () => {
    for (const bad of ["1000.5", "1e5", "0.5"]) {
      expect(parseThresholds(input({ maxTriangles: bad })), bad).toEqual({
        ok: false,
        errors: [{ field: "maxTriangles", code: "notInteger" }],
      });
    }
  });

  it("reports a triangle limit outside the range", () => {
    expect(parseThresholds(input({ maxTriangles: "0" }))).toEqual({
      ok: false,
      errors: [{ field: "maxTriangles", code: "tooSmall" }],
    });
    expect(parseThresholds(input({ maxTriangles: "100000001" }))).toEqual({
      ok: false,
      errors: [{ field: "maxTriangles", code: "tooLarge" }],
    });
  });

  it("reports a size that is zero, negative, or outside the range", () => {
    expect(parseThresholds(input({ minExtent: "0" }))).toEqual({
      ok: false,
      errors: [{ field: "minExtent", code: "tooSmall" }],
    });
    expect(parseThresholds(input({ minExtent: "-1" }))).toEqual({
      ok: false,
      errors: [{ field: "minExtent", code: "notNumber" }],
    });
    expect(parseThresholds(input({ minExtent: "0.0000001" }))).toEqual({
      ok: false,
      errors: [{ field: "minExtent", code: "tooSmall" }],
    });
    expect(parseThresholds(input({ maxExtent: "1000001" }))).toEqual({
      ok: false,
      errors: [{ field: "maxExtent", code: "tooLarge" }],
    });
  });

  it("requires the largest size to be above the smallest", () => {
    expect(parseThresholds(input({ minExtent: "5", maxExtent: "5" }))).toEqual({
      ok: false,
      errors: [{ field: "maxExtent", code: "notAboveMin" }],
    });
    expect(parseThresholds(input({ minExtent: "10", maxExtent: "2" }))).toEqual({
      ok: false,
      errors: [{ field: "maxExtent", code: "notAboveMin" }],
    });
  });

  it("does not compare the sizes while one of them is already wrong", () => {
    expect(parseThresholds(input({ minExtent: "abc", maxExtent: "2" }))).toEqual({
      ok: false,
      errors: [{ field: "minExtent", code: "notNumber" }],
    });
  });

  it("lists the errors in the order of the fields", () => {
    const result = parseThresholds({ maxTriangles: "x", minExtent: "y", maxExtent: "z" });
    expect(result).toEqual({
      ok: false,
      errors: [
        { field: "maxTriangles", code: "notNumber" },
        { field: "minExtent", code: "notNumber" },
        { field: "maxExtent", code: "notNumber" },
      ],
    });
  });
});

describe("formatThresholdInput", () => {
  it("writes the values for the fields of the form", () => {
    expect(formatThresholdInput(DEFAULT_THRESHOLDS)).toEqual({
      maxTriangles: "100000",
      minExtent: "0.01",
      maxExtent: "1000",
    });
  });

  it("writes text that parseThresholds reads back as the same values", () => {
    const value = { max_triangles: 123456, min_extent_m: 0.000123, max_extent_m: 987654 };
    expect(parseThresholds(formatThresholdInput(value))).toEqual({ ok: true, value });
  });
});

describe("loadThresholds and saveThresholds", () => {
  const custom = { max_triangles: 50000, min_extent_m: 0.1, max_extent_m: 200 };

  it("uses the defaults when there is no storage or nothing is saved", () => {
    expect(loadThresholds(null)).toEqual(DEFAULT_THRESHOLDS);
    expect(loadThresholds(memoryStorage())).toEqual(DEFAULT_THRESHOLDS);
  });

  it("gives back what was saved", () => {
    const storage = memoryStorage();
    expect(saveThresholds(storage, custom)).toBe(true);
    expect(loadThresholds(storage)).toEqual(custom);
  });

  it("saves under one key, as JSON with the three values", () => {
    const storage = memoryStorage();
    saveThresholds(storage, custom);
    expect(THRESHOLDS_STORAGE_KEY).toBe("lint-asset.thresholds");
    expect(JSON.parse(storage.items.get(THRESHOLDS_STORAGE_KEY) ?? "null")).toEqual(custom);
  });

  it("uses the defaults when the saved text is damaged or not valid", () => {
    for (const saved of [
      "not json",
      "null",
      "[]",
      '{"max_triangles": "50000", "min_extent_m": 0.1, "max_extent_m": 200}',
      '{"max_triangles": 50000.5, "min_extent_m": 0.1, "max_extent_m": 200}',
      '{"max_triangles": 50000, "min_extent_m": 300, "max_extent_m": 200}',
      '{"max_triangles": 50000, "min_extent_m": 0.1}',
      '{"max_triangles": -1, "min_extent_m": 0.1, "max_extent_m": 200}',
    ]) {
      const storage = memoryStorage({ [THRESHOLDS_STORAGE_KEY]: saved });
      expect(loadThresholds(storage), saved).toEqual(DEFAULT_THRESHOLDS);
    }
  });

  it("ignores extra fields in the saved text", () => {
    const storage = memoryStorage({
      [THRESHOLDS_STORAGE_KEY]: JSON.stringify({ ...custom, other: 1 }),
    });
    expect(loadThresholds(storage)).toEqual(custom);
  });

  it("survives a storage that throws", () => {
    const failing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    expect(loadThresholds(failing)).toEqual(DEFAULT_THRESHOLDS);
    expect(saveThresholds(failing, custom)).toBe(false);
    expect(saveThresholds(null, custom)).toBe(false);
  });
});
