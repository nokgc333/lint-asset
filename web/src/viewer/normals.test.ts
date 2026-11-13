import { describe, expect, it } from "vitest";
import { normalLines } from "./normals";

describe("normalLines", () => {
  it("draws one segment per vertex, from the vertex along its normal", () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0]);
    const normals = new Float32Array([0, 0, 1, 0, 0, 2]);

    const lines = normalLines(positions, normals, 0.5);

    expect(lines).toBeInstanceOf(Float32Array);
    // The second normal is twice as long, and is drawn twice as long: its length is not hidden.
    expect(Array.from(lines)).toEqual([0, 0, 0, 0, 0, 0.5, 1, 0, 0, 1, 0, 1]);
  });

  it("returns nothing when the primitive has no normals", () => {
    expect(normalLines(new Float32Array([0, 0, 0]), new Float32Array(0), 1)).toHaveLength(0);
  });

  it("returns nothing when the normals do not match the vertices", () => {
    const positions = new Float32Array([0, 0, 0, 1, 1, 1]);
    expect(normalLines(positions, new Float32Array([0, 0, 1]), 1)).toHaveLength(0);
  });

  it("skips a vertex whose position or normal is not a finite number", () => {
    const positions = new Float32Array([0, 0, 0, 1, 1, 1, Number.NaN, 0, 0]);
    const normals = new Float32Array([0, 0, 1, Number.NaN, 0, 0, 0, 1, 0]);

    const lines = normalLines(positions, normals, 1);

    expect(Array.from(lines)).toEqual([0, 0, 0, 0, 0, 1]);
  });
});
