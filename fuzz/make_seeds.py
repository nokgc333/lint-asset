"""Writes the seed corpus for the fuzz targets.

Usage: python3 fuzz/make_seeds.py <fixture dir> <samples dir> <out dir>

<fixture dir> is where tests/tools/make_test_glbs.py wrote its files. Nothing is copied from the
fixture or samples folders into the repository: the seeds are written into <out dir> only.
"""
import struct
import sys
from pathlib import Path

CUBE_OBJ = (
    "v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nv 0 0 1\nv 1 0 1\nv 1 1 1\nv 0 1 1\n"
    "vt 0 0\nvt 1 0\nvt 1 1\nvt 0 1\nvn 0 0 -1\nvn 0 0 1\nvn 0 -1 0\nvn 0 1 0\nvn -1 0 0\nvn 1 0 0\n"
    "f 1/1/1 4/2/1 3/3/1 2/4/1\nf 5/1/2 6/2/2 7/3/2 8/4/2\nf 1/1/3 2/2/3 6/3/3 5/4/3\n"
    "f 4/1/4 8/2/4 7/3/4 3/4/4\nf 1/1/5 5/2/5 8/3/5 4/4/5\nf 2/1/6 3/2/6 7/3/6 6/4/6\n"
)
OBJ_SEEDS = {
    "cube.obj": CUBE_OBJ,
    "cube_plain.obj": "v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1 2 3 4\n",
    "negative.obj": "v 0 0 0\nv 1 0 0\nv 0 1 0\nf -3 -2 -1\n",
    "ignored.obj": "﻿# c\r\nmtllib a.mtl\r\no x\r\ng y\r\ns off\r\nusemtl m\r\nv 0 0 0\r\nv 1 0 0\r\n"
    "v 0 1 0\r\nl 1 2\r\np 1\r\nf 1 2 \\\r\n 3\r\n",
    "polygon.obj": "v 0 0 0\nv 1 0 0\nv 2 1 0\nv 1 2 0\nv 0 1 0\nf 1 2 3 4 5\n",
}


def frame(*chunks):
    """The framing used by fuzz_gltf: a 2-byte little-endian length before each chunk."""
    return b"".join(struct.pack("<H", len(chunk)) + chunk for chunk in chunks)


def write(directory, name, content):
    directory.mkdir(parents=True, exist_ok=True)
    (directory / name).write_bytes(content if isinstance(content, bytes) else content.encode())


def main():
    if len(sys.argv) != 4:
        sys.exit("Usage: python3 make_seeds.py <fixture dir> <samples dir> <out dir>")
    fixtures, samples, out = (Path(arg) for arg in sys.argv[1:])

    for path in sorted(fixtures.glob("*.glb")) + sorted(samples.glob("*.glb")):
        write(out / "glb", path.name, path.read_bytes())

    bins = {path.name: path.read_bytes() for path in fixtures.glob("*.bin")}
    for path in sorted(fixtures.glob("*.gltf")):
        text = path.read_bytes()
        files = []
        for name, content in bins.items():
            files += [name.encode(), content]
        write(out / "gltf", path.name, frame(text, *files))
        write(out / "gltf", path.stem + "_nofiles.gltf", frame(text))

    for name, text in OBJ_SEEDS.items():
        write(out / "obj", name, text)

    # Texture seeds: the target reads sizes and pixels with FuzzedDataProvider, so any bytes work;
    # a few small patterns give the fuzzer a start.
    for index, pattern in enumerate([bytes(range(256)), b"\x01" * 200, b"\xff" * 300, bytes(64)]):
        write(out / "texture", f"pattern{index}", pattern)


if __name__ == "__main__":
    main()
