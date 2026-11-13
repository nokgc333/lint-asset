#!/usr/bin/env python3
"""Check a commit message: Conventional Commits, English only, no trailers.

Usage: check-commit-message.py <message-file>
"""
import re
import sys

TYPES = "feat|fix|refactor|test|docs|chore|perf|ci|build|revert"
SUBJECT = re.compile(rf"^(?:{TYPES})(?:\([a-z0-9-]+\))?!?: [a-z0-9`].*[^.\s]$")
MAX_SUBJECT = 70


def check(message: str) -> list[str]:
    lines = [ln for ln in message.splitlines() if not ln.startswith("#")]
    subject = lines[0] if lines else ""
    if subject.startswith("Merge "):
        return []

    errors = []
    if not SUBJECT.match(subject):
        errors.append(
            "subject must look like '<type>(<scope>): <description>' "
            f"(types: {TYPES.replace('|', ', ')}); lowercase start, no trailing period"
        )
    if len(subject) > MAX_SUBJECT:
        errors.append(f"subject is {len(subject)} characters; the limit is {MAX_SUBJECT}")
    if not "\n".join(lines).isascii():
        errors.append("the message must be English (ASCII only)")
    if any(re.match(r"(?i)^(co-authored-by|generated with)", ln) for ln in lines):
        errors.append("do not add co-author trailers or generation notes")
    return errors


def main() -> int:
    with open(sys.argv[1], encoding="utf-8") as f:
        errors = check(f.read())
    for e in errors:
        print(f"error: {e}", file=sys.stderr)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
