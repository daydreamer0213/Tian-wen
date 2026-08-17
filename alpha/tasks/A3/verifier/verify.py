from __future__ import annotations

import json
import sys
from pathlib import Path


def _result(passed: list[str], failed: list[str], *, inconclusive: bool = False) -> None:
    passed.sort()
    failed.sort()
    total = 6
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
        from query import build_query
    except Exception:
        _result([], ["import"])
        return

    parameters = {"tag": ["alpha", "beta"], "mode": "fast", "page": ("1", "2")}
    original = {key: value[:] if isinstance(value, list) else value for key, value in parameters.items()}
    checks = {
        "list_repeats_key_in_order": lambda: build_query({"tag": ["alpha", "beta"]}) == "tag=alpha&tag=beta",
        "tuple_repeats_key_in_order": lambda: build_query({"page": ("1", "2")}) == "page=1&page=2",
        "string_is_scalar": lambda: build_query({"q": "ab"}) == "q=ab",
        "mixed_mapping_preserves_order": lambda: build_query(parameters)
        == "tag=alpha&tag=beta&mode=fast&page=1&page=2",
        "urlencode_escaping": lambda: build_query({"q": "a b&c"}) == "q=a+b%26c",
        "input_unchanged": lambda: parameters == original,
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
