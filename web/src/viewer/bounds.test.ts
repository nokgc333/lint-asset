import { describe, expect, it } from "vitest";
import {
  boundsCenter,
  boundsRadius,
  computeBounds,
  mergeBounds,
  sceneBounds,
  transformBounds,
} from "./bounds";

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

describe("computeBounds", () => {
  it("returns the smallest box around the vertices", () => {
    const bounds = computeBounds(new Float32Array([0, 0, 0, 1, 2, 3, -1, 0, 5]));
    expect(bounds).toEqual({ min: [-1, 0, 0], max: [1, 2, 5] });
  });

  it("returns null when there are no vertices", () => {
    expect(computeBounds(new Float32Array(0))).toBeNull();
  });

  it("ignores vertices that are not finite numbers", () => {
    const bounds = computeBounds(new Float32Array([1, 1, 1, Number.NaN, 5, 5, 3, 3, 3]));
    expect(bounds).toEqual({ min: [1, 1, 1], max: [3, 3, 3] });
  });

  it("returns null when no vertex is finite", () => {
    expect(computeBounds(new Float32Array([Number.NaN, 0, 0]))).toBeNull();
  });
});

describe("transformBounds", () => {
  const box = { min: [0, 0, 0] as const, max: [2, 1, 1] as const };

  it("applies a translation and a scale (column-major matrix)", () => {
    const matrix = [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 10, 0, 0, 1];
    expect(transformBounds(box, matrix)).toEqual({ min: [10, 0, 0], max: [14, 2, 2] });
  });

  it("boxes a rotated box by its corners", () => {
    // A quarter turn about Y sends (x, y, z) to (z, y, -x).
    const matrix = [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1];
    const result = transformBounds(box, matrix);
    expect(result.min[0]).toBeCloseTo(0, 9);
    expect(result.min[1]).toBeCloseTo(0, 9);
    expect(result.min[2]).toBeCloseTo(-2, 9);
    expect(result.max[0]).toBeCloseTo(1, 9);
    expect(result.max[1]).toBeCloseTo(1, 9);
    expect(result.max[2]).toBeCloseTo(0, 9);
  });

  it("leaves the box unchanged for the identity matrix", () => {
    expect(transformBounds(box, IDENTITY)).toEqual(box);
  });
});

describe("mergeBounds", () => {
  it("returns the box that contains both", () => {
    const merged = mergeBounds(
      { min: [0, 0, 0], max: [1, 1, 1] },
      { min: [-1, 2, 0], max: [0, 3, 5] },
    );
    expect(merged).toEqual({ min: [-1, 0, 0], max: [1, 3, 5] });
  });

  it("treats null as nothing", () => {
    const box = { min: [0, 0, 0] as const, max: [1, 1, 1] as const };
    expect(mergeBounds(null, box)).toEqual(box);
    expect(mergeBounds(box, null)).toEqual(box);
    expect(mergeBounds(null, null)).toBeNull();
  });
});

describe("boundsCenter and boundsRadius", () => {
  const box = { min: [-1, -1, -1] as const, max: [1, 1, 1] as const };

  it("gives the middle of the box", () => {
    expect(boundsCenter({ min: [10, 20, 30], max: [12, 24, 36] })).toEqual([11, 22, 33]);
  });

  it("gives half the diagonal", () => {
    expect(boundsRadius(box)).toBeCloseTo(Math.sqrt(3), 9);
  });
});

describe("sceneBounds", () => {
  const triangle = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const parts = [{ mesh: 0, positions: triangle }];

  it("boxes every placement of every mesh", () => {
    const instances = [
      { mesh: 0, world: IDENTITY },
      { mesh: 0, world: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 0, 0, 1] },
    ];
    expect(sceneBounds(parts, instances)).toEqual({ min: [0, 0, 0], max: [11, 1, 0] });
  });

  it("covers a mesh drawn from several primitives", () => {
    const two = [
      { mesh: 0, positions: new Float32Array([0, 0, 0]) },
      { mesh: 0, positions: new Float32Array([0, 0, 4]) },
    ];
    expect(sceneBounds(two, [{ mesh: 0, world: IDENTITY }])).toEqual({
      min: [0, 0, 0],
      max: [0, 0, 4],
    });
  });

  it("ignores a placement whose mesh has no triangles to draw", () => {
    expect(sceneBounds(parts, [{ mesh: 7, world: IDENTITY }])).toBeNull();
  });

  it("returns null when nothing is placed", () => {
    expect(sceneBounds(parts, [])).toBeNull();
  });
});
