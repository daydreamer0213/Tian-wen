from __future__ import annotations


def parse_record(line: str) -> tuple[str, ...]:
    """Parse one pipe-separated record."""
    return tuple(part.strip() for part in line.split("|"))
