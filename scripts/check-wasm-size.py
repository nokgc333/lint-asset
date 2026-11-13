#!/usr/bin/env python3
"""Fail if a file is larger than a limit after gzip compression.

Usage: check-wasm-size.py <file> [--max-bytes N]

The default limit is 1,000,000 bytes: the WASM module must stay under 1 MB compressed.
gzip is a conservative estimate, because brotli usually compresses smaller.
"""
import argparse
import gzip
import sys
from pathlib import Path

DEFAULT_MAX_BYTES = 1_000_000


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("file", type=Path)
    parser.add_argument("--max-bytes", type=int, default=DEFAULT_MAX_BYTES)
    args = parser.parse_args()

    raw = args.file.read_bytes()
    compressed = len(gzip.compress(raw, compresslevel=9))
    print(f"{args.file}: {len(raw)} bytes raw, {compressed} bytes gzip (limit {args.max_bytes})")
    if compressed > args.max_bytes:
        print("error: the compressed size is over the limit", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
