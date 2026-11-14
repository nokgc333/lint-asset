"""Runs the libFuzzer targets for a fixed time and reports a failure without leaking the input.

Usage: python3 fuzz/run_fuzz.py <build dir> <corpus dir> <seconds per target> [target ...]

A crashing input can be a way to attack the tool until the bug is fixed, and the log of a public
repository is public. So the output of a failing run is redacted: the lines that print the input
(the hex dump and the Base64 line) are removed, and what stays is the sanitizer report, the seed,
and the size and SHA-256 of the input. The crash file stays in <build dir>/fuzz-artifacts/ (it is
not uploaded anywhere); re-run with the printed seed to get it again, and keep it in the private
folder for crashing inputs until the bug is fixed.
"""
import hashlib
import random
import re
import subprocess
import sys
from pathlib import Path

TARGETS = ["fuzz_glb", "fuzz_gltf", "fuzz_obj", "fuzz_texture"]
CORPUS_NAMES = {"fuzz_glb": "glb", "fuzz_gltf": "gltf", "fuzz_obj": "obj", "fuzz_texture": "texture"}
MAX_LEN = 65536
TIMEOUT_SECONDS = 10
RSS_LIMIT_MB = 2048
TAIL_LINES = 120
# How libFuzzer prints a crashing input: after the "MS:" line come the input as a hex dump and as
# an escaped string, up to the "artifact_prefix" line; then a "Base64:" line follows.
INPUT_START = re.compile(r"^MS: ")
INPUT_END = re.compile(r"^artifact_prefix=")
INPUT_LINE = re.compile(r"^(Base64:|0x[0-9a-fA-F]{1,2},|\{ 0x)")


def redact(text):
    kept = []
    inside = False
    for line in text.splitlines():
        if inside:
            if INPUT_END.match(line):
                inside = False
            else:
                continue
        if INPUT_START.match(line):
            kept.append(line)
            inside = True
            continue
        if not INPUT_LINE.match(line):
            kept.append(line)
    return "\n".join(kept)


def run_target(build_dir, corpus_root, seconds, name):
    artifacts = build_dir / "fuzz-artifacts" / name
    artifacts.mkdir(parents=True, exist_ok=True)
    work = build_dir / "fuzz-work" / name  # the corpus the fuzzer grows
    work.mkdir(parents=True, exist_ok=True)
    seed = random.SystemRandom().randrange(1, 2**31)
    command = [
        str(build_dir / "fuzz" / name),
        str(work),
        str(corpus_root / CORPUS_NAMES[name]),
        f"-max_total_time={seconds}",
        f"-max_len={MAX_LEN}",
        f"-timeout={TIMEOUT_SECONDS}",
        f"-rss_limit_mb={RSS_LIMIT_MB}",
        f"-seed={seed}",
        f"-artifact_prefix={artifacts}/",
        "-print_final_stats=1",
    ]
    done = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                          errors="replace", check=False)
    lines = redact(done.stdout).splitlines()
    if done.returncode == 0:
        stats = [line for line in lines if line.startswith("stat::")]
        print(f"ok   {name}: no crash in {seconds}s (seed {seed})")
        for line in stats[:4]:
            print(f"     {line}")
        return True
    print(f"FAIL {name}: exit code {done.returncode}, seed {seed}")
    print("     The input is not printed. Re-run with this seed to reproduce it.")
    for crash in sorted(artifacts.glob("*")):
        data = crash.read_bytes()
        print(f"     input: {crash.name} {len(data)} bytes, sha256 {hashlib.sha256(data).hexdigest()}")
    print("\n".join(lines[-TAIL_LINES:]))
    return False


def main():
    if len(sys.argv) < 4:
        sys.exit("Usage: python3 run_fuzz.py <build dir> <corpus dir> <seconds> [target ...]")
    build_dir, corpus_root = Path(sys.argv[1]), Path(sys.argv[2])
    seconds = int(sys.argv[3])
    names = sys.argv[4:] or TARGETS
    results = [run_target(build_dir, corpus_root, seconds, name) for name in names]
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
