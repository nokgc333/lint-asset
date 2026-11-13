#!/usr/bin/env python3
"""Check the current branch name.

- Work happens on short-lived branches: <type>/<kebab-case-name>.
- Direct commits to main are rejected, except the very first commit of an empty history.
- A detached HEAD (rebase, bisect) is allowed.
"""
import re
import subprocess
import sys

BRANCH = re.compile(r"^(feat|fix|refactor|test|docs|chore|perf|ci)/[a-z0-9]+(-[a-z0-9]+)*$")


def git(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], capture_output=True, text=True)


def main() -> int:
    head = git("symbolic-ref", "--short", "-q", "HEAD")
    if head.returncode != 0:
        return 0
    name = head.stdout.strip()
    if name == "main":
        if git("rev-parse", "--verify", "-q", "HEAD").returncode != 0:
            return 0
        print("error: do not commit directly to main; create a short-lived branch", file=sys.stderr)
        return 1
    if not BRANCH.match(name):
        print(f"error: branch '{name}' must look like feat/add-thing "
              "(feat, fix, refactor, test, docs, chore, perf, ci)", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
