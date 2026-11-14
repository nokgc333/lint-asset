import math

from make_test_glbs import add_accessor, build_glb


W = 2.0
D = 1.5
H = 2.5
R = 3.8
QUAD_TRIANGLES = ((0, 1, 2), (0, 2, 3))
GABLE_TRIANGLES = ((0, 1, 2), (0, 2, 3), (0, 3, 4))


def _atlas_uvs(vertices, normal, face):
    axis = max(range(3), key=lambda i: abs(normal[i]))
    axes = [i for i in range(3) if i != axis]
    projected = [(vertex[axes[0]], vertex[axes[1]]) for vertex in vertices]
    low = [min(point[i] for point in projected) for i in range(2)]
    high = [max(point[i] for point in projected) for i in range(2)]
    col, row = face % 3, face // 3
    bounds = ((col / 3 + 0.02, (col + 1) / 3 - 0.02),
              (row / 2 + 0.02, (row + 1) / 2 - 0.02))
    scale = min((bounds[i][1] - bounds[i][0]) / (high[i] - low[i]) for i in range(2))
    return [tuple((point[i] - (low[i] + high[i]) / 2) * scale
                  + (bounds[i][0] + bounds[i][1]) / 2 for i in range(2))
            for point in projected]


def _primitive(document, data, faces, material, broken, roof=False, chimney=False):
    positions, normals, uvs, indices = [], [], [], []
    for face, (direction, vertices, triangles) in enumerate(faces):
        length = math.sqrt(sum(value * value for value in direction))
        normal = tuple(value / length for value in direction)
        for triangle in triangles:
            p0, p1, p2 = [vertices[index] for index in triangle]
            a = [p1[i] - p0[i] for i in range(3)]
            b = [p2[i] - p0[i] for i in range(3)]
            cross = (a[1] * b[2] - a[2] * b[1],
                     a[2] * b[0] - a[0] * b[2],
                     a[0] * b[1] - a[1] * b[0])
            assert sum(cross[i] * normal[i] for i in range(3)) > 0
        if roof:
            u0, u1 = (0.02, 0.98) if broken else ((0.02, 0.48) if face == 0 else (0.52, 0.98))
            face_uvs = [(u0 + (z + D) / (2 * D) * (u1 - u0),
                         0.02 + (y - H) / (R - H) * 0.96) for x, y, z in vertices]
        else:
            face_uvs = _atlas_uvs(vertices, normal, face)
        if broken and chimney and face == 4:
            face_uvs = [(u + 1.5, v) for u, v in face_uvs]
        if broken and roof and face == 1:
            normal = tuple(-value for value in normal)
        base = len(positions) // 3
        positions.extend(value for vertex in vertices for value in vertex)
        normals.extend(value for _ in vertices for value in normal)
        uvs.extend(value for uv in face_uvs for value in uv)
        for triangle_index, triangle in enumerate(triangles):
            if broken and material == 0 and face == 3 and triangle_index == 1:
                continue
            indices.extend(base + index for index in triangle)
    attributes = {
        "POSITION": add_accessor(document, data, positions, 5126, "VEC3"),
        "NORMAL": add_accessor(document, data, normals, 5126, "VEC3"),
        "TEXCOORD_0": add_accessor(document, data, uvs, 5126, "VEC2"),
    }
    return {"attributes": attributes,
            "indices": add_accessor(document, data, indices, 5123, "SCALAR"),
            "material": material, "mode": 4}


def _toy_house(broken):
    walls = [
        ((0, 0, 1), [(-W, 0, D), (W, 0, D), (W, H, D), (0, R, D), (-W, H, D)], GABLE_TRIANGLES),
        ((0, 0, -1), [(W, 0, -D), (-W, 0, -D), (-W, H, -D), (0, R, -D), (W, H, -D)], GABLE_TRIANGLES),
        ((-1, 0, 0), [(-W, 0, -D), (-W, 0, D), (-W, H, D), (-W, H, -D)], QUAD_TRIANGLES),
        ((1, 0, 0), [(W, 0, D), (W, 0, -D), (W, H, -D), (W, H, D)], QUAD_TRIANGLES),
        ((0, -1, 0), [(-W, 0, -D), (W, 0, -D), (W, 0, D), (-W, 0, D)], QUAD_TRIANGLES),
    ]
    roof = [
        ((-(R - H), W, 0), [(-W, H, -D), (-W, H, D), (0, R, D), (0, R, -D)], QUAD_TRIANGLES),
        (((R - H), W, 0), [(W, H, D), (W, H, -D), (0, R, -D), (0, R, D)], QUAD_TRIANGLES),
    ]
    x0, x1, y0, y1, z0, z1 = 0.8, 1.4, 3.0, 4.5, -0.6, 0.0
    chimney = [
        ((0, 0, 1), [(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], QUAD_TRIANGLES),
        ((0, 0, -1), [(x1, y0, z0), (x0, y0, z0), (x0, y1, z0), (x1, y1, z0)], QUAD_TRIANGLES),
        ((-1, 0, 0), [(x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0)], QUAD_TRIANGLES),
        ((1, 0, 0), [(x1, y0, z1), (x1, y0, z0), (x1, y1, z0), (x1, y1, z1)], QUAD_TRIANGLES),
        ((0, 1, 0), [(x0, y1, z1), (x1, y1, z1), (x1, y1, z0), (x0, y1, z0)], QUAD_TRIANGLES),
        ((0, -1, 0), [(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], QUAD_TRIANGLES),
    ]
    document = {
        "asset": {"version": "2.0", "generator": "lint-asset sample generator",
                  "copyright": "CC0 1.0 Universal (public domain dedication)"},
        "materials": [{"name": name, "pbrMetallicRoughness": {"baseColorFactor": color}}
                      for name, color in [("walls", [0.8, 0.7, 0.5, 1.0]),
                                          ("roof", [0.7, 0.1, 0.1, 1.0]),
                                          ("chimney", [0.35, 0.18, 0.08, 1.0])]],
        "nodes": [{"mesh": 0}, {"mesh": 1}],
        "scenes": [{"nodes": [0, 1]}], "scene": 0,
    }
    data = bytearray()
    document["meshes"] = [
        {"name": "house", "primitives": [
            _primitive(document, data, walls, 0, broken),
            _primitive(document, data, roof, 1, broken, roof=True)]},
        {"name": "chimney", "primitives": [
            _primitive(document, data, chimney, 2, broken, chimney=True)]},
    ]
    if broken:
        document["images"] = [{"uri": "textures/toy-house.png"}]
        document["textures"] = [{"source": 0}]
        document["materials"][0]["pbrMetallicRoughness"]["baseColorTexture"] = {"index": 0}
    return build_glb(document, bytes(data))


def toy_house_clean():
    return _toy_house(False)


def toy_house_broken():
    return _toy_house(True)
