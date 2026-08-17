from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(sys.argv[1]).resolve()))

from statuses import status_label, summarize_statuses

assert status_label(" RUNNING ") == "Running"
assert summarize_statuses(["queued", " RUNNING ", "done", "other"]) == {
    "queued": 1,
    "running": 1,
    "done": 1,
    "unknown": 1,
}

print("public status checks passed")
