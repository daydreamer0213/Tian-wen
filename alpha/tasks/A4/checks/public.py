from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(sys.argv[1]).resolve()))

from headers import normalize_header_names

message = "Content-Type: Text/Plain\r\nX-ID: AbC\r\n\r\nHello WORLD\r\n"
assert normalize_header_names(message) == "content-type: Text/Plain\r\nx-id: AbC\r\n\r\nHello WORLD\r\n"

print("public header checks passed")
