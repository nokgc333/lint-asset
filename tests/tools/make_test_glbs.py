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


def add_accessor(document, data, values, component_type, accessor_type):
    formats = {5123: "H", 5125: "I", 5126: "f"}
    widths = {"SCALAR": 1, "VEC3": 3}
    data.extend(b"\0" * (-len(data) % 4))
    packed = struct.pack("<" + formats[component_type] * len(values), *values)
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
    accessors.append(accessor)
    data.extend(packed)
    document["buffers"] = [{"byteLength": len(data)}]
    return len(accessors) - 1


def cube_document(flipped=False, open_top=False):
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


def cube_flipped_normals():
    return build_glb(*cube_document(flipped=True))


def cube_open_top():
    return build_glb(*cube_document(open_top=True))


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


def external_image_uri():
    document, data = cube_document()
    document["images"] = [{"uri": "https://example.invalid/a.png"}]
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


def main():
    if len(sys.argv) != 2:
        sys.exit("Usage: python3 make_test_glbs.py <out_dir>")
    output = Path(sys.argv[1])
    output.mkdir(parents=True, exist_ok=True)
    builders = [
        cube, cube_flipped_normals, cube_open_top, primitive_modes, external_image_uri,
        unknown_extension_used, required_supported_extension, bad_version_1,
        external_buffer_uri, truncated_cube, length_mismatch, invalid_json, missing_asset,
        accessor_out_of_range, huge_accessor_count, required_draco, required_unknown_extension,
    ]
    for builder in builders:
        (output / (builder.__name__ + ".glb")).write_bytes(builder())


if __name__ == "__main__":
    main()
