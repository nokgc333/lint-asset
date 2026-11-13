#!/usr/bin/env python3
"""Check a branch name.

Usage:
  check-branch-name.py          check the current branch (pre-commit hook)
  check-branch-name.py <name>   check the given name (CI, for a pull request branch)

- Work happens on short-lived branches: <type>/<kebab-case-name>.
- Direct commits to main are rejected, except the very first commit of an empty history.
- A detached HEAD (rebase, bisect) is allowed when checking the current branch.
"""
import re
import subprocess
import sys

BRANCH = re.compile(r"^(feat|fix|refactor|test|docs|chore|perf|ci)/[a-z0-9]+(-[a-z0-9]+)*$")


def git(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], capture_output=True, text=True)


def check_name(name: str, *, allow_first_commit: bool) -> int:
    if name == "main":
        if allow_first_commit and git("rev-parse", "--verify", "-q", "HEAD").returncode != 0:
            return 0
        print("error: do not commit directly to main; create a short-lived branch", file=sys.stderr)
        return 1
    if not BRANCH.match(name):
        print(f"error: branch '{name}' must look like feat/add-thing "
              "(feat, fix, refactor, test, docs, chore, perf, ci)", file=sys.stderr)
        return 1
    return 0


def main() -> int:
    if len(sys.argv) > 1:
        return check_name(sys.argv[1], allow_first_commit=False)
    head = git("symbolic-ref", "--short", "-q", "HEAD")
    if head.returncode != 0:
        return 0
    return check_name(head.stdout.strip(), allow_first_commit=True)


if __name__ == "__main__":
    sys.exit(main())
