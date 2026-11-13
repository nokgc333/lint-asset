export function normalLines(
  positions: Float32Array,
  normals: Float32Array,
  length: number,
): Float32Array {
  if (!normals.length || positions.length !== normals.length) return new Float32Array(0);
  const lines = new Float32Array(positions.length * 2);
  let offset = 0;
  for (let i = 0; i + 2 < positions.length; i += 3) {
    const x = Number(positions[i]);
    const y = Number(positions[i + 1]);
    const z = Number(positions[i + 2]);
    const nx = Number(normals[i]);
    const ny = Number(normals[i + 1]);
    const nz = Number(normals[i + 2]);
    if (![x, y, z, nx, ny, nz].every(Number.isFinite)) continue;
    lines.set([x, y, z, x + nx * length, y + ny * length, z + nz * length], offset);
    offset += 6;
  }
  return lines.subarray(0, offset);
}
