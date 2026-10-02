#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Contract A: summarize task evidence.

Implements only section A of docs/operations/evidence-report-batch-contract.md.
Standard library only. Reads one JSON object from stdin, writes one JSON object
to stdout. Reads no files, uses no network, runs no external program.

Invalid input: stdout is exactly {"error":"invalid-evidence-records"}, exit 2,
stderr empty. Valid input: result JSON, exit 0, stderr empty.
"""

import json
import math
import sys

ERROR_OUTPUT = '{"error":"invalid-evidence-records"}'

REVIEW_STATES = frozenset(("met", "not-met", "inconclusive"))
CHECK_STATES = frozenset(("verified", "rejected", "unverifiable"))
TASK_KEYS = frozenset(("taskId", "completed", "review", "check", "invalidated"))

MAX_TASKS = 64
MIN_ID_LENGTH = 1
MAX_ID_LENGTH = 256


class InvalidInput(Exception):
    """Any input that does not satisfy the contract."""


def _reject_constant(name):
    # JSON NaN / Infinity / -Infinity are non-finite and never valid here.
    raise InvalidInput("non-finite number literal")


def _parse_float(text):
    value = float(text)
    if not math.isfinite(value):
        raise InvalidInput("non-finite number")
    return value


def _unique_pairs(pairs):
    obj = {}
    for key, value in pairs:
        if key in obj:
            raise InvalidInput("duplicate object key")
        obj[key] = value
    return obj


def _is_valid_id(value):
    """ID: non-empty string of 1-256 Unicode scalar code points."""
    if not isinstance(value, str):
        return False
    length = len(value)
    if length < MIN_ID_LENGTH or length > MAX_ID_LENGTH:
        return False
    for char in value:
        code = ord(char)
        if 0xD800 <= code <= 0xDFFF:  # lone surrogate: not a scalar value
            return False
    return True


def _load(text):
    try:
        return json.loads(
            text,
            object_pairs_hook=_unique_pairs,
            parse_constant=_reject_constant,
            parse_float=_parse_float,
        )
    except InvalidInput:
        raise
    except Exception as exc:  # malformed JSON, trailing roots, decode issues
        raise InvalidInput("malformed JSON") from exc


def summarize(data):
    if not isinstance(data, dict) or set(data) != {"tasks"}:
        raise InvalidInput("input must be exactly one object with 'tasks'")
    tasks = data["tasks"]
    if not isinstance(tasks, list):
        raise InvalidInput("'tasks' must be an array")
    if len(tasks) > MAX_TASKS:
        raise InvalidInput("more than 64 tasks")

    seen = set()
    all_ids = []
    completed_ids = []
    model_met_ids = []
    check_verified_ids = []
    joint_ids = []

    for task in tasks:
        if not isinstance(task, dict) or set(task) != TASK_KEYS:
            raise InvalidInput("each task must have exactly the five fields")

        task_id = task["taskId"]
        if not _is_valid_id(task_id):
            raise InvalidInput("invalid taskId")
        if task_id in seen:
            raise InvalidInput("duplicate taskId")
        seen.add(task_id)

        completed = task["completed"]
        invalidated = task["invalidated"]
        if not isinstance(completed, bool) or not isinstance(invalidated, bool):
            raise InvalidInput("completed/invalidated must be JSON booleans")

        review = task["review"]
        if review is not None and (
            not isinstance(review, str) or review not in REVIEW_STATES
        ):
            raise InvalidInput("invalid review")

        check = task["check"]
        if check is not None and (
            not isinstance(check, str) or check not in CHECK_STATES
        ):
            raise InvalidInput("invalid check")

        # check == null cannot be retracted; other check states may be.
        if check is None and invalidated:
            raise InvalidInput("invalidated requires a non-null check")

        all_ids.append(task_id)
        if completed:
            completed_ids.append(task_id)
        if review == "met":
            model_met_ids.append(task_id)
        # A retracted check no longer counts as currently verified.
        verified = check == "verified" and not invalidated
        if verified:
            check_verified_ids.append(task_id)
        if completed and review == "met" and verified:
            joint_ids.append(task_id)

    # jointEvidence and attention partition every task ID exactly.
    joint_set = set(joint_ids)
    attention_ids = [task_id for task_id in all_ids if task_id not in joint_set]

    return {
        "total": len(all_ids),
        "completed": sorted(completed_ids),
        "modelMet": sorted(model_met_ids),
        "currentCheckVerified": sorted(check_verified_ids),
        "jointEvidence": sorted(joint_ids),
        "attention": sorted(attention_ids),
    }


def main():
    try:
        raw = sys.stdin.buffer.read()
        text = raw.decode("utf-8")
        result = summarize(_load(text))
    except Exception:
        sys.stdout.write(ERROR_OUTPUT)
        return 2
    sys.stdout.write(json.dumps(result, ensure_ascii=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
