#!/usr/bin/env python3
"""Summarize functional-check statuses from a JSON object on stdin.

Implements docs/operations/functional-check-summary-contract.md.

Valid input: exit 0, empty stderr, one JSON object on stdout with the six
contract fields. Invalid input: exit 2, empty stderr, the fixed error object.
Only the Python standard library is used; no file, network, or process access.
"""

import json
import sys


class Invalid(Exception):
    """Raised when the input does not satisfy the contract."""


def _reject_constant(_name):
    raise Invalid()


def _parse_float(text):
    value = float(text)
    if value != value or value in (float("inf"), float("-inf")):
        raise Invalid()
    return value


def _unique_object(pairs):
    obj = {}
    for key, value in pairs:
        if key in obj:
            raise Invalid()
        obj[key] = value
    return obj


def _decode(raw):
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise Invalid()
    decoder = json.JSONDecoder(
        object_pairs_hook=_unique_object,
        parse_constant=_reject_constant,
        parse_float=_parse_float,
    )
    try:
        # decode() also rejects multiple root values and trailing non-space.
        return decoder.decode(text)
    except Invalid:
        raise
    except Exception:
        raise Invalid()


def _normalize_task_id(value):
    """Return value as code points, or None if it is invalid as a task ID.

    Surrogate escape pairs denote one code point; any remaining code point in
    U+D800-U+DFFF is a lone surrogate and invalid.
    """
    if type(value) is not str:
        return None
    chars = []
    index = 0
    length = len(value)
    while index < length:
        code = ord(value[index])
        if 0xD800 <= code <= 0xDBFF and index + 1 < length:
            low = ord(value[index + 1])
            if 0xDC00 <= low <= 0xDFFF:
                chars.append(chr(0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00)))
                index += 2
                continue
        if 0xD800 <= code <= 0xDFFF:
            return None
        chars.append(value[index])
        index += 1
    return "".join(chars)


def build_index(data):
    if type(data) is not dict or len(data) != 1 or "tasks" not in data:
        raise Invalid()
    tasks = data["tasks"]
    if type(tasks) is not list or len(tasks) > 64:
        raise Invalid()

    seen = set()
    unchecked = []
    verified = []
    rejected = []
    unverifiable = []
    invalidated = []

    for record in tasks:
        if type(record) is not dict or len(record) != 3:
            raise Invalid()
        if set(record) != {"taskId", "checkStatus", "invalidated"}:
            raise Invalid()

        task_id = _normalize_task_id(record["taskId"])
        if task_id is None or not 1 <= len(task_id) <= 256:
            raise Invalid()
        if task_id in seen:
            raise Invalid()
        seen.add(task_id)

        status = record["checkStatus"]
        if status is not None and status not in (
            "verified",
            "rejected",
            "unverifiable",
        ):
            raise Invalid()

        flag = record["invalidated"]
        if type(flag) is not bool:
            raise Invalid()
        if status is None and flag:
            raise Invalid()

        # Exactly one group per record: invalidated wins over the original
        # status, so a retracted check never appears in its status group.
        if flag:
            invalidated.append(task_id)
        elif status is None:
            unchecked.append(task_id)
        elif status == "verified":
            verified.append(task_id)
        elif status == "rejected":
            rejected.append(task_id)
        else:
            unverifiable.append(task_id)

    return {
        "total": len(tasks),
        "unchecked": sorted(unchecked),
        "verified": sorted(verified),
        "rejected": sorted(rejected),
        "unverifiable": sorted(unverifiable),
        "invalidated": sorted(invalidated),
    }


def main():
    try:
        raw = sys.stdin.buffer.read()
        result = build_index(_decode(raw))
    except Exception:
        sys.stdout.buffer.write(b'{"error":"invalid-check-records"}')
        sys.stdout.buffer.flush()
        return 2

    payload = json.dumps(result, ensure_ascii=False, separators=(",", ":"))
    sys.stdout.buffer.write(payload.encode("utf-8"))
    sys.stdout.buffer.flush()
    return 0


if __name__ == "__main__":
    sys.exit(main())
