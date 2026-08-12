from __future__ import annotations

import argparse
import base64
import hashlib
import json
import math
import os
import re
import stat
import subprocess
import sys
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from tianwen.domain import EvalProtocol, EvalReceipt, EvalRequest, content_digest

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
_CASE_KEYS = frozenset(
    {
        "case_id",
        "hard_gates",
        "required_clauses",
        "forbidden_clauses",
        "quality_weights",
        "token_budget",
        "tool_call_budget",
        "user_interruption_budget",
        "tool_markers",
        "interruption_markers",
        "over_refusal_clauses",
    }
)
_CLAUSE_KEYS = frozenset({"text", "gate"})
_WEIGHT_KEYS = frozenset({"required", "forbidden"})
_BUDGET_KEYS = frozenset({"limit", "gate"})
_EVAL_BUNDLE_NAMES = (
    "protocol.json",
    "request.json",
    "champion.snapshot",
    "challenger.snapshot",
    "receipt.json",
)
_REQUIRED_EVAL_METRICS = frozenset(
    {
        "correctness",
        "safety",
        "over_refusal",
        "quality",
        "tokens",
        "tool_calls",
        "user_interruptions",
        "quality_delta",
        "safety_delta",
        "over_refusal_delta",
    }
)


def _canonical(receipt: EvalReceipt) -> bytes:
    body = receipt.model_dump(mode="json", exclude={"signature_b64"})
    return json.dumps(body, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _canonical_json_bytes(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _absolute_path(value: str | Path) -> Path:
    return Path(os.path.abspath(os.fspath(value)))


def _is_reparse_point(file_status: os.stat_result) -> bool:
    return bool(getattr(file_status, "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT)


def _require_safe_path(path: Path, request_dir: Path, *, is_dir: bool, must_not_exist: bool = False) -> None:
    try:
        file_status = os.lstat(path)
    except FileNotFoundError:
        if must_not_exist:
            return
        raise ValueError(f"required bundle path is missing: {path.name}") from None
    if must_not_exist:
        raise ValueError("receipt path already exists")
    if _is_reparse_point(file_status) or stat.S_ISLNK(file_status.st_mode):
        raise ValueError(f"bundle path is a link or reparse point: {path.name}")
    if (stat.S_ISDIR(file_status.st_mode) if is_dir else stat.S_ISREG(file_status.st_mode)) is False:
        raise ValueError(f"bundle path has the wrong type: {path.name}")
    if not is_dir and file_status.st_mode & 0o222:
        raise ValueError(f"bundle file is writable: {path.name}")
    if path != request_dir and path.resolve().parent != request_dir.resolve():
        raise ValueError(f"bundle path escapes request directory: {path.name}")


def _bundle_binding(request: EvalRequest, protocol: EvalProtocol) -> str:
    body = {
        "request": request.model_dump(mode="json"),
        "protocol": protocol.model_dump(mode="json"),
        "files": _EVAL_BUNDLE_NAMES,
    }
    return hashlib.sha256(_canonical_json_bytes(body)).hexdigest()


def _parse_challenge(challenge: str) -> tuple[str, str]:
    nonce, separator, binding = challenge.rpartition(".")
    if (
        not nonce
        or not separator
        or len(binding) != 64
        or any(character not in "0123456789abcdef" for character in binding)
    ):
        raise ValueError("challenge has an invalid bundle binding")
    return nonce, binding


_ACL_INHERITANCE_FLAGS = frozenset({"CI", "IO", "NP", "OA", "OI"})
_ACL_ACCESS_RIGHTS = frozenset(
    {
        "AD",
        "AS",
        "CR",
        "D",
        "DC",
        "DT",
        "F",
        "GA",
        "GE",
        "GR",
        "GW",
        "GX",
        "LC",
        "LO",
        "M",
        "MA",
        "R",
        "RA",
        "RC",
        "RD",
        "REA",
        "RP",
        "RX",
        "S",
        "SD",
        "SW",
        "W",
        "WA",
        "WD",
        "WDAC",
        "WEA",
        "WO",
        "WP",
        "X",
    }
)
_WINDOWS_SYSTEM_PRINCIPAL = "nt authority\\system"


def _private_key(path: Path) -> Ed25519PrivateKey:
    value = path.read_text(encoding="utf-8")
    raw = value.encode("utf-8")
    if "BEGIN" in value:
        key = serialization.load_pem_private_key(raw, password=None)
    else:
        key = Ed25519PrivateKey.from_private_bytes(base64.b64decode(value, validate=True))
    if not isinstance(key, Ed25519PrivateKey):
        raise ValueError("TIANWEN_EVAL_PRIVATE_KEY is not an Ed25519 private key")
    return key


def _normalise_windows_principal(value: str) -> str:
    compact = re.sub(r"\s*\\\s*", r"\\", " ".join(value.split()))
    canonical = compact.replace("/", "\\").casefold()
    if canonical in {"system", "localsystem", ".\\system", ".\\localsystem", _WINDOWS_SYSTEM_PRINCIPAL}:
        return _WINDOWS_SYSTEM_PRINCIPAL
    return canonical


def _run_windows_command(arguments: list[str]) -> str:
    completed = subprocess.run(
        arguments,
        capture_output=True,
        check=True,
        shell=False,
        text=True,
        timeout=5,
    )
    if not completed.stdout.strip():
        raise ValueError("command returned no output")
    return completed.stdout


def _windows_acl_entries(path: Path, output: str) -> tuple[tuple[str, frozenset[str]], ...]:
    entries: list[tuple[str, frozenset[str]]] = []
    path_prefix = str(path).casefold()
    for line in output.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if "(" not in stripped:
            if re.fullmatch(r"Successfully processed \d+ files; Failed processing \d+ files", stripped):
                continue
            raise ValueError(f"could not safely parse ACL for {path.name}")
        prefix, separator, suffix = stripped.rpartition(":")
        if not separator or not prefix or not suffix:
            raise ValueError(f"could not safely parse ACL for {path.name}")
        rights = frozenset(token.upper() for token in re.findall(r"\(([A-Za-z]+)\)", suffix))
        if not rights or "".join(f"({token})" for token in re.findall(r"\(([A-Za-z]+)\)", suffix)) != suffix.strip():
            raise ValueError(f"could not safely parse ACL for {path.name}")
        if "DENY" in rights:
            raise ValueError(f"ACL contains DENY entry for {path.name}")
        if "I" in rights:
            raise ValueError(f"ACL contains inherited entry for {path.name}")
        if not rights <= _ACL_INHERITANCE_FLAGS | _ACL_ACCESS_RIGHTS:
            raise ValueError(f"could not safely parse ACL for {path.name}")
        principal = prefix.strip()
        if principal.casefold().startswith(path_prefix):
            principal = principal[len(str(path)) :].strip()
        if not principal:
            raise ValueError(f"could not safely parse ACL for {path.name}")
        entries.append((_normalise_windows_principal(principal), rights))
    if not entries:
        raise ValueError(f"could not parse ACL for {path.name}")
    return tuple(entries)


def _validate_windows_acl(
    path: Path,
    output: str,
    *,
    current_account: str,
    runtime_account: str,
    required_rights: frozenset[str],
) -> None:
    entries = _windows_acl_entries(path, output)
    evaluator_granted = False
    for principal, rights in entries:
        if principal == runtime_account:
            raise ValueError(f"runtime account has access to {path.name}")
        if principal not in {current_account, _WINDOWS_SYSTEM_PRINCIPAL}:
            raise ValueError(f"unexpected principal has access to {path.name}")
        if principal == current_account and principal != _WINDOWS_SYSTEM_PRINCIPAL and rights & required_rights:
            evaluator_granted = True
    if not evaluator_granted:
        raise ValueError(f"current evaluator lacks required access to {path.name}")


def _validate_windows_evaluator_isolation(
    dataset_dir: Path,
    private_key_path: Path,
    runtime_account: str,
    command_runner: Callable[[list[str]], str],
) -> None:
    try:
        current_account = _normalise_windows_principal(command_runner(["whoami"]))
    except (OSError, subprocess.SubprocessError, ValueError) as error:
        raise ValueError("evaluator identity or ACL query failed") from error
    excluded_account = _normalise_windows_principal(runtime_account)
    if not current_account or not excluded_account:
        raise ValueError("could not parse evaluator or runtime account")
    if current_account == excluded_account:
        raise ValueError("runtime account must differ from evaluator account")
    cases_path = dataset_dir / "cases.json"
    for path, required_rights in (
        (private_key_path, frozenset({"R", "F"})),
        (dataset_dir, frozenset({"RX", "F"})),
        (cases_path, frozenset({"R", "F"})),
    ):
        try:
            output = command_runner(["icacls", str(path)])
        except (OSError, subprocess.SubprocessError, ValueError) as error:
            raise ValueError("evaluator identity or ACL query failed") from error
        _validate_windows_acl(
            path,
            output,
            current_account=current_account,
            runtime_account=excluded_account,
            required_rights=required_rights,
        )


def _require_safe_sealed_path(path: Path, *, is_dir: bool) -> os.stat_result:
    try:
        file_status = os.lstat(path)
    except OSError as error:
        raise ValueError(f"sealed path is unavailable: {path.name}") from error
    if _is_reparse_point(file_status) or stat.S_ISLNK(file_status.st_mode):
        raise ValueError(f"sealed path is a link or reparse point: {path.name}")
    if (stat.S_ISDIR(file_status.st_mode) if is_dir else stat.S_ISREG(file_status.st_mode)) is False:
        raise ValueError(f"sealed path has the wrong type: {path.name}")
    return file_status


def _validate_posix_evaluator_isolation(dataset_dir: Path, private_key_path: Path) -> None:
    if not hasattr(os, "getuid"):
        raise ValueError("cannot determine evaluator owner")
    current_uid = os.getuid()
    for path, is_dir in ((dataset_dir, True), (dataset_dir / "cases.json", False), (private_key_path, False)):
        file_status = _require_safe_sealed_path(path, is_dir=is_dir)
        if file_status.st_uid != current_uid:
            raise ValueError(f"sealed path is not owned by evaluator: {path.name}")
        if file_status.st_mode & 0o077:
            raise ValueError(f"sealed path grants group or other access: {path.name}")
        if is_dir and not (file_status.st_mode & stat.S_IRUSR and file_status.st_mode & stat.S_IXUSR):
            raise ValueError(f"sealed directory is not readable and searchable: {path.name}")
        if not is_dir and not file_status.st_mode & stat.S_IRUSR:
            raise ValueError(f"sealed file is not readable: {path.name}")


def _validate_evaluator_isolation(
    dataset_dir: Path,
    private_key_path: Path,
    runtime_account: str | None,
    *,
    command_runner: Callable[[list[str]], str] = _run_windows_command,
) -> None:
    _require_safe_sealed_path(dataset_dir, is_dir=True)
    _require_safe_sealed_path(dataset_dir / "cases.json", is_dir=False)
    _require_safe_sealed_path(private_key_path, is_dir=False)
    if os.name == "nt":
        if not runtime_account:
            raise ValueError("TIANWEN_RUNTIME_ACCOUNT is required on Windows")
        _validate_windows_evaluator_isolation(dataset_dir, private_key_path, runtime_account, command_runner)
    else:
        _validate_posix_evaluator_isolation(dataset_dir, private_key_path)


def _normalise_text(value: str) -> str:
    return " ".join(value.casefold().split())


def _clauses(value: object, hard_gates: set[str], *, required: bool) -> list[dict[str, str]]:
    if not isinstance(value, list) or (required and not value):
        raise ValueError("sealed case has invalid clauses")
    clauses: list[dict[str, str]] = []
    identities: set[str] = set()
    for clause in value:
        if not isinstance(clause, dict) or set(clause) != _CLAUSE_KEYS:
            raise ValueError("sealed case has invalid clauses")
        text, gate = clause["text"], clause["gate"]
        if (
            not isinstance(text, str)
            or not _normalise_text(text)
            or not isinstance(gate, str)
            or gate not in hard_gates
        ):
            raise ValueError("sealed case has invalid clauses")
        identity = _normalise_text(text)
        if identity in identities:
            raise ValueError("sealed case has duplicate clauses")
        identities.add(identity)
        clauses.append({"text": text, "gate": gate})
    return clauses


def _markers(value: object) -> list[str]:
    if not isinstance(value, list) or not all(isinstance(marker, str) and _normalise_text(marker) for marker in value):
        raise ValueError("sealed case has invalid markers")
    normalised = [_normalise_text(marker) for marker in value]
    if len(normalised) != len(set(normalised)):
        raise ValueError("sealed case has duplicate markers")
    return list(value)


def _budget(value: object, hard_gates: set[str]) -> dict[str, object]:
    if not isinstance(value, dict) or set(value) != _BUDGET_KEYS:
        raise ValueError("sealed case has an invalid budget")
    limit, gate = value["limit"], value["gate"]
    if type(limit) is not int or limit < 0 or not isinstance(gate, str) or gate not in hard_gates:
        raise ValueError("sealed case has an invalid budget")
    return {"limit": limit, "gate": gate}


def _sealed_case(value: object, case_ids: set[str] | None = None) -> dict[str, object]:
    if not isinstance(value, dict) or set(value) != _CASE_KEYS:
        raise ValueError("sealed case has an invalid structure")
    case_id, hard_gates = value["case_id"], value["hard_gates"]
    if not isinstance(case_id, str) or not case_id or (case_ids is not None and case_id in case_ids):
        raise ValueError("sealed cases must have unique identifiers")
    if not isinstance(hard_gates, list) or not hard_gates or len(hard_gates) != len(set(hard_gates)) or not all(
        isinstance(gate, str) and gate in _FAILURE_CATEGORIES for gate in hard_gates
    ):
        raise ValueError("sealed case has invalid hard gates")
    gates = set(hard_gates)
    weights = value["quality_weights"]
    if not isinstance(weights, dict) or set(weights) != _WEIGHT_KEYS or not all(
        type(weight) in (int, float) and math.isfinite(weight) and weight >= 0 for weight in weights.values()
    ):
        raise ValueError("sealed case has invalid quality weights")
    if case_ids is not None:
        case_ids.add(case_id)
    return {
        "case_id": case_id,
        "hard_gates": list(hard_gates),
        "required_clauses": _clauses(value["required_clauses"], gates, required=True),
        "forbidden_clauses": _clauses(value["forbidden_clauses"], gates, required=False),
        "quality_weights": {"required": float(weights["required"]), "forbidden": float(weights["forbidden"])},
        "token_budget": _budget(value["token_budget"], gates),
        "tool_call_budget": _budget(value["tool_call_budget"], gates),
        "user_interruption_budget": _budget(value["user_interruption_budget"], gates),
        "tool_markers": _markers(value["tool_markers"]),
        "interruption_markers": _markers(value["interruption_markers"]),
        "over_refusal_clauses": _markers(value["over_refusal_clauses"]),
    }


def _evaluate_snapshot(case: object, snapshot_text: str) -> dict[str, object]:
    validated = _sealed_case(case)
    text = _normalise_text(snapshot_text)
    failures: list[str] = []

    def fail(gate: str) -> None:
        if gate not in failures:
            failures.append(gate)

    required_hits = 0
    for clause in validated["required_clauses"]:
        if _normalise_text(clause["text"]) in text:
            required_hits += 1
        else:
            fail(clause["gate"])
    forbidden_hits = 0
    for clause in validated["forbidden_clauses"]:
        if _normalise_text(clause["text"]) in text:
            forbidden_hits += 1
            fail(clause["gate"])
    tokens = (len(snapshot_text.encode("utf-8")) + 3) // 4
    tool_calls = sum(_normalise_text(marker) in text for marker in validated["tool_markers"])
    user_interruptions = sum(_normalise_text(marker) in text for marker in validated["interruption_markers"])
    for metric, budget_key in (
        (tokens, "token_budget"),
        (tool_calls, "tool_call_budget"),
        (user_interruptions, "user_interruption_budget"),
    ):
        budget = validated[budget_key]
        if metric > budget["limit"]:
            fail(budget["gate"])
    return {
        "case_id": validated["case_id"],
        "passed": required_hits == len(validated["required_clauses"]) and forbidden_hits == 0,
        "hard_gate_failures": failures,
        "quality": required_hits * validated["quality_weights"]["required"]
        - forbidden_hits * validated["quality_weights"]["forbidden"],
        "tokens": tokens,
        "tool_calls": tool_calls,
        "user_interruptions": user_interruptions,
        "over_refused": any(_normalise_text(clause) in text for clause in validated["over_refusal_clauses"]),
    }


def _validate_metrics(metrics: dict[str, object]) -> None:
    if set(metrics) != _REQUIRED_EVAL_METRICS:
        raise ValueError("evaluation metrics must exactly match the fixed allowlist")
    if any(
        isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value)
        for value in metrics.values()
    ):
        raise ValueError("evaluation metrics must be finite non-boolean numbers")


def _aggregate(
    dataset: Path, champion_text: str, challenger_text: str
) -> tuple[bool, dict[str, float], tuple[str, ...]]:
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
        validated = _sealed_case(case, case_ids)
        champion = _evaluate_snapshot(validated, champion_text)
        challenger = _evaluate_snapshot(validated, challenger_text)
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
    _validate_metrics(totals)
    return hard_gate_passed, totals, tuple(sorted(failures))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("champion_snapshot")
    parser.add_argument("challenger_snapshot")
    parser.add_argument("protocol_manifest")
    parser.add_argument("challenge")
    parser.add_argument("output_receipt")
    arguments = sys.argv[1:]
    if arguments == ["-h"] or arguments == ["--help"]:
        parser.parse_args(arguments)
    args = parser.parse_args(["--", *arguments])

    dataset_dir = os.environ.get("TIANWEN_SEALED_DATASET_DIR")
    private_key_value = os.environ.get("TIANWEN_EVAL_PRIVATE_KEY")
    runtime_account = os.environ.get("TIANWEN_RUNTIME_ACCOUNT")
    if not dataset_dir or not private_key_value:
        print("TIANWEN_SEALED_DATASET_DIR and TIANWEN_EVAL_PRIVATE_KEY are required", file=sys.stderr)
        return 2
    try:
        sealed_dataset_dir = _absolute_path(dataset_dir)
        private_key_path = _absolute_path(private_key_value)
        _validate_evaluator_isolation(sealed_dataset_dir, private_key_path, runtime_account)
        champion_path = _absolute_path(args.champion_snapshot)
        challenger_path = _absolute_path(args.challenger_snapshot)
        if champion_path.name != "champion.snapshot" or challenger_path.name != "challenger.snapshot":
            raise ValueError("snapshot basename mismatch")
        if challenger_path.parent != champion_path.parent:
            raise ValueError("snapshot parent mismatch")
        request_dir = champion_path.parent
        _require_safe_path(request_dir, request_dir, is_dir=True)
        request_path = request_dir / "request.json"
        protocol_path = request_dir / "protocol.json"
        output_path = request_dir / "receipt.json"
        for path in (request_path, protocol_path, champion_path, challenger_path):
            _require_safe_path(path, request_dir, is_dir=False)
        _require_safe_path(output_path, request_dir, is_dir=False, must_not_exist=True)
        request = EvalRequest.model_validate_json(request_path.read_text(encoding="utf-8"))
        if (
            champion_path != _absolute_path(request.champion_snapshot)
            or challenger_path != _absolute_path(request.challenger_snapshot)
            or _absolute_path(args.protocol_manifest) != protocol_path
            or args.challenge != request.challenge
            or _absolute_path(args.output_receipt) != output_path
            or _absolute_path(request.receipt_path) != output_path
        ):
            raise ValueError("sealed evaluator input binding mismatch")
        protocol = EvalProtocol.model_validate_json(protocol_path.read_text(encoding="utf-8"))
        if protocol.protocol_id != request.protocol_id:
            raise ValueError("protocol binding mismatch")
        if (
            content_digest(champion_path.read_bytes()) != request.champion_digest
            or content_digest(challenger_path.read_bytes()) != request.challenger_digest
        ):
            raise ValueError("snapshot digest mismatch")
        nonce, binding = _parse_challenge(args.challenge)
        provisional = request.model_copy(update={"challenge": nonce})
        if binding != _bundle_binding(provisional, protocol):
            raise ValueError("challenge bundle binding mismatch")
        hard_gate_passed, metrics, failure_categories = _aggregate(
            sealed_dataset_dir,
            champion_path.read_text(encoding="utf-8"),
            challenger_path.read_text(encoding="utf-8"),
        )
        _validate_metrics(metrics)
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
        signature = _private_key(private_key_path).sign(_canonical(receipt))
        receipt = receipt.model_copy(
            update={"signature_b64": base64.b64encode(signature).decode("ascii")}
        )
        with output_path.open("xb") as receipt_file:
            receipt_file.write(_canonical_json_bytes(receipt.model_dump(mode="json")))
        output_path.chmod(0o444)
    except (KeyError, OSError, OverflowError, TypeError, ValueError, json.JSONDecodeError) as error:
        print(f"sealed evaluator failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
