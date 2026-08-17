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
        from statuses import normalize_status, status_label, summarize_statuses
    except Exception:
        _result([], ["import"])
        return

    values = [" queued ", "RUNNING", "done", "other", "unknown"]
    original = values.copy()
    checks = {
        "normalize_status_contract": lambda: _all_equal(
            normalize_status,
            (("\tqueued\n", "queued"), ("\nRUNNING\t", "running"), ("\tDone\n", "done"), ("\n other\t", "unknown")),
        ),
        "status_label_contract": lambda: _all_equal(
            status_label,
            (("\tqueued\n", "Queued"), ("\nRUNNING\t", "Running"), ("\tDone\n", "Done"), ("\n other\t", "Unknown")),
        ),
        "empty_input": lambda: summarize_statuses([]) == {"queued": 0, "running": 0, "done": 0, "unknown": 0},
        "mixed_input": lambda: summarize_statuses(values) == {"queued": 1, "running": 1, "done": 1, "unknown": 2},
        "generator_input": lambda: summarize_statuses(value for value in ("queued", "done"))
        == {"queued": 1, "running": 0, "done": 1, "unknown": 0},
        "input_unchanged": lambda: values == original,
        "no_extra_key": lambda: set(summarize_statuses([])) == {"queued", "running", "done", "unknown"},
    }
    passed: list[str] = []
    failed: list[str] = []
    for name, check in checks.items():
        try:
            (passed if check() else failed).append(name)
        except Exception:
            failed.append(name)
    _result(passed, failed)


def _all_equal(function: object, cases: tuple[tuple[str, str], ...]) -> bool:
    return all(function(value) == expected for value, expected in cases)


if __name__ == "__main__":
    main()
