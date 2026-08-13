from __future__ import annotations

KNOWN_STATUSES = ("queued", "running", "done")


def normalize_status(value: str) -> str:
    normalized = value.strip().casefold()
    return normalized if normalized in KNOWN_STATUSES else "unknown"


def status_label(value: str) -> str:
    return normalize_status(value).title()
