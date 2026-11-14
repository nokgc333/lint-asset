import { describe, expect, it } from "vitest";
import type { Severity } from "./describe";
import { buildOverlay, severityValue } from "./overlay";

// Two triangles: (0,0,0)(1,0,0)(0,1,0) and (10,0,0)(11,0,0)(10,1,0), and a third one that shares
// vertices with the first: (0,0,0)(0,1,0)(1,1,0).
const part = {
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 10, 0, 0, 11, 0, 0, 10, 1, 0, 1, 1, 0]),
  triangles: new Uint32Array([0, 1, 2, 3, 4, 5, 0, 2, 6]),
};

describe("severityValue", () => {
  it("gives each severity its own number for the shader", () => {
    expect(severityValue("error")).toBe(0);
    expect(severityValue("warning")).toBe(1);
    expect(severityValue("info")).toBe(2);
  });
});

describe("buildOverlay", () => {
  it("copies the three vertices of each flagged triangle, so the triangles can be drawn alone", () => {
    const overlay = buildOverlay(part, new Map<number, Severity>([[1, "error"]]));

    expect(Array.from(overlay.positions)).toEqual([10, 0, 0, 11, 0, 0, 10, 1, 0]);
    expect(overlay.triangleCount).toBe(1);
  });

  it("gives every vertex of a triangle the severity value of that triangle", () => {
    const flagged = new Map<number, Severity>([
      [0, "warning"],
      [2, "info"],
    ]);
    const overlay = buildOverlay(part, flagged);

    expect(Array.from(overlay.severities)).toEqual([1, 1, 1, 2, 2, 2]);
    expect(overlay.triangleCount).toBe(2);
  });

  it("lists the triangles in ascending order, whatever the order of the map", () => {
    const flagged = new Map<number, Severity>([
      [2, "info"],
      [0, "error"],
    ]);
    const overlay = buildOverlay(part, flagged);

    expect(Array.from(overlay.positions.slice(0, 9))).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect(Array.from(overlay.positions.slice(9))).toEqual([0, 0, 0, 0, 1, 0, 1, 1, 0]);
  });

  it("skips a triangle number that is out of range", () => {
    const overlay = buildOverlay(
      part,
      new Map<number, Severity>([
        [99, "error"],
        [-1, "error"],
        [1, "info"],
      ]),
    );

    expect(overlay.triangleCount).toBe(1);
    expect(Array.from(overlay.severities)).toEqual([2, 2, 2]);
  });

  it("skips a triangle that uses a vertex that does not exist", () => {
    const broken = { ...part, triangles: new Uint32Array([0, 1, 50]) };

    expect(buildOverlay(broken, new Map<number, Severity>([[0, "error"]])).triangleCount).toBe(0);
  });

  it("gives empty arrays when nothing is flagged", () => {
    const overlay = buildOverlay(part, new Map());

    expect(overlay.triangleCount).toBe(0);
    expect(overlay.positions).toHaveLength(0);
    expect(overlay.severities).toHaveLength(0);
  });
});
