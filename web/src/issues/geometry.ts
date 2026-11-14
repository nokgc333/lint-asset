import {
  type Bounds,
  computeBounds,
  mergeBounds,
  sceneBounds,
  transformBounds,
} from "../viewer/bounds";
import type { Issue, MeshInstance, PrimitiveGeometry } from "../wasm/lint_core.mjs";
import { type Severity, severityRank } from "./describe";

export function triangleSeverities(issues: readonly Issue[]): Map<string, Map<number, Severity>> {
  const result = new Map<string, Map<number, Severity>>();
  for (const issue of issues) {
    if (issue.element_kind !== "triangle") continue;
    const key = `${issue.target.mesh}:${issue.target.primitive}`;
    const triangles = result.get(key) ?? new Map<number, Severity>();
    result.set(key, triangles);
    for (const triangle of issue.elements) {
      const current = triangles.get(triangle);
      if (current === undefined || severityRank(issue.severity) < severityRank(current)) {
        triangles.set(triangle, issue.severity);
      }
    }
  }
  return result;
}

export function issueBounds(
  issue: Issue,
  parts: readonly PrimitiveGeometry[],
  instances: readonly MeshInstance[],
): Bounds | null {
  if (issue.element_kind === "asset") return sceneBounds(parts, instances);
  const part = parts.find(
    (part) => part.mesh === issue.target.mesh && part.primitive === issue.target.primitive,
  );
  if (!part) return null;
  let local: Bounds | null = null;
  for (const triangle of issue.elements) {
    const offset = triangle * 3;
    if (!Number.isInteger(triangle) || triangle < 0 || offset + 2 >= part.triangles.length)
      continue;
    for (let corner = 0; corner < 3; corner++) {
      const vertex = part.triangles[offset + corner];
      if (vertex === undefined || vertex * 3 + 2 >= part.positions.length) continue;
      local = mergeBounds(
        local,
        computeBounds(part.positions.subarray(vertex * 3, vertex * 3 + 3)),
      );
    }
  }
  if (!local) return null;
  let result: Bounds | null = null;
  for (const instance of instances) {
    if (instance.mesh === part.mesh) {
      result = mergeBounds(result, transformBounds(local, instance.world));
    }
  }
  return result;
}
