from __future__ import annotations

from collections.abc import Iterable


def render_report(
    rows: Iterable[tuple[str, str]],
    groups: Iterable[str] = (),
) -> str:
    """Render task titles grouped by team."""
    raise NotImplementedError
