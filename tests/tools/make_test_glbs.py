import json
import struct
import sys
from pathlib import Path


def build_container(json_bytes, bin_bytes, version=2):
    json_bytes += b" " * (-len(json_bytes) % 4)
    bin_bytes += b"\0" * (-len(bin_bytes) % 4)
    chunks = struct.pack("<II", len(json_bytes), 0x4E4F534A) + json_bytes
    chunks += struct.pack("<II", len(bin_bytes), 0x004E4942) + bin_bytes
    return struct.pack("<4sII", b"glTF", version, 12 + len(chunks)) + chunks


def build_glb(json_obj, bin_bytes, version=2):
    encoded = json.dumps(json_obj, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return build_container(encoded, bin_bytes, version)


def add_accessor(document, data, values, component_type, accessor_type, byte_stride=None, normalized=False):
    formats = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}
    widths = {"SCALAR": 1, "VEC2": 2, "VEC3": 3}
    data.extend(b"\0" * (-len(data) % 4))
    packed = struct.pack("<" + formats[component_type] * len(values), *values)
    if byte_stride is not None:
        element_size = struct.calcsize(formats[component_type]) * widths[accessor_type]
        packed = b"".join(
            packed[offset:offset + element_size] + b"\0" * (byte_stride - element_size)
            for offset in range(0, len(packed), element_size)
        )
    views = document.setdefault("bufferViews", [])
    accessors = document.setdefault("accessors", [])
    accessor = {
        "bufferView": len(views),
        "componentType": component_type,
        "count": len(values) // widths[accessor_type],
        "type": accessor_type,
    }
    if accessor_type == "VEC3":
        accessor["min"] = [min(values[axis::3]) for axis in range(3)]
        accessor["max"] = [max(values[axis::3]) for axis in range(3)]
    views.append({"buffer": 0, "byteOffset": len(data), "byteLength": len(packed)})
    if byte_stride is not None:
        views[-1]["byteStride"] = byte_stride
    if normalized:
        accessor["normalized"] = True
    accessors.append(accessor)
    data.extend(packed)
    document["buffers"] = [{"byteLength": len(data)}]
    return len(accessors) - 1


def cube_document(flipped=False, open_top=False, position_scale=1, degenerate=False):
    positions = [
        0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0,
        0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1,
    ]
    indices = [
        0, 2, 1, 0, 3, 2,
        4, 5, 6, 4, 6, 7,
        0, 1, 5, 0, 5, 4,
        1, 2, 6, 1, 6, 5,
        2, 3, 7, 2, 7, 6,
        3, 0, 4, 3, 4, 7,
    ]
    if open_top:
        del indices[24:30]
    direction = -1 if flipped else 1
    normals = [(value * 2 - 1) * direction * 3 ** -0.5 for value in positions]
    positions = [value * position_scale for value in positions]
    if degenerate:
        positions.extend([0.1, 0.1, 0.1, 0.5, 0.5, 0.5, 0.9, 0.9, 0.9])
        normals.extend([0, 0, 1] * 3)
        indices.extend([8, 9, 10])
    document = {"asset": {"version": "2.0"}}
    data = bytearray()
    position = add_accessor(document, data, positions, 5126, "VEC3")
    normal = add_accessor(document, data, normals, 5126, "VEC3")
    index = add_accessor(document, data, indices, 5123, "SCALAR")
    document["meshes"] = [{"primitives": [{
        "attributes": {"POSITION": position, "NORMAL": normal},
        "indices": index,
        "mode": 4,
    }]}]
    document["nodes"] = [{"mesh": 0}]
    document["scenes"] = [{"nodes": [0]}]
    document["scene"] = 0
    return document, bytes(data)


def cube():
    return build_glb(*cube_document())


def cube_small():
    document, data = cube_document()
    document["nodes"][0]["scale"] = [0.005, 0.005, 0.005]
    return build_glb(document, data)


def cube_huge():
    document, data = cube_document()
    document["nodes"][0]["scale"] = [1500, 1500, 1500]
    return build_glb(document, data)


def cube_cm_export():
    document, data = cube_document(position_scale=100)
    document["nodes"] = [{"scale": [0.01, 0.01, 0.01], "children": [1]}, {"mesh": 0}]
    return build_glb(document, data)


def cube_with_degenerate():
    return build_glb(*cube_document(degenerate=True))


def cube_flipped_normals():
    return build_glb(*cube_document(flipped=True))


def cube_open_top():
    return build_glb(*cube_document(open_top=True))


def flat_cube(normal_scales, uv_offset_face=None, uv_overlap=None):
    faces = [
        ((0, 0, -1), [(0, 0, 0), (0, 1, 0), (1, 1, 0), (1, 0, 0)]),
        ((0, 0, 1), [(0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)]),
        ((-1, 0, 0), [(0, 0, 0), (0, 0, 1), (0, 1, 1), (0, 1, 0)]),
        ((1, 0, 0), [(1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1)]),
        ((0, -1, 0), [(0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)]),
        ((0, 1, 0), [(0, 1, 0), (0, 1, 1), (1, 1, 1), (1, 1, 0)]),
    ]
    positions, normals, indices, uvs = [], [], [], []
    for face, (outward, vertices) in enumerate(faces):
        for triangle in [(0, 1, 2), (0, 2, 3)]:
            v0, v1, v2 = [vertices[index] for index in triangle]
            a = [v1[axis] - v0[axis] for axis in range(3)]
            b = [v2[axis] - v0[axis] for axis in range(3)]
            cross = [a[1] * b[2] - a[2] * b[1],
                     a[2] * b[0] - a[0] * b[2],
                     a[0] * b[1] - a[1] * b[0]]
            assert cross == list(outward)
        atlas_face = 0 if face == 1 and uv_overlap is not None else face
        col, row = atlas_face % 3, atlas_face // 3
        u0, u1 = col / 3 + 0.01, (col + 1) / 3 - 0.01
        v0, v1 = row / 2 + 0.01, (row + 1) / 2 - 0.01
        offset = 2.0 if face == uv_offset_face else 0.0
        face_uvs = [u0 + offset, v0, u1 + offset, v0,
                    u1 + offset, v1, u0 + offset, v1]
        if face == 1 and uv_overlap == "mirrored":
            face_uvs[::2] = [(u0 + u1) - u for u in face_uvs[::2]]
        uvs.extend(face_uvs)
        positions.extend(value for vertex in vertices for value in vertex)
        normals.extend(value * normal_scales[face] for _ in vertices for value in outward)
        indices.extend(face * len(vertices) + index for index in (0, 1, 2, 0, 2, 3))
    document = {"asset": {"version": "2.0"}}
    data = bytearray()
    position = add_accessor(document, data, positions, 5126, "VEC3")
    normal = add_accessor(document, data, normals, 5126, "VEC3")
    uv = add_accessor(document, data, uvs, 5126, "VEC2")
    index = add_accessor(document, data, indices, 5123, "SCALAR")
    document["meshes"] = [{"primitives": [{
        "attributes": {"POSITION": position, "NORMAL": normal, "TEXCOORD_0": uv},
        "indices": index, "mode": 4,
    }]}]
    document["nodes"] = [{"mesh": 0}]
    document["scenes"] = [{"nodes": [0]}]
    document["scene"] = 0
    return build_glb(document, bytes(data))


def cube_flat():
    return flat_cube([1] * 6)


def cube_uv_overlap_same():
    return flat_cube([1] * 6, uv_overlap="same")


def cube_uv_overlap_mirrored():
    return flat_cube([1] * 6, uv_overlap="mirrored")


def cube_uv_out_of_range():
    return flat_cube([1] * 6, uv_offset_face=3)


def cube_faces_flipped():
    return flat_cube([1, -1, 1, 1, -1, 1])


def cube_unnormalized():
    return flat_cube([2, 1, 0.5, 1.005, 1.02, 1])


def primitive_modes():
    document = {"asset": {"version": "2.0"}, "meshes": []}
    data = bytearray()
    points = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, -1, 0, 0]
    primitives = []
    for mode, count, indexed in [(4, 3, True), (5, 4, True), (6, 5, False), (0, 4, False)]:
        position = add_accessor(document, data, points[:count * 3], 5126, "VEC3")
        primitive = {"attributes": {"POSITION": position}, "mode": mode}
        if indexed:
            primitive["indices"] = add_accessor(document, data, list(range(count)), 5123, "SCALAR")
        primitives.append(primitive)
    document["meshes"] = [{"primitives": primitives[:2]}, {"primitives": primitives[2:]}]
    document["nodes"] = [{"mesh": 0}, {"mesh": 1}]
    document["scenes"] = [{"nodes": [0, 1]}]
    document["scene"] = 0
    return build_glb(document, bytes(data))


def three_pages():
    document = {"asset": {"version": "2.0"}}
    data = bytearray()
    positions = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, -1, 0]
    position = add_accessor(document, data, positions, 5126, "VEC3")
    index = add_accessor(document, data, [0, 1, 2, 0, 1, 3, 0, 1, 4], 5123, "SCALAR")
    document["meshes"] = [{"primitives": [{
        "attributes": {"POSITION": position}, "indices": index, "mode": 4,
    }]}]
    document["nodes"] = [{"mesh": 0}]
    document["scenes"] = [{"nodes": [0]}]
    document["scene"] = 0
    return build_glb(document, bytes(data))


def external_image_uri():
    document, data = cube_document()
    document["images"] = [{"uri": "https://example.invalid/a.png"}]
    document["textures"] = [{"source": 0}]
    document["materials"] = [{"pbrMetallicRoughness": {"baseColorTexture": {"index": 0}}}]
    document["meshes"][0]["primitives"][0]["material"] = 0
    return build_glb(document, data)


def external_image_uris_mixed():
    document, data = cube_document()
    document["images"] = [{"uri": uri} for uri in [
        "https://example.invalid/a.png",
        "textures/b.png",
        "C:\\Users\\me\\c.png",
        "//cdn.example.invalid/d.png",
        "data:image/png;base64,iVBORw0KGgo=",
        "HTTPS://UPPER.example.invalid/e.png",
    ]]
    document["textures"] = [{"source": 0}]
    document["materials"] = [{"pbrMetallicRoughness": {"baseColorTexture": {"index": 0}}}]
    document["meshes"][0]["primitives"][0]["material"] = 0
    return build_glb(document, data)


def embedded_image_uri():
    document, data = cube_document()
    document["images"] = [{"uri": "data:image/png;base64,iVBORw0KGgo="}]
    document["textures"] = [{"source": 0}]
    document["materials"] = [{"pbrMetallicRoughness": {"baseColorTexture": {"index": 0}}}]
    document["meshes"][0]["primitives"][0]["material"] = 0
    return build_glb(document, data)


def extension_cube(extension, required=False):
    document, data = cube_document()
    document["extensionsUsed"] = [extension]
    if required:
        document["extensionsRequired"] = [extension]
    return build_glb(document, data)


def unknown_extension_used():
    return extension_cube("VENDOR_unknown")


def required_supported_extension():
    return extension_cube("KHR_mesh_quantization", required=True)


def bad_version_1():
    return build_glb(*cube_document(), version=1)


def external_buffer_uri():
    document, _ = cube_document()
    document["buffers"][0]["uri"] = "other.bin"
    return build_glb(document, b"")


def truncated_cube():
    document, data = cube_document()
    complete = build_glb(document, data)
    return complete[:len(complete) - len(data) // 2]


def length_mismatch():
    data = bytearray(cube())
    struct.pack_into("<I", data, 8, len(data) + 100)
    return bytes(data)


def invalid_json():
    return build_container(b'{"asset": {', b"")


def missing_asset():
    document, data = cube_document()
    del document["asset"]
    return build_glb(document, data)


def accessor_out_of_range():
    document, data = cube_document()
    index = document["meshes"][0]["primitives"][0]["indices"]
    document["accessors"][index]["count"] += 3
    return build_glb(document, data)


def huge_accessor_count():
    document, data = cube_document()
    primitive = document["meshes"][0]["primitives"][0]
    document["accessors"][primitive["indices"]] = {
        "componentType": 5125, "type": "SCALAR", "count": 6000000000,
    }
    return build_glb(document, data)


def required_draco():
    return extension_cube("KHR_draco_mesh_compression", required=True)


def required_unknown_extension():
    return extension_cube("VENDOR_unknown", required=True)


def triangle_document():
    document = {"asset": {"version": "2.0"}}
    data = bytearray()
    position = add_accessor(document, data, [0, 0, 0, 1, 0, 0, 0, 1, 0], 5126, "VEC3")
    index = add_accessor(document, data, [0, 1, 2], 5123, "SCALAR")
    document["meshes"] = [{"primitives": [{"attributes": {"POSITION": position},
                                            "indices": index, "mode": 4}]}]
    document["nodes"] = [{"mesh": 0}]
    document["scenes"] = [{"nodes": [0]}]
    document["scene"] = 0
    return document, data


def uv_ushort_normalized():
    document, data = triangle_document()
    uv = add_accessor(document, data, [0, 0, 65535, 0, 32768, 65535],
                      5123, "VEC2", normalized=True)
    document["meshes"][0]["primitives"][0]["attributes"]["TEXCOORD_0"] = uv
    return build_glb(document, data)


def uv_count_mismatch():
    document, data = triangle_document()
    uv = add_accessor(document, data, [0, 0, 1, 0], 5126, "VEC2")
    document["meshes"][0]["primitives"][0]["attributes"]["TEXCOORD_0"] = uv
    return build_glb(document, data)


def uv_wrong_type():
    document, data = triangle_document()
    uv = add_accessor(document, data, [0, 0, 0, 1, 0, 0, 0, 1, 0], 5126, "VEC3")
    document["meshes"][0]["primitives"][0]["attributes"]["TEXCOORD_0"] = uv
    return build_glb(document, data)


def node_transforms():
    document, data = triangle_document()
    document["nodes"] = [{"translation": [10, 0, 0], "children": [1]},
                         {"mesh": 0, "scale": [2, 2, 2]},
                         {"mesh": 0, "matrix": [1, 0, 0, 0, 0, 1, 0, 0,
                                                 0, 0, 1, 0, 0, 5, 0, 1]}]
    document["scenes"] = [{"nodes": [0, 2]}]
    return build_glb(document, data)


def quantized_strided():
    document = {"asset": {"version": "2.0"}}
    data = bytearray()
    position = add_accessor(document, data, [0, 0, 0, 100, 0, 0, 0, 200, 0],
                            5122, "VEC3", byte_stride=8)
    normal = add_accessor(document, data, [127, 0, 0, -128, 0, 0, 0, 0, 127],
                          5120, "VEC3", byte_stride=4, normalized=True)
    document["meshes"] = [{"primitives": [{"attributes": {"POSITION": position,
                                                                "NORMAL": normal}, "mode": 4}]}]
    document["nodes"] = [{"mesh": 0}]
    document["scenes"] = [{"nodes": [0]}]
    document["scene"] = 0
    return build_glb(document, data)


def index_out_of_vertex_range():
    document, data = cube_document()
    data = bytearray(data)
    accessor = document["accessors"][document["meshes"][0]["primitives"][0]["indices"]]
    offset = document["bufferViews"][accessor["bufferView"]]["byteOffset"]
    struct.pack_into("<H", data, offset, 99)
    return build_glb(document, data)


def sparse_accessor():
    document, data = triangle_document()
    index = add_accessor(document, data, [0], 5123, "SCALAR")
    value = add_accessor(document, data, [0, 0, 0], 5126, "VEC3")
    document["accessors"][0]["sparse"] = {
        "count": 1,
        "indices": {"bufferView": document["accessors"][index]["bufferView"], "componentType": 5123},
        "values": {"bufferView": document["accessors"][value]["bufferView"]},
    }
    return build_glb(document, data)


def node_cycle():
    document, data = cube_document()
    document["nodes"] = [{"mesh": 0, "children": [0]}]
    return build_glb(document, data)


def node_instance_explosion():
    document, data = triangle_document()
    document["nodes"] = [{"children": [i + 1, i + 1]} for i in range(20)] + [{"mesh": 0}]
    return build_glb(document, data)


def sample_toy_house_clean():
    from sample_models import toy_house_clean
    return toy_house_clean()


def sample_toy_house_broken():
    from sample_models import toy_house_broken
    return toy_house_broken()


def main():
    if len(sys.argv) != 2:
        sys.exit("Usage: python3 make_test_glbs.py <out_dir>")
    output = Path(sys.argv[1])
    output.mkdir(parents=True, exist_ok=True)
    builders = [
        sample_toy_house_clean, sample_toy_house_broken,
        cube_uv_overlap_same, cube_uv_overlap_mirrored,
        cube_flat, cube_uv_out_of_range, uv_ushort_normalized, uv_count_mismatch, uv_wrong_type,
        node_transforms, quantized_strided, index_out_of_vertex_range, sparse_accessor,
        node_cycle, node_instance_explosion,
        cube_small, cube_huge, cube_cm_export, cube_with_degenerate,
        cube, cube_flipped_normals, cube_open_top, cube_faces_flipped, cube_unnormalized,
        primitive_modes, three_pages, external_image_uri,
        external_image_uris_mixed, embedded_image_uri,
        unknown_extension_used, required_supported_extension, bad_version_1,
        external_buffer_uri, truncated_cube, length_mismatch, invalid_json, missing_asset,
        accessor_out_of_range, huge_accessor_count, required_draco, required_unknown_extension,
    ]
    for builder in builders:
        (output / (builder.__name__ + ".glb")).write_bytes(builder())


if __name__ == "__main__":
    main()
