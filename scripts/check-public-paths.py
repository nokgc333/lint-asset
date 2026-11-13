#!/usr/bin/env python3
"""Fail if a tracked path is not covered by the allowlist in .public-paths.

Usage:
  check-public-paths.py            check every tracked file (CI)
  check-public-paths.py --staged   check only files staged for commit (pre-commit)

Pattern rules are described at the top of .public-paths.
"""
import fnmatch
import subprocess
import sys
from pathlib import Path

ALLOWLIST = ".public-paths"


def git_paths(staged: bool) -> list[str]:
    cmd = (
        ["git", "diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]
        if staged
        else ["git", "ls-files", "-z"]
    )
    out = subprocess.run(cmd, check=True, capture_output=True, text=True).stdout
    return [p for p in out.split("\0") if p]


def load_patterns(root: Path) -> list[str]:
    lines = (root / ALLOWLIST).read_text(encoding="utf-8").splitlines()
    return [ln.strip() for ln in lines if ln.strip() and not ln.lstrip().startswith("#")]


def is_allowed(path: str, patterns: list[str]) -> bool:
    for pattern in patterns:
        if pattern.endswith("/"):
            if path.startswith(pattern):
                return True
        elif fnmatch.fnmatchcase(path, pattern):
            return True
    return False


def main() -> int:
    staged = "--staged" in sys.argv[1:]
    root = Path(subprocess.run(["git", "rev-parse", "--show-toplevel"], check=True,
                               capture_output=True, text=True).stdout.strip())
    patterns = load_patterns(root)
    rejected = [p for p in git_paths(staged) if not is_allowed(p, patterns)]
    if rejected:
        print("error: these paths are not in the allowlist (.public-paths):", file=sys.stderr)
        for path in rejected:
            print(f"  {path}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
