from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(sys.argv[1]).resolve()))

from reports import render_report

rows = [("frontend", "Fix form"), ("backend", "Fix parser"), ("frontend", "Polish labels")]
assert render_report(rows, groups=("docs",)) == "[frontend]\n- Fix form\n- Polish labels\n\n[backend]\n- Fix parser"
assert render_report([]) == ""

print("round 1 report checks passed")
