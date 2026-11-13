import type { Vec3 } from "./vec3";

export interface Bounds {
  readonly min: Vec3;
  readonly max: Vec3;
}

export function computeBounds(positions: ArrayLike<number>): Bounds | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (let i = 0; i + 2 < positions.length; i += 3) {
    const x = Number(positions[i]);
    const y = Number(positions[i + 1]);
    const z = Number(positions[i + 2]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }
  return minX === Number.POSITIVE_INFINITY
    ? null
    : {
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ],
      };
}

export function transformBounds(bounds: Bounds, matrix: ArrayLike<number>): Bounds {
  const corners: number[] = [];
  for (const x of [bounds.min[0], bounds.max[0]]) {
    for (const y of [bounds.min[1], bounds.max[1]]) {
      for (const z of [bounds.min[2], bounds.max[2]]) {
        const w =
          Number(matrix[3]) * x +
          Number(matrix[7]) * y +
          Number(matrix[11]) * z +
          Number(matrix[15]);
        for (let axis = 0; axis < 3; axis++) {
          corners.push(
            (Number(matrix[axis]) * x +
              Number(matrix[axis + 4]) * y +
              Number(matrix[axis + 8]) * z +
              Number(matrix[axis + 12])) /
              w,
          );
        }
      }
    }
  }
  const transformed = computeBounds(corners);
  if (!transformed) throw new Error("Invalid bounds transform");
  return transformed;
}

export function mergeBounds(a: Bounds | null, b: Bounds | null): Bounds | null {
  if (!a) return b;
  if (!b) return a;
  return {
    min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1]), Math.min(a.min[2], b.min[2])],
    max: [Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1]), Math.max(a.max[2], b.max[2])],
  };
}

export function boundsCenter(bounds: Bounds): Vec3 {
  return [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
}

export function boundsRadius(bounds: Bounds): number {
  return (
    Math.hypot(
      bounds.max[0] - bounds.min[0],
      bounds.max[1] - bounds.min[1],
      bounds.max[2] - bounds.min[2],
    ) / 2
  );
}

export function sceneBounds(
  parts: readonly { mesh: number; positions: Float32Array }[],
  instances: readonly { mesh: number; world: ArrayLike<number> }[],
): Bounds | null {
  const byMesh = new Map<number, Bounds[]>();
  for (const part of parts) {
    const local = computeBounds(part.positions);
    if (!local) continue;
    const boxes = byMesh.get(part.mesh) ?? [];
    boxes.push(local);
    byMesh.set(part.mesh, boxes);
  }
  let result: Bounds | null = null;
  for (const instance of instances) {
    for (const local of byMesh.get(instance.mesh) ?? []) {
      result = mergeBounds(result, transformBounds(local, instance.world));
    }
  }
  return result;
}
