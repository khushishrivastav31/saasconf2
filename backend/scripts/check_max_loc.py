#!/usr/bin/env python3
"""Fail the pre-commit hook if any new Python file under `backend/app/` exceeds 600 LOC.

Existing large files are whitelisted in `allow_over_600.txt` so we can enforce the
rule on new code without blocking a refactor-the-whole-backend PR. When you refactor a
whitelisted file below 600 lines, remove its entry from `allow_over_600.txt`.

The hook receives the list of staged `.py` files as positional args via pre-commit.
"""

from __future__ import annotations

import sys
from pathlib import Path

MAX_LOC = 600
BACKEND_ROOT = Path(__file__).resolve().parent.parent
ALLOWLIST_PATH = BACKEND_ROOT / "scripts" / "allow_over_600.txt"


def load_allowlist() -> set[str]:
    if not ALLOWLIST_PATH.exists():
        return set()
    return {
        line.strip()
        for line in ALLOWLIST_PATH.read_text().splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    }


def count_lines(path: Path) -> int:
    with path.open("rb") as fh:
        return sum(1 for _ in fh)


def relpath_from_repo(path: Path) -> str:
    # Pre-commit passes paths relative to repo root; normalize to that shape.
    try:
        return str(path.resolve().relative_to(BACKEND_ROOT.parent))
    except ValueError:
        return str(path)


def main(argv: list[str]) -> int:
    allowlist = load_allowlist()
    offenders: list[tuple[str, int]] = []

    for raw in argv:
        path = Path(raw)
        if not path.exists() or path.suffix != ".py":
            continue
        rel = relpath_from_repo(path)
        if not rel.startswith("backend/app/"):
            continue
        loc = count_lines(path)
        if loc > MAX_LOC and rel not in allowlist:
            offenders.append((rel, loc))

    if offenders:
        print(
            f"\nThe following files exceed {MAX_LOC} LOC and are not in "
            f"{ALLOWLIST_PATH.relative_to(BACKEND_ROOT.parent)}:\n",
            file=sys.stderr,
        )
        for rel, loc in offenders:
            print(f"  {rel}: {loc} lines", file=sys.stderr)
        print(
            "\nEither split the file into smaller modules (preferred) or, if this is "
            "an existing large file that slipped through, add it to the allowlist with "
            "a TODO. Do NOT add new large files without team discussion.\n",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
