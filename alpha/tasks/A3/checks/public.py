from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(sys.argv[1]).resolve()))

from query import build_query

assert build_query({"tag": ["alpha", "beta"]}) == "tag=alpha&tag=beta"
assert build_query({"q": "a b"}) == "q=a+b"

print("public query checks passed")
