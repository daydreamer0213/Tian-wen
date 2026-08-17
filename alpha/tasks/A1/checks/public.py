from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(sys.argv[1]).resolve()))

from records import parse_record

assert parse_record("alpha|beta|gamma") == ("alpha", "beta", "gamma")
assert parse_record('alpha|"beta|gamma"|delta') == (
    "alpha",
    "beta|gamma",
    "delta",
)

print("public parser checks passed")
