"""Writes large GLB files for measuring the inspection time (NFR-002).

Usage: make_perf_models.py <output dir>

Each file is a closed torus with shared vertices, analytic normals, and one UV island that covers
the whole texture. The result is fully deterministic. A torus has no poles, so it has no
degenerate triangle, and it is closed and manifold, so a correct inspection of 10,000 or 100,000
triangles reports nothing; the 1,000,000 one reports only that it draws more triangles than the
limit (asset.triangle_count_exceeded).
"""
import math
import struct
import sys
from array import array
from pathlib import Path

from make_test_glbs import add_accessor, build_glb

MAJOR_RADIUS = 1.0
MINOR_RADIUS = 0.4

# name -> (rings around the tube, segments around the ring); triangles = 2 * rings * segments.
SIZES = {
    "perf_10k": (50, 100),
    "perf_100k": (200, 250),
    "perf_1m": (500, 1000),
}


def torus(rings, segments):
    positions = array("f")
    normals = array("f")
    uvs = array("f")
    # One extra column and row for the UV seam. The position comes from the index modulo the
    # count, so both sides of a seam get exactly the same position and the vertices weld.
    for i in range(rings + 1):
        phi = 2 * math.pi * (i % rings) / rings
        cos_phi, sin_phi = math.cos(phi), math.sin(phi)
        for j in range(segments + 1):
            theta = 2 * math.pi * (j % segments) / segments
            cos_theta, sin_theta = math.cos(theta), math.sin(theta)
            radius = MAJOR_RADIUS + MINOR_RADIUS * cos_phi
            positions.extend((radius * cos_theta, MINOR_RADIUS * sin_phi, radius * sin_theta))
            normals.extend((cos_phi * cos_theta, sin_phi, cos_phi * sin_theta))
            uvs.extend((j / segments, i / rings))
    indices = array("I")
    columns = segments + 1
    for i in range(rings):
        for j in range(segments):
            a = i * columns + j
            b = a + 1
            c = a + columns
            d = c + 1
            # Counter-clockwise seen from outside, so the winding agrees with the normals.
            indices.extend((a, d, b, a, c, d))
    return positions, normals, uvs, indices


def build(rings, segments):
    positions, normals, uvs, indices = torus(rings, segments)
    document = {"asset": {"version": "2.0", "generator": "lint-asset performance models"}}
    data = bytearray()
    attributes = {
        "POSITION": add_accessor(document, data, positions, 5126, "VEC3"),
        "NORMAL": add_accessor(document, data, normals, 5126, "VEC3"),
        "TEXCOORD_0": add_accessor(document, data, uvs, 5126, "VEC2"),
    }
    index = add_accessor(document, data, indices, 5125, "SCALAR")
    document["meshes"] = [{"primitives": [{"attributes": attributes, "indices": index}]}]
    document["nodes"] = [{"mesh": 0}]
    document["scenes"] = [{"nodes": [0]}]
    document["scene"] = 0
    return build_glb(document, bytes(data))


def main():
    output = Path(sys.argv[1])
    output.mkdir(parents=True, exist_ok=True)
    for name, (rings, segments) in SIZES.items():
        (output / f"{name}.glb").write_bytes(build(rings, segments))
        print(f"{name}.glb: {2 * rings * segments} triangles")


if __name__ == "__main__":
    main()
