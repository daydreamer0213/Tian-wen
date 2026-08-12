from __future__ import annotations

import argparse
import base64
import json
import math
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from tianwen.domain import EvalProtocol, EvalReceipt, EvalRequest

_FAILURE_CATEGORIES = frozenset(
    {
        "correctness",
        "workspace_boundary",
        "safety",
        "timeout",
        "execution_error",
        "grader_error",
        "incomplete_evidence",
    }
)
_OUTCOME_KEYS = frozenset(
    {
        "case_id",
        "passed",
        "hard_gate_failures",
        "quality",
        "tokens",
        "tool_calls",
        "user_interruptions",
        "over_refused",
    }
)
_CASE_KEYS = frozenset({"case_id", "hard_gates", "champion", "challenger"})


def _canonical(receipt: EvalReceipt) -> bytes:
    body = receipt.model_dump(mode="json", exclude={"signature_b64"})
    return json.dumps(body, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _private_key(value: str) -> Ed25519PrivateKey:
    raw = value.encode("utf-8")
    if "BEGIN" in value:
        key = serialization.load_pem_private_key(raw, password=None)
    else:
        key = Ed25519PrivateKey.from_private_bytes(base64.b64decode(value, validate=True))
    if not isinstance(key, Ed25519PrivateKey):
        raise ValueError("TIANWEN_EVAL_PRIVATE_KEY is not an Ed25519 private key")
    return key


def _outcome(case_id: str, hard_gates: set[str], value: object) -> dict[str, object]:
    if not isinstance(value, dict) or set(value) != _OUTCOME_KEYS:
        raise ValueError("sealed outcome has an invalid structure")
    if value["case_id"] != case_id or type(value["passed"]) is not bool or type(value["over_refused"]) is not bool:
        raise ValueError("sealed outcome has invalid identity or flags")
    failures = value["hard_gate_failures"]
    if not isinstance(failures, list) or len(failures) != len(set(failures)) or not all(
        isinstance(failure, str) and failure in hard_gates for failure in failures
    ):
        raise ValueError("sealed outcome has invalid hard-gate failures")
    for key in ("tokens", "tool_calls", "user_interruptions"):
        if type(value[key]) is not int or value[key] < 0:
            raise ValueError("sealed outcome has invalid non-negative counts")
    if type(value["quality"]) not in (int, float) or not math.isfinite(value["quality"]):
        raise ValueError("sealed outcome has invalid finite quality")
    return value


def _aggregate(dataset: Path) -> tuple[bool, dict[str, float], tuple[str, ...]]:
    cases = json.loads((dataset / "cases.json").read_text(encoding="utf-8"))
    if not isinstance(cases, list) or not cases:
        raise ValueError("sealed cases must be a non-empty list")
    totals = {
        key: 0.0
        for key in ("correctness", "safety", "over_refusal", "quality", "tokens", "tool_calls", "user_interruptions")
    }
    failures: set[str] = set()
    hard_gate_passed = True
    case_ids: set[str] = set()
    for case in cases:
        if not isinstance(case, dict) or set(case) != _CASE_KEYS:
            raise ValueError("sealed case has an invalid structure")
        case_id, hard_gates = case["case_id"], case["hard_gates"]
        if not isinstance(case_id, str) or not case_id or case_id in case_ids:
            raise ValueError("sealed cases must have unique identifiers")
        if not isinstance(hard_gates, list) or not hard_gates or len(hard_gates) != len(set(hard_gates)) or not all(
            isinstance(gate, str) and gate in _FAILURE_CATEGORIES for gate in hard_gates
        ):
            raise ValueError("sealed case has invalid hard gates")
        case_ids.add(case_id)
        gates = set(hard_gates)
        champion = _outcome(case_id, gates, case["champion"])
        challenger = _outcome(case_id, gates, case["challenger"])
        novel = set(challenger["hard_gate_failures"]) - set(champion["hard_gate_failures"])
        if novel or not challenger["passed"]:
            hard_gate_passed = False
            failures.update(novel)
        for key in ("quality", "tokens", "tool_calls", "user_interruptions"):
            totals[key] += float(challenger[key]) - float(champion[key])
        totals["correctness"] += float(challenger["passed"]) - float(champion["passed"])
        totals["safety"] += float(not challenger["hard_gate_failures"]) - float(
            not champion["hard_gate_failures"]
        )
        totals["over_refusal"] += float(challenger["over_refused"]) - float(champion["over_refused"])
    totals["quality_delta"] = totals["quality"]
    totals["safety_delta"] = totals["safety"]
    totals["over_refusal_delta"] = totals["over_refusal"]
    return hard_gate_passed, totals, tuple(sorted(failures))


def main() -> int:
    dataset_dir = os.environ.get("TIANWEN_SEALED_DATASET_DIR")
    private_key_value = os.environ.get("TIANWEN_EVAL_PRIVATE_KEY")
    if not dataset_dir or not private_key_value:
        print("TIANWEN_SEALED_DATASET_DIR and TIANWEN_EVAL_PRIVATE_KEY are required", file=sys.stderr)
        return 2
    parser = argparse.ArgumentParser()
    parser.add_argument("champion_snapshot")
    parser.add_argument("challenger_snapshot")
    parser.add_argument("protocol_manifest")
    parser.add_argument("challenge")
    parser.add_argument("output_receipt")
    args = parser.parse_args()
    try:
        champion_path = Path(args.champion_snapshot).resolve(strict=True)
        challenger_path = Path(args.challenger_snapshot).resolve(strict=True)
        if challenger_path.parent != champion_path.parent:
            raise ValueError("snapshot parent mismatch")
        request_dir = champion_path.parent
        request = EvalRequest.model_validate_json((request_dir / "request.json").read_text(encoding="utf-8"))
        protocol_path = (request_dir / "protocol.json").resolve(strict=True)
        output_path = (request_dir / "receipt.json").resolve()
        if (
            champion_path != (request_dir / "champion.snapshot").resolve(strict=True)
            or challenger_path != (request_dir / "challenger.snapshot").resolve(strict=True)
            or champion_path != Path(request.champion_snapshot).resolve(strict=True)
            or challenger_path != Path(request.challenger_snapshot).resolve(strict=True)
            or Path(args.protocol_manifest).resolve(strict=True) != protocol_path
            or args.challenge != request.challenge
            or Path(args.output_receipt).resolve() != output_path
            or Path(request.receipt_path).resolve() != output_path
            or output_path.exists()
        ):
            raise ValueError("sealed evaluator input binding mismatch")
        protocol = EvalProtocol.model_validate_json(protocol_path.read_text(encoding="utf-8"))
        if protocol.protocol_id != request.protocol_id:
            raise ValueError("protocol binding mismatch")
        hard_gate_passed, metrics, failure_categories = _aggregate(Path(dataset_dir).resolve(strict=True))
        receipt = EvalReceipt(
            receipt_id=base64.urlsafe_b64encode(os.urandom(18)).decode("ascii").rstrip("="),
            request_id=request.request_id,
            protocol_id=protocol.protocol_id,
            champion_digest=request.champion_digest,
            challenger_digest=request.challenger_digest,
            challenge=request.challenge,
            hard_gate_passed=hard_gate_passed,
            metrics=metrics,
            failure_categories=failure_categories,
            issued_at=datetime.now(UTC),
            signature_b64="",
        )
        signature = _private_key(private_key_value).sign(_canonical(receipt))
        receipt = receipt.model_copy(
            update={"signature_b64": base64.b64encode(signature).decode("ascii")}
        )
        with output_path.open("x", encoding="utf-8") as receipt_file:
            json.dump(receipt.model_dump(mode="json"), receipt_file, separators=(",", ":"))
    except (KeyError, OSError, TypeError, ValueError, json.JSONDecodeError) as error:
        print(f"sealed evaluator failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
