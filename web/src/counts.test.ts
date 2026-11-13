import { describe, expect, it } from "vitest";
import { describeCounts } from "./counts";

describe("describeCounts", () => {
  it("uses the singular for exactly one", () => {
    expect(describeCounts({ meshes: 1, primitives: 1, triangles: 1 })).toBe(
      "1 mesh, 1 primitive, 1 triangle",
    );
  });

  it("uses the plural for everything else, including zero", () => {
    expect(describeCounts({ meshes: 0, primitives: 2, triangles: 12 })).toBe(
      "0 meshes, 2 primitives, 12 triangles",
    );
  });

  it("groups the digits of large numbers", () => {
    expect(describeCounts({ meshes: 3, primitives: 4, triangles: 1234567 })).toBe(
      "3 meshes, 4 primitives, 1,234,567 triangles",
    );
  });
});
