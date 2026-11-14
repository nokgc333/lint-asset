import type { PrimitiveGeometry } from "../wasm/lint_core.mjs";
import type { Severity } from "./describe";

export function severityValue(severity: Severity): number {
  return { error: 0, warning: 1, info: 2 }[severity];
}

export function buildOverlay(
  part: Pick<PrimitiveGeometry, "positions" | "triangles">,
  flagged: ReadonlyMap<number, Severity>,
): { positions: Float32Array; severities: Float32Array; triangleCount: number } {
  const positions: number[] = [];
  const severities: number[] = [];
  for (const [triangle, severity] of [...flagged].sort(([a], [b]) => a - b)) {
    const offset = triangle * 3;
    if (!Number.isInteger(triangle) || triangle < 0 || offset + 2 >= part.triangles.length)
      continue;
    const vertices = part.triangles.subarray(offset, offset + 3);
    if (vertices.some((vertex) => vertex * 3 + 2 >= part.positions.length)) continue;
    for (const vertex of vertices) {
      positions.push(...part.positions.subarray(vertex * 3, vertex * 3 + 3));
      severities.push(severityValue(severity));
    }
  }
  return {
    positions: new Float32Array(positions),
    severities: new Float32Array(severities),
    triangleCount: severities.length / 3,
  };
}
