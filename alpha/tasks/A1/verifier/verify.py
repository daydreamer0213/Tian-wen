from __future__ import annotations

import json
import sys
from pathlib import Path


def _result(passed: list[str], failed: list[str], *, inconclusive: bool = False) -> None:
    passed.sort()
    failed.sort()
    total = 7
    if inconclusive:
        value = {
            "failed_checks": failed,
            "failure_categories": ["verifier_infrastructure"],
            "passed_checks": passed,
            "summary": f"{len(passed)}/{total} checks passed",
            "verdict": "inconclusive",
        }
    else:
        value = {
            "failed_checks": failed,
            "failure_categories": [] if not failed else ["behavior_mismatch"],
            "passed_checks": passed,
            "summary": f"{len(passed)}/{total} checks passed",
            "verdict": "met" if not failed else "not_met",
        }
    print(json.dumps(value, ensure_ascii=False, sort_keys=True))


def main() -> None:
    if len(sys.argv) != 2:
        _result([], ["verifier_arguments"], inconclusive=True)
        return
    try:
        sys.path.insert(0, str(Path(sys.argv[1]).resolve()))
        from records import parse_record
    except Exception:
        _result([], ["import"])
        return

    checks = {
        "ordinary_fields": lambda: parse_record(" alpha | beta ") == ("alpha", "beta"),
        "quoted_separator": lambda: parse_record('alpha|"beta|gamma"|delta') == ("alpha", "beta|gamma", "delta"),
        "quoted_field_whitespace": lambda: parse_record(' "alpha|beta" | gamma') == ("alpha|beta", "gamma"),
        "quoted_final_field_whitespace": lambda: parse_record('alpha|"beta"   ') == ("alpha", "beta"),
        "escaped_quote": lambda: parse_record('"say ""hello"""|done') == ('say "hello"', "done"),
        "escaped_quote_interior_whitespace": lambda: parse_record('"say "" | hi"|done') == ('say " | hi', "done"),
        "malformed_quote": lambda: _raises_value_error(parse_record),
    }
    passed: list[str] = []
    failed: list[str] = []
    for name, check in checks.items():
        try:
            (passed if check() else failed).append(name)
        except Exception:
            failed.append(name)
    _result(passed, failed)


def _raises_value_error(parse_record: object) -> bool:
    try:
        parse_record('alpha|"unclosed')
    except ValueError:
        return True
    except Exception:
        return False
    return False


if __name__ == "__main__":
    main()
