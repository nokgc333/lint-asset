import { describe, expect, it } from "vitest";
import type { Issue, MeshInstance, PrimitiveGeometry } from "../wasm/lint_core.mjs";
import { issueBounds, triangleSeverities } from "./geometry";

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const moved = (x: number, y: number, z: number): Float32Array =>
  new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);

// Two triangles: (0,0,0)(1,0,0)(0,1,0) and (10,0,0)(11,0,0)(10,1,0).
const part = (mesh = 0, primitive = 0): PrimitiveGeometry => ({
  mesh,
  primitive,
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 10, 0, 0, 11, 0, 0, 10, 1, 0]),
  normals: new Float32Array(0),
  triangles: new Uint32Array([0, 1, 2, 3, 4, 5]),
});

const instance = (mesh: number, world: Float32Array): MeshInstance => ({ mesh, world });

const issue = (
  rule: string,
  severity: "error" | "warning" | "info",
  mesh: number,
  primitive: number,
  elements: number[],
): Issue => ({
  rule,
  severity,
  message: "x",
  element_kind: "triangle",
  target: { mesh, primitive },
  count: elements.length,
  elements,
  truncated: false,
});

const assetIssue: Issue = {
  rule: "asset.scale_too_large",
  severity: "warning",
  message: "x",
  element_kind: "asset",
  count: 1,
  elements: [],
  truncated: false,
};

describe("triangleSeverities", () => {
  it("maps each listed triangle of a primitive to the severity of its issue", () => {
    const result = triangleSeverities([issue("normal.flipped", "error", 0, 1, [4, 9])]);

    expect(result.get("0:1")?.get(4)).toBe("error");
    expect(result.get("0:1")?.get(9)).toBe("error");
    expect(result.get("0:1")?.size).toBe(2);
  });

  it("keeps the most serious severity when a triangle is in several issues", () => {
    const result = triangleSeverities([
      issue("mesh.boundary_edge", "warning", 0, 0, [1, 2]),
      issue("normal.flipped", "error", 0, 0, [2, 3]),
      issue("normal.missing", "info", 0, 0, [1, 3, 5]),
    ]);

    const triangles = result.get("0:0");
    expect(triangles?.get(1)).toBe("warning");
    expect(triangles?.get(2)).toBe("error");
    expect(triangles?.get(3)).toBe("error");
    expect(triangles?.get(5)).toBe("info");
  });

  it("keeps primitives apart and ignores whole-asset issues", () => {
    const result = triangleSeverities([
      issue("normal.flipped", "error", 0, 0, [1]),
      issue("normal.flipped", "error", 1, 0, [1]),
      assetIssue,
    ]);

    expect([...result.keys()].sort()).toEqual(["0:0", "1:0"]);
  });

  it("is empty when there are no issues", () => {
    expect(triangleSeverities([]).size).toBe(0);
  });
});

describe("issueBounds", () => {
  it("boxes the triangles of the issue, not the whole primitive", () => {
    const bounds = issueBounds(
      issue("normal.flipped", "error", 0, 0, [1]),
      [part()],
      [instance(0, IDENTITY)],
    );

    expect(bounds).toEqual({ min: [10, 0, 0], max: [11, 1, 0] });
  });

  it("boxes all listed triangles together", () => {
    const bounds = issueBounds(
      issue("normal.flipped", "error", 0, 0, [0, 1]),
      [part()],
      [instance(0, IDENTITY)],
    );

    expect(bounds).toEqual({ min: [0, 0, 0], max: [11, 1, 0] });
  });

  it("follows the node transform, and covers every placement of the mesh", () => {
    const bounds = issueBounds(
      issue("normal.flipped", "error", 0, 0, [0]),
      [part()],
      [instance(0, IDENTITY), instance(0, moved(0, 0, 50))],
    );

    expect(bounds).toEqual({ min: [0, 0, 0], max: [1, 1, 50] });
  });

  it("ignores placements of other meshes", () => {
    const bounds = issueBounds(
      issue("normal.flipped", "error", 0, 0, [0]),
      [part(0, 0), part(1, 0)],
      [instance(0, IDENTITY), instance(1, moved(100, 0, 0))],
    );

    expect(bounds).toEqual({ min: [0, 0, 0], max: [1, 1, 0] });
  });

  it("looks in the right primitive of a mesh", () => {
    const second = part(0, 1);
    second.positions = new Float32Array([5, 5, 5, 6, 5, 5, 5, 6, 5]);
    second.triangles = new Uint32Array([0, 1, 2]);
    const bounds = issueBounds(
      issue("mesh.boundary_edge", "warning", 0, 1, [0]),
      [part(0, 0), second],
      [instance(0, IDENTITY)],
    );

    expect(bounds).toEqual({ min: [5, 5, 5], max: [6, 6, 5] });
  });

  it("skips a triangle number that is out of range", () => {
    const bounds = issueBounds(
      issue("normal.flipped", "error", 0, 0, [0, 99]),
      [part()],
      [instance(0, IDENTITY)],
    );

    expect(bounds).toEqual({ min: [0, 0, 0], max: [1, 1, 0] });
  });

  it("boxes the whole scene for a whole-asset issue", () => {
    const bounds = issueBounds(assetIssue, [part()], [instance(0, IDENTITY)]);

    expect(bounds).toEqual({ min: [0, 0, 0], max: [11, 1, 0] });
  });

  it("returns null when there is nothing to point at", () => {
    const one = issue("normal.flipped", "error", 0, 0, [0]);

    expect(issueBounds(one, [], [instance(0, IDENTITY)])).toBeNull();
    expect(issueBounds(one, [part()], [])).toBeNull();
    expect(
      issueBounds(issue("normal.flipped", "error", 0, 0, [99]), [part()], [instance(0, IDENTITY)]),
    ).toBeNull();
  });
});
