from __future__ import annotations

import json
import sys
from pathlib import Path


def _result(passed: list[str], failed: list[str], *, inconclusive: bool = False) -> None:
    passed.sort()
    failed.sort()
    total = 7
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
        from reports import render_report
    except Exception:
        _result([], ["import"])
        return
    rows = [("Zoo", "last"), ("alpha", "first"), ("Alpha", "second")]
    checks = {
        "casefold_order_and_tie_break": lambda: (
            render_report(rows) == "[Alpha]\n- second\n\n[alpha]\n- first\n\n[Zoo]\n- last"
        ),
        "declared_empty_groups": lambda: render_report([], groups=("docs",)) == "[docs]\n- (none)",
        "duplicate_groups_once": lambda: render_report([], groups=("docs", "docs")) == "[docs]\n- (none)",
        "formatting": lambda: render_report([("a", "one"), ("b", "two")]) == "[a]\n- one\n\n[b]\n- two",
        "generator_input": lambda: (
            render_report(item for item in [("b", "two"), ("a", "one")])
            == "[a]\n- one\n\n[b]\n- two"
        ),
        "item_order_and_undeclared_group": lambda: (
            render_report([("b", "one"), ("b", "two")], groups=("a",))
            == "[a]\n- (none)\n\n[b]\n- one\n- two"
        ),
        "empty": lambda: render_report([], groups=()) == "",
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
