from __future__ import annotations

import json
import sys
from pathlib import Path


def _result(passed: list[str], failed: list[str], *, inconclusive: bool = False) -> None:
    passed.sort()
    failed.sort()
    total = 8
    value = {
        "failed_checks": failed,
        "failure_categories": (
            ["verifier_infrastructure"] if inconclusive else ([] if not failed else ["behavior_mismatch"])
        ),
        "passed_checks": passed,
        "summary": f"{len(passed)}/{total} checks passed",
        "verdict": "inconclusive" if inconclusive else ("met" if not failed else "not_met"),
    }
    print(json.dumps(value, ensure_ascii=False, sort_keys=True))


def main() -> None:
    if len(sys.argv) != 2:
        _result([], ["verifier_arguments"], inconclusive=True)
        return
    try:
        sys.path.insert(0, str(Path(sys.argv[1]).resolve()))
        from headers import normalize_header_names
    except Exception:
        _result([], ["import"])
        return
    checks = {
        "blank": lambda: normalize_header_names("") == "",
        "crlf": lambda: normalize_header_names("X-ID: AbC\r\n\r\nBODY\r\n") == "x-id: AbC\r\n\r\nBODY\r\n",
        "exact_body": lambda: normalize_header_names("X: Y\n\nHello WORLD\n") == "x: Y\n\nHello WORLD\n",
        "header_only": lambda: normalize_header_names("X-ID: AbC\nY: Z") == "x-id: AbC\ny: Z",
        "lf": lambda: (
            normalize_header_names("Content-Type: Text/Plain\n\nBody\n")
            == "content-type: Text/Plain\n\nBody\n"
        ),
        "malformed": lambda: normalize_header_names("malformed\nX: Value\n\nBODY") == "malformed\nx: Value\n\nBODY",
        "no_final_newline": lambda: normalize_header_names("X-ID: AbC\n\nHello WORLD") == "x-id: AbC\n\nHello WORLD",
        "value_spaces_case": lambda: normalize_header_names("X-Name:  MiXeD  \n\n") == "x-name:  MiXeD  \n\n",
    }
    passed: list[str] = []
    failed: list[str] = []
    for name, check in checks.items():
        try:
            (passed if check() else failed).append(name)
        except Exception:
            failed.append(name)
    _result(passed, failed)


if __name__ == "__main__":
    main()
