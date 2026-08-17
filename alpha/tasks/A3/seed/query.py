from __future__ import annotations

from collections.abc import Mapping, Sequence
from urllib.parse import urlencode


def build_query(parameters: Mapping[str, str | Sequence[str]]) -> str:
    """Encode query parameters for a URL."""
    return urlencode(parameters)
