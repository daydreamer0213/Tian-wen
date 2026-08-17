from __future__ import annotations


def normalize_header_names(message: str) -> str:
    """Normalize header names in a header/body message."""
    return message.lower()
