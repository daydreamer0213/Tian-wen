from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(sys.argv[1]).resolve()))

from reports import render_report

rows = [("frontend", "Fix form"), ("backend", "Fix parser"), ("frontend", "Polish labels")]
assert render_report(rows, groups=("docs", "backend", "frontend")) == (
    "[backend]\n- Fix parser\n\n[docs]\n- (none)\n\n[frontend]\n- Fix form\n- Polish labels"
)

print("round 2 report checks passed")
