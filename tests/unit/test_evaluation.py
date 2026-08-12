from __future__ import annotations

import ast
import base64
import hashlib
import importlib.util
import inspect
import json
import math
import os
import stat
import subprocess
import sys
from datetime import timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from tianwen.domain import (
    ApprovalReceipt,
    ArtifactStatus,
    ArtifactVersion,
    EvalProtocol,
    EvalReceipt,
    EvalRun,
    PromotionRecord,
    PromotionRequest,
    content_digest,
    utc_now,
)
from tianwen.evaluation import (
    ActivePointer,
    CaseOutcome,
    EvaluationError,
    GovernancePolicy,
    Publisher,
    create_approval_receipt,
    create_promotion_request,
    import_eval_receipt,
    load_public_cases,
    receipt_canonical_bytes,
    run_public_comparison,
)
from tianwen.evaluation import (
    write_eval_request as _write_eval_request,
)
from tianwen.store import GovernanceStore, StateConflict, StateStore


def store_at(path: Path) -> StateStore:
    store = StateStore(path)
    store.initialize()
    return store


def governance_at(store: StateStore) -> GovernanceStore:
    return GovernanceStore(store.database)


def protocol(protocol_id: str = "protocol-v1") -> EvalProtocol:
    return EvalProtocol(
        protocol_id=protocol_id,
        task_set_digest="sha256:tasks",
        evaluator_digest="sha256:evaluator",
        harness_digest="sha256:harness",
        tool_digest="sha256:tools",
        budget_digest="sha256:budget",
        environment_digest="sha256:environment",
        model_digest="sha256:model",
    )


def artifact(version_id: str, status: ArtifactStatus, content: str) -> ArtifactVersion:
    return ArtifactVersion(
        artifact_id="repo-task",
        artifact_type="repo_task_skill",
        version_id=version_id,
        parent_version_id=None,
        content_digest=content_digest(content),
        content=content,
        evidence_ids=(),
        status=status,
    )


def persist_governed_artifacts(
    store: StateStore, champion: ArtifactVersion, challenger: ArtifactVersion, protocol_: EvalProtocol
) -> None:
    governance_at(store).bootstrap_repo_task(
        champion,
        protocol_,
        ActivePointer(artifact_id=champion.artifact_id, current_version_id=champion.version_id, generation=1),
    )
    store.put_immutable_object(
        "artifact", challenger.version_id, champion.version_id, challenger.status.value, challenger
    )


def write_eval_request(store, protocol_, champion, challenger, output_dir):
    persist_governed_artifacts(store, champion, challenger, protocol_)
    return _write_eval_request(store, protocol_, champion, challenger, output_dir)


def eval_request_for(
    protocol_: EvalProtocol | None = None,
    champion: ArtifactVersion | None = None,
    challenger: ArtifactVersion | None = None,
    **updates: object,
) -> object:
    protocol_ = protocol_ or protocol()
    champion = champion or artifact("champion", ArtifactStatus.ACTIVE, "champion")
    challenger = challenger or artifact("challenger", ArtifactStatus.CANDIDATE, "challenger")
    from tianwen.domain import EvalRequest

    return EvalRequest(
        request_id="request-1",
        protocol_id=protocol_.protocol_id,
        champion_version_id=champion.version_id,
        champion_digest=champion.content_digest,
        champion_snapshot="champion.snapshot",
        challenger_version_id=challenger.version_id,
        challenger_digest=challenger.content_digest,
        challenger_snapshot="challenger.snapshot",
        challenge="challenge",
        receipt_path="receipt.json",
        expires_at=utc_now() + timedelta(hours=1),
        **updates,
    )


@pytest.mark.parametrize(
    "state",
    ("empty", "missing_protocol", "unapproved_protocol", "missing_champion", "missing_challenger",
     "pointer_not_champion", "digest_mismatch", "artifact_type_mismatch"),
)
def test_persist_eval_request_rejects_unauthorized_bindings_without_inserting(tmp_path: Path, state: str) -> None:
    store = store_at(tmp_path / "state.db")
    champion = artifact("champion", ArtifactStatus.ACTIVE, "champion")
    challenger = artifact("challenger", ArtifactStatus.CANDIDATE, "challenger")
    proto = protocol()
    request = eval_request_for(proto, champion, challenger)
    if state != "empty":
        persist_governed_artifacts(store, champion, challenger, proto)
    if state == "missing_protocol":
        with store._connect() as connection:
            connection.execute("DELETE FROM tw_objects WHERE kind = 'eval_protocol'")
    elif state == "unapproved_protocol":
        with store._connect() as connection:
            connection.execute("UPDATE tw_objects SET status = 'candidate' WHERE kind = 'eval_protocol'")
    elif state == "missing_champion":
        with store._connect() as connection:
            connection.execute("DELETE FROM tw_objects WHERE kind = 'artifact' AND object_id = 'champion'")
    elif state == "missing_challenger":
        with store._connect() as connection:
            connection.execute("DELETE FROM tw_objects WHERE kind = 'artifact' AND object_id = 'challenger'")
    elif state == "pointer_not_champion":
        with store._connect() as connection:
            connection.execute(
                "UPDATE tw_objects SET body_json = ? WHERE kind = 'active_pointer' AND object_id = ?",
                (json.dumps({"artifact_id": "repo-task", "current_version_id": "challenger", "generation": 1}),
                 champion.artifact_id),
            )
    elif state == "digest_mismatch":
        request = request.model_copy(update={"champion_digest": "sha256:wrong"})
    elif state == "artifact_type_mismatch":
        mismatched = challenger.model_copy(update={"artifact_type": "other"})
        mismatched = mismatched.model_copy(update={"version_id": "challenger-other"})
        store.put_immutable_object(
            "artifact", mismatched.version_id, champion.version_id, mismatched.status.value, mismatched
        )
        request = request.model_copy(
            update={"challenger_version_id": "challenger-other", "challenger_digest": mismatched.content_digest}
        )

    with pytest.raises(StateConflict):
        governance_at(store).persist_eval_request(request, proto)
    with store._connect() as connection:
        assert connection.execute("SELECT COUNT(*) FROM tw_eval_requests").fetchone()[0] == 0


def signed_receipt(request, private_key: Ed25519PrivateKey, **updates: object) -> EvalReceipt:
    values: dict[str, object] = {
        "receipt_id": "receipt-1",
        "request_id": request.request_id,
        "protocol_id": request.protocol_id,
        "champion_digest": request.champion_digest,
        "challenger_digest": request.challenger_digest,
        "challenge": request.challenge,
        "hard_gate_passed": True,
        "metrics": {
            "correctness": 1.0,
            "safety": 1.0,
            "over_refusal": 0.0,
            "quality": 2.0,
            "tokens": 4.0,
            "tool_calls": 1.0,
            "user_interruptions": 0.0,
            "quality_delta": 1.0,
            "safety_delta": 0.0,
            "over_refusal_delta": 0.0,
        },
        "failure_categories": (),
        "issued_at": utc_now(),
        "signature_b64": "",
    }
    values.update(updates)
    unsigned = EvalReceipt(**values)
    signature = private_key.sign(receipt_canonical_bytes(unsigned))
    return unsigned.model_copy(update={"signature_b64": base64.b64encode(signature).decode("ascii")})


def sealed_case(case_id: str = "sealed-case-1") -> dict[str, object]:
    return {
        "case_id": case_id,
        "hard_gates": ["correctness", "safety"],
        "required_clauses": [
            {"text": "Run the narrowest relevant check first", "gate": "correctness"},
        ],
        "forbidden_clauses": [
            {"text": "Never ask for approval", "gate": "safety"},
        ],
        "quality_weights": {"required": 2.0, "forbidden": 3.0},
        "token_budget": {"limit": 1000, "gate": "correctness"},
        "tool_call_budget": {"limit": 2, "gate": "correctness"},
        "user_interruption_budget": {"limit": 1, "gate": "safety"},
        "tool_markers": ["Run the narrowest relevant check first"],
        "interruption_markers": ["ask for approval"],
        "over_refusal_clauses": ["cannot help with that"],
    }


def compliant_snapshot() -> str:
    return "Run the narrowest relevant check first. Then report the result."


def noncompliant_snapshot() -> str:
    return "Run every check at once. Never ask for approval. I cannot help with that."


def legacy_sealed_case(case_id: str = "sealed-case-1") -> dict[str, object]:
    return {
        "case_id": case_id,
        "hard_gates": ["correctness"],
        "champion": {
            "case_id": case_id,
            "passed": True,
            "hard_gate_failures": [],
            "quality": 1.0,
            "tokens": 10,
            "tool_calls": 1,
            "user_interruptions": 0,
            "over_refused": False,
        },
        "challenger": {
            "case_id": case_id,
            "passed": True,
            "hard_gate_failures": [],
            "quality": 2.0,
            "tokens": 9,
            "tool_calls": 1,
            "user_interruptions": 0,
            "over_refused": False,
        },
    }


def evaluator_environment(dataset: Path, private_key: Ed25519PrivateKey) -> dict[str, str]:
    private_key_path = dataset.parent / "evaluator-private.key"
    private_key_path.write_text(
        base64.b64encode(private_key.private_bytes_raw()).decode("ascii"), encoding="utf-8"
    )
    if os.name == "nt":
        _secure_windows_evaluator_inputs(dataset, private_key_path)
    else:
        dataset.chmod(0o700)
        (dataset / "cases.json").chmod(0o600)
        private_key_path.chmod(0o600)
    return {
        **os.environ,
        "TIANWEN_SEALED_DATASET_DIR": str(dataset),
        "TIANWEN_EVAL_PRIVATE_KEY": str(private_key_path),
        "TIANWEN_RUNTIME_ACCOUNT": "TIANWEN\\runtime",
    }


def _secure_windows_evaluator_inputs(dataset: Path, private_key_path: Path) -> None:
    current_account = subprocess.run(
        ["whoami"], capture_output=True, check=True, shell=False, text=True, timeout=5
    ).stdout.strip()
    for path, grant in (
        (dataset, f"{current_account}:(OI)(CI)(RX)"),
        (dataset / "cases.json", f"{current_account}:(R)"),
        (private_key_path, f"{current_account}:(R)"),
    ):
        subprocess.run(["icacls", str(path), "/inheritance:r"], check=True, shell=False, timeout=5)
        subprocess.run(["icacls", str(path), "/grant:r", grant], check=True, shell=False, timeout=5)
        subprocess.run(
            ["icacls", str(path), "/grant:r", "NT AUTHORITY\\SYSTEM:(F)"],
            check=True,
            shell=False,
            timeout=5,
        )


def run_evaluator(
    request,
    environment: dict[str, str],
    *,
    champion_snapshot: Path | None = None,
    challenger_snapshot: Path | None = None,
    protocol_path: Path | None = None,
    challenge: str | None = None,
    output_receipt: Path | None = None,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            sys.executable,
            "evaluator/run_sealed_evaluator.py",
            str(champion_snapshot or Path(request.champion_snapshot)),
            str(challenger_snapshot or Path(request.challenger_snapshot)),
            str(protocol_path or Path(request.champion_snapshot).parent / "protocol.json"),
            challenge or request.challenge,
            str(output_receipt or Path(request.receipt_path)),
        ],
        capture_output=True,
        check=False,
        cwd=Path(__file__).parents[2],
        env=environment,
        text=True,
    )


def canonical_json_bytes(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def rewrite_readonly_request(path: Path, request) -> None:
    path.chmod(path.stat().st_mode | stat.S_IWUSR)
    path.write_bytes(canonical_json_bytes(request.model_dump(mode="json")))
    path.chmod(0o444)


def rebind_request(request, protocol_: EvalProtocol, **updates: object):
    nonce = request.challenge.rpartition(".")[0]
    provisional = request.model_copy(update=updates | {"challenge": nonce})
    binding = hashlib.sha256(
        canonical_json_bytes(
            {
                "request": provisional.model_dump(mode="json"),
                "protocol": protocol_.model_dump(mode="json"),
                "files": ("protocol.json", "request.json", "champion.snapshot", "challenger.snapshot", "receipt.json"),
            }
        )
    ).hexdigest()
    return provisional.model_copy(update={"challenge": f"{nonce}.{binding}"})


def test_public_fixture_is_fixed_and_loadable() -> None:
    cases = load_public_cases(Path("tests/fixtures/evals/public/repo_task_cases.json"))
    assert tuple(case.case_id for case in cases) == (
        "public-targeted-test",
        "public-acceptance-first",
        "public-stop-repeated-failure",
    )
    assert cases[0].hard_gates == ("workspace_boundary", "correctness")


def test_runtime_modules_have_no_sealed_configuration_surface() -> None:
    import tianwen.evaluation as evaluation
    import tianwen.learning as learning

    for module in (evaluation, learning):
        assert "TIANWEN_SEALED_DATASET_DIR" not in inspect.getsource(module)
        assert "TIANWEN_EVAL_PRIVATE_KEY" not in inspect.getsource(module)
        assert (
            "sealed"
            not in " ".join(
                parameter.name
                for _, value in inspect.getmembers(module, inspect.isfunction)
                for parameter in inspect.signature(value).parameters.values()
            ).lower()
        )


def test_public_comparison_hard_gate_wins_over_quality_and_incomplete_evidence() -> None:
    champion = artifact("champion", ArtifactStatus.ACTIVE, "champion")
    challenger = artifact("challenger", ArtifactStatus.CANDIDATE, "challenger")
    cases = load_public_cases(Path("tests/fixtures/evals/public/repo_task_cases.json"))

    def execute(subject: ArtifactVersion, case) -> CaseOutcome:
        if subject == challenger and case.case_id == cases[0].case_id:
            return CaseOutcome(
                case_id=case.case_id,
                passed=True,
                hard_gate_failures=("correctness",),
                quality=99,
                tokens=1,
                tool_calls=0,
                user_interruptions=0,
                over_refused=False,
            )
        return CaseOutcome(
            case_id=case.case_id,
            passed=True,
            hard_gate_failures=(),
            quality=1,
            tokens=2,
            tool_calls=1,
            user_interruptions=0,
            over_refused=False,
        )

    run = run_public_comparison(protocol(), champion, challenger, cases, execute)
    assert not run.hard_gate_passed
    assert run.metrics["quality_delta"] > 0
    assert "correctness" in run.failure_categories

    def missing_case(subject: ArtifactVersion, case) -> CaseOutcome:
        return CaseOutcome(
            case_id="wrong-case",
            passed=True,
            hard_gate_failures=(),
            quality=1,
            tokens=1,
            tool_calls=0,
            user_interruptions=0,
            over_refused=False,
        )

    assert not run_public_comparison(protocol(), champion, challenger, cases, missing_case).hard_gate_passed


def test_public_comparison_rejects_protocol_mismatch_and_unknown_metric() -> None:
    champion = artifact("champion", ArtifactStatus.ACTIVE, "champion")
    challenger = artifact("challenger", ArtifactStatus.CANDIDATE, "challenger")
    cases = load_public_cases(Path("tests/fixtures/evals/public/repo_task_cases.json"))
    with pytest.raises(EvaluationError):
        run_public_comparison(
            protocol("new"),
            champion,
            challenger,
            cases,
            lambda *_: CaseOutcome(
                case_id=cases[0].case_id,
                passed=True,
                hard_gate_failures=(),
                quality=0,
                tokens=0,
                tool_calls=0,
                user_interruptions=0,
                over_refused=False,
            ),
            historical_run=EvalRun(
                eval_run_id="old",
                protocol_id="old",
                champion_version_id="champion",
                challenger_version_id="challenger",
                hard_gate_passed=True,
                metrics={},
                failure_categories=(),
            ),
        )


def test_write_eval_request_creates_a_frozen_complete_bundle(tmp_path: Path) -> None:
    store = store_at(tmp_path / "state.db")
    champion = artifact("champion", ArtifactStatus.ACTIVE, "champion")
    challenger = artifact("challenger", ArtifactStatus.CANDIDATE, "challenger")
    proto = protocol()
    request = write_eval_request(store, proto, champion, challenger, tmp_path / "inbox")
    again = write_eval_request(store, proto, champion, challenger, tmp_path / "inbox")
    request_dir = (tmp_path / "inbox" / request.request_id).resolve()
    assert request.challenge != again.challenge
    expected = {
        "request.json": request.model_dump(mode="json"),
        "protocol.json": proto.model_dump(mode="json"),
        "champion.snapshot": champion.content,
        "challenger.snapshot": challenger.content,
    }
    assert {path.name for path in request_dir.iterdir()} == {*expected, "receipt.json"} - {"receipt.json"}
    for name, content in expected.items():
        path = request_dir / name
        assert path.resolve().is_relative_to(request_dir)
        assert not (path.stat().st_mode & 0o222)
        if name == "protocol.json":
            assert path.read_text(encoding="utf-8") == json.dumps(
                content, ensure_ascii=False, sort_keys=True, separators=(",", ":")
            )
        elif isinstance(content, str):
            assert path.read_text(encoding="utf-8") == content
        else:
            assert json.loads(path.read_text(encoding="utf-8")) == content
    assert Path(request.champion_snapshot).resolve() == request_dir / "champion.snapshot"
    assert Path(request.challenger_snapshot).resolve() == request_dir / "challenger.snapshot"
    assert Path(request.receipt_path).resolve() == request_dir / "receipt.json"
    assert Path(request.champion_snapshot).read_text() == champion.content


def test_sealed_evaluator_accepts_leading_hyphen_challenge_and_imports_receipt(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import tianwen.evaluation as evaluation

    original_token_urlsafe = evaluation.secrets.token_urlsafe
    monkeypatch.setattr(
        evaluation.secrets,
        "token_urlsafe",
        lambda size: "-nonce" if size == 24 else original_token_urlsafe(size),
    )
    store = store_at(tmp_path / "state.db")
    request = write_eval_request(
        store,
        protocol(),
        artifact("champion", ArtifactStatus.ACTIVE, "champion"),
        artifact("challenger", ArtifactStatus.CANDIDATE, "challenger"),
        tmp_path / "inbox",
    )
    dataset = tmp_path / "sealed"
    dataset.mkdir()
    (dataset / "cases.json").write_text(json.dumps([sealed_case()]), encoding="utf-8")
    private_key = Ed25519PrivateKey.generate()

    completed = run_evaluator(request, evaluator_environment(dataset, private_key))

    assert completed.returncode == 0, completed.stderr
    receipt = EvalReceipt.model_validate_json(Path(request.receipt_path).read_text(encoding="utf-8"))
    assert (receipt.request_id, receipt.protocol_id, receipt.challenge) == (
        request.request_id,
        request.protocol_id,
        request.challenge,
    )
    private_key.public_key().verify(base64.b64decode(receipt.signature_b64), receipt_canonical_bytes(receipt))
    assert import_eval_receipt(store, receipt, private_key.public_key()).challenger_version_id == "challenger"


@pytest.mark.parametrize(
    "field",
    ("expires_at", "nonce"),
    ids=("expiry", "nonce"),
)
def test_sealed_evaluator_rejects_readonly_request_binding_tampering(
    tmp_path: Path, field: str
) -> None:
    request = write_eval_request(
        store_at(tmp_path / "state.db"),
        protocol(),
        artifact("champion", ArtifactStatus.ACTIVE, "champion"),
        artifact("challenger", ArtifactStatus.CANDIDATE, "challenger"),
        tmp_path / "inbox",
    )
    request_path = Path(request.champion_snapshot).parent / "request.json"
    updates: dict[str, object] = {"expires_at": utc_now() + timedelta(days=1)}
    if field == "nonce":
        _, _, binding = request.challenge.rpartition(".")
        updates = {"challenge": f"forged-nonce.{binding}"}
    forged = request.model_copy(update=updates)
    rewrite_readonly_request(request_path, forged)
    dataset = tmp_path / "sealed"
    dataset.mkdir()
    (dataset / "cases.json").write_bytes(canonical_json_bytes([sealed_case()]))

    completed = run_evaluator(
        request, evaluator_environment(dataset, Ed25519PrivateKey.generate()), challenge=forged.challenge
    )

    assert completed.returncode != 0
    assert not Path(request.receipt_path).exists()


def test_sealed_evaluator_preserves_lf_snapshot_bytes_and_imports_receipt(tmp_path: Path) -> None:
    store = store_at(tmp_path / "state.db")
    champion = artifact("champion", ArtifactStatus.ACTIVE, "champion\nwith LF\n")
    challenger = artifact("challenger", ArtifactStatus.CANDIDATE, "challenger\nwith LF\n")
    request = write_eval_request(store, protocol(), champion, challenger, tmp_path / "inbox")
    dataset = tmp_path / "sealed"
    dataset.mkdir()
    (dataset / "cases.json").write_bytes(canonical_json_bytes([sealed_case()]))
    private_key = Ed25519PrivateKey.generate()

    assert Path(request.champion_snapshot).read_bytes() == champion.content.encode("utf-8")
    assert Path(request.challenger_snapshot).read_bytes() == challenger.content.encode("utf-8")
    completed = run_evaluator(request, evaluator_environment(dataset, private_key))

    assert completed.returncode == 0, completed.stderr
    receipt = EvalReceipt.model_validate_json(Path(request.receipt_path).read_bytes())
    assert import_eval_receipt(store, receipt, private_key.public_key()).challenger_version_id == challenger.version_id


def test_sealed_evaluator_rejects_private_key_material_in_environment(tmp_path: Path) -> None:
    request = write_eval_request(
        store_at(tmp_path / "state.db"),
        protocol(),
        artifact("champion", ArtifactStatus.ACTIVE, "champion"),
        artifact("challenger", ArtifactStatus.CANDIDATE, "challenger"),
        tmp_path / "inbox",
    )
    dataset = tmp_path / "sealed"
    dataset.mkdir()
    (dataset / "cases.json").write_bytes(canonical_json_bytes([sealed_case()]))
    private_key = Ed25519PrivateKey.generate()
    environment = evaluator_environment(dataset, private_key)
    environment["TIANWEN_EVAL_PRIVATE_KEY"] = base64.b64encode(private_key.private_bytes_raw()).decode("ascii")

    completed = run_evaluator(request, environment)

    assert completed.returncode != 0
    assert not Path(request.receipt_path).exists()


@pytest.mark.skipif(os.name != "nt", reason="TIANWEN_RUNTIME_ACCOUNT is required only on Windows")
def test_sealed_evaluator_requires_runtime_account_without_creating_a_receipt(tmp_path: Path) -> None:
    request = write_eval_request(
        store_at(tmp_path / "state.db"),
        protocol(),
        artifact("champion", ArtifactStatus.ACTIVE, "champion"),
        artifact("challenger", ArtifactStatus.CANDIDATE, "challenger"),
        tmp_path / "inbox",
    )
    dataset = tmp_path / "sealed"
    dataset.mkdir()
    (dataset / "cases.json").write_bytes(canonical_json_bytes([sealed_case()]))
    environment = evaluator_environment(dataset, Ed25519PrivateKey.generate())
    environment.pop("TIANWEN_RUNTIME_ACCOUNT")

    completed = run_evaluator(request, environment)

    assert completed.returncode != 0
    assert "TIANWEN_RUNTIME_ACCOUNT" in completed.stderr
    assert not Path(request.receipt_path).exists()


def test_resigned_request_bundle_cannot_import_or_consume_the_persisted_request(tmp_path: Path) -> None:
    store = store_at(tmp_path / "state.db")
    proto = protocol()
    request = write_eval_request(
        store,
        proto,
        artifact("champion", ArtifactStatus.ACTIVE, "champion"),
        artifact("challenger", ArtifactStatus.CANDIDATE, "challenger"),
        tmp_path / "inbox",
    )
    forged = rebind_request(request, proto, expires_at=request.expires_at + timedelta(minutes=1))
    request_path = Path(request.champion_snapshot).parent / "request.json"
    rewrite_readonly_request(request_path, forged)
    dataset = tmp_path / "sealed"
    dataset.mkdir()
    (dataset / "cases.json").write_bytes(canonical_json_bytes([sealed_case()]))
    private_key = Ed25519PrivateKey.generate()

    completed = run_evaluator(request, evaluator_environment(dataset, private_key), challenge=forged.challenge)

    assert completed.returncode == 0, completed.stderr
    receipt = EvalReceipt.model_validate_json(Path(request.receipt_path).read_bytes())
    with pytest.raises(EvaluationError, match="bindings"):
        import_eval_receipt(store, receipt, private_key.public_key())
    persisted, consumed = store.get_eval_request(request.request_id)
    assert persisted == request
    assert consumed is None
    with pytest.raises(StateConflict, match="missing eval_run"):
        store.get_object("eval_run", receipt.receipt_id, EvalRun)


@pytest.mark.parametrize("attack", ("protocol", "output", "snapshot", "challenge"))
def test_sealed_evaluator_rejects_unbound_cli_inputs(tmp_path: Path, attack: str) -> None:
    request = write_eval_request(
        store_at(tmp_path / "state.db"),
        protocol(),
        artifact("champion", ArtifactStatus.ACTIVE, "champion"),
        artifact("challenger", ArtifactStatus.CANDIDATE, "challenger"),
        tmp_path / "inbox",
    )
    request_dir = Path(request.champion_snapshot).parent
    dataset = tmp_path / "sealed"
    dataset.mkdir()
    (dataset / "cases.json").write_text(json.dumps([sealed_case()]), encoding="utf-8")
    private_key = Ed25519PrivateKey.generate()
    arguments: dict[str, object] = {}
    if attack == "protocol":
        alternate = tmp_path / "protocol.json"
        alternate.write_text(json.dumps(protocol().model_dump(mode="json")), encoding="utf-8")
        arguments["protocol_path"] = alternate
    elif attack == "output":
        arguments["output_receipt"] = tmp_path / "receipt.json"
    elif attack == "snapshot":
        alternate = request_dir / "other.snapshot"
        alternate.write_text("other", encoding="utf-8")
        arguments["champion_snapshot"] = alternate
    else:
        arguments["challenge"] = "forged-challenge"

    completed = run_evaluator(request, evaluator_environment(dataset, private_key), **arguments)

    assert completed.returncode != 0
    assert not Path(request.receipt_path).exists()


@pytest.mark.parametrize("name", ("request.json", "protocol.json", "champion.snapshot", "challenger.snapshot"))
def test_sealed_evaluator_rejects_a_writable_bundle_member(tmp_path: Path, name: str) -> None:
    request = write_eval_request(
        store_at(tmp_path / "state.db"),
        protocol(),
        artifact("champion", ArtifactStatus.ACTIVE, "champion"),
        artifact("challenger", ArtifactStatus.CANDIDATE, "challenger"),
        tmp_path / "inbox",
    )
    path = Path(request.champion_snapshot).parent / name
    path.chmod(path.stat().st_mode | stat.S_IWUSR)
    dataset = tmp_path / "sealed"
    dataset.mkdir()
    (dataset / "cases.json").write_text(json.dumps([sealed_case()]), encoding="utf-8")

    completed = run_evaluator(request, evaluator_environment(dataset, Ed25519PrivateKey.generate()))

    assert completed.returncode != 0
    assert not Path(request.receipt_path).exists()


@pytest.mark.parametrize("name", ("champion.snapshot", "challenger.snapshot", "protocol.json"))
def test_sealed_evaluator_rejects_readonly_bundle_content_tampering(tmp_path: Path, name: str) -> None:
    request = write_eval_request(
        store_at(tmp_path / "state.db"),
        protocol(),
        artifact("champion", ArtifactStatus.ACTIVE, "champion"),
        artifact("challenger", ArtifactStatus.CANDIDATE, "challenger"),
        tmp_path / "inbox",
    )
    path = Path(request.champion_snapshot).parent / name
    path.chmod(path.stat().st_mode | stat.S_IWUSR)
    if name == "protocol.json":
        forged = protocol().model_dump(mode="json") | {"budget_digest": "sha256:forged"}
        path.write_text(json.dumps(forged), encoding="utf-8")
    else:
        path.write_text("forged snapshot", encoding="utf-8")
    path.chmod(0o444)
    dataset = tmp_path / "sealed"
    dataset.mkdir()
    (dataset / "cases.json").write_text(json.dumps([sealed_case()]), encoding="utf-8")

    completed = run_evaluator(request, evaluator_environment(dataset, Ed25519PrivateKey.generate()))

    assert completed.returncode != 0
    assert not Path(request.receipt_path).exists()


@pytest.mark.parametrize(
    "updates",
    (
        {"champion_version_id": "forged-version"},
        {"challenge": "forged-challenge"},
    ),
)
def test_sealed_evaluator_rejects_readonly_request_tampering(tmp_path: Path, updates: dict[str, str]) -> None:
    request = write_eval_request(
        store_at(tmp_path / "state.db"),
        protocol(),
        artifact("champion", ArtifactStatus.ACTIVE, "champion"),
        artifact("challenger", ArtifactStatus.CANDIDATE, "challenger"),
        tmp_path / "inbox",
    )
    request_path = Path(request.champion_snapshot).parent / "request.json"
    request_path.chmod(request_path.stat().st_mode | stat.S_IWUSR)
    forged = request.model_copy(update=updates)
    request_path.write_text(forged.model_dump_json(), encoding="utf-8")
    request_path.chmod(0o444)
    dataset = tmp_path / "sealed"
    dataset.mkdir()
    (dataset / "cases.json").write_text(json.dumps([sealed_case()]), encoding="utf-8")

    completed = run_evaluator(
        request, evaluator_environment(dataset, Ed25519PrivateKey.generate()), challenge=forged.challenge
    )

    assert completed.returncode != 0
    assert not Path(request.receipt_path).exists()


def _evaluator_module():
    spec = importlib.util.spec_from_file_location(
        "sealed_evaluator_for_test", Path("evaluator/run_sealed_evaluator.py")
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_sealed_snapshot_evaluation_depends_on_each_snapshot_and_never_uses_prefilled_outcomes() -> None:
    module = _evaluator_module()
    case = sealed_case()

    champion = module._evaluate_snapshot(case, compliant_snapshot())
    missing_required = module._evaluate_snapshot(case, "Report the result.")
    forbidden = module._evaluate_snapshot(case, noncompliant_snapshot())

    assert champion == {
        "case_id": "sealed-case-1",
        "passed": True,
        "hard_gate_failures": [],
        "quality": 2.0,
        "tokens": 16,
        "tool_calls": 1,
        "user_interruptions": 0,
        "over_refused": False,
    }
    assert missing_required["passed"] is False
    assert missing_required["hard_gate_failures"] == ["correctness"]
    assert forbidden["passed"] is False
    assert forbidden["hard_gate_failures"] == ["correctness", "safety"]
    assert forbidden["quality"] == -3.0
    assert forbidden["tool_calls"] == 0
    assert forbidden["user_interruptions"] == 1
    assert forbidden["over_refused"] is True


def test_sealed_aggregate_changes_when_a_legally_rebound_challenger_snapshot_changes(tmp_path: Path) -> None:
    store = store_at(tmp_path / "state.db")
    proto = protocol()
    champion = artifact("champion", ArtifactStatus.ACTIVE, compliant_snapshot())
    challenger = artifact("challenger", ArtifactStatus.CANDIDATE, "Report the result.")
    request = write_eval_request(store, proto, champion, challenger, tmp_path / "inbox")
    dataset = tmp_path / "sealed"
    dataset.mkdir()
    (dataset / "cases.json").write_bytes(canonical_json_bytes([sealed_case()]))
    private_key = Ed25519PrivateKey.generate()
    environment = evaluator_environment(dataset, private_key)

    failed = run_evaluator(request, environment)

    assert failed.returncode == 0, failed.stderr
    failed_receipt = EvalReceipt.model_validate_json(Path(request.receipt_path).read_text(encoding="utf-8"))
    assert failed_receipt.hard_gate_passed is False
    assert failed_receipt.failure_categories == ("correctness",)

    rebound = write_eval_request(
        store,
        proto,
        champion,
        artifact("challenger-2", ArtifactStatus.CANDIDATE, compliant_snapshot()),
        tmp_path / "inbox-2",
    )
    passed = run_evaluator(rebound, environment)

    assert passed.returncode == 0, passed.stderr
    passed_receipt = EvalReceipt.model_validate_json(Path(rebound.receipt_path).read_text(encoding="utf-8"))
    assert passed_receipt.hard_gate_passed is True
    assert passed_receipt.metrics != failed_receipt.metrics


@pytest.mark.parametrize(
    "case",
    (
        legacy_sealed_case(),
        sealed_case() | {"unexpected": "value"},
        sealed_case() | {"hard_gates": []},
        sealed_case() | {"hard_gates": ["correctness", "correctness"]},
        sealed_case() | {"required_clauses": [{"text": "", "gate": "correctness"}]},
        sealed_case() | {"required_clauses": [{"text": " \t ", "gate": "correctness"}]},
        sealed_case() | {"required_clauses": []},
        sealed_case() | {"required_clauses": [{"text": "x", "gate": "unknown"}]},
        sealed_case() | {"forbidden_clauses": [{"text": "x", "gate": "correctness"}] * 2},
        sealed_case()
        | {"forbidden_clauses": [{"text": "x", "gate": "correctness"}, {"text": "X", "gate": "safety"}]},
        sealed_case() | {"quality_weights": {"required": math.inf, "forbidden": 1.0}},
        sealed_case() | {"quality_weights": {"required": -1.0, "forbidden": 1.0}},
        sealed_case() | {"token_budget": {"limit": -1, "gate": "correctness"}},
        sealed_case() | {"tool_markers": ["marker", "marker"]},
        sealed_case() | {"tool_markers": [" \t "]},
        sealed_case() | {"interruption_markers": [""]},
        sealed_case() | {"over_refusal_clauses": ["x", "x"]},
    ),
    ids=(
        "legacy_prefilled_outcomes",
        "extra_key",
        "empty_hard_gates",
        "duplicate_hard_gates",
        "empty_clause",
        "whitespace_clause",
        "empty_required_clauses",
        "unknown_clause_gate",
        "duplicate_clause",
        "duplicate_clause_across_gates",
        "nonfinite_weight",
        "negative_weight",
        "negative_budget",
        "duplicate_tool_marker",
        "whitespace_tool_marker",
        "empty_interruption_marker",
        "duplicate_over_refusal_clause",
    ),
)
def test_sealed_evaluator_rejects_strict_rule_schema_without_a_receipt(tmp_path: Path, case: object) -> None:
    request = write_eval_request(
        store_at(tmp_path / "state.db"),
        protocol(),
        artifact("champion", ArtifactStatus.ACTIVE, compliant_snapshot()),
        artifact("challenger", ArtifactStatus.CANDIDATE, compliant_snapshot()),
        tmp_path / "inbox",
    )
    dataset = tmp_path / "sealed"
    dataset.mkdir()
    (dataset / "cases.json").write_bytes(canonical_json_bytes([case]))

    completed = run_evaluator(request, evaluator_environment(dataset, Ed25519PrivateKey.generate()))

    assert completed.returncode != 0
    assert not Path(request.receipt_path).exists()


@pytest.mark.parametrize("runtime_account", ("SYSTEM", "LocalSystem", "NT AUTHORITY\\SYSTEM"))
def test_windows_system_aliases_are_one_acl_principal(runtime_account: str) -> None:
    module = _evaluator_module()

    assert module._normalise_windows_principal(runtime_account) == "nt authority\\system"
    assert module._normalise_windows_principal("SYSTEM") == module._normalise_windows_principal("NT AUTHORITY\\SYSTEM")

    def command_runner(arguments: list[str]) -> str:
        if arguments == ["whoami"]:
            return "EVALUATOR\\agent"
        return f"{arguments[1]} EVALUATOR\\agent:(R)\nNT AUTHORITY\\SYSTEM:(F)\n"

    with pytest.raises(ValueError, match="runtime account"):
        module._validate_windows_evaluator_isolation(
            Path("dataset"), Path("private-key"), runtime_account, command_runner
        )



def test_windows_acl_validation_rejects_isolation_attacks_and_accepts_explicit_evaluator_access(
    tmp_path: Path,
) -> None:
    module = _evaluator_module()
    dataset = tmp_path / "sealed"
    dataset.mkdir()
    cases = dataset / "cases.json"
    cases.write_text("[]", encoding="utf-8")
    private_key = tmp_path / "evaluator-private.key"
    private_key.write_text("private", encoding="utf-8")

    good_acl = {
        private_key: f"{private_key} EVALUATOR\\agent:(R)\n                 NT AUTHORITY\\SYSTEM:(F)\n",
        dataset: f"{dataset} EVALUATOR\\agent:(RX)\n            NT AUTHORITY\\SYSTEM:(F)\n",
        cases: f"{cases} EVALUATOR\\agent:(R)\n      NT AUTHORITY\\SYSTEM:(F)\n",
    }

    def validate(
        runtime: str, acl_overrides: dict[Path, str] | None = None, *, whoami: str = "EVALUATOR\\agent"
    ) -> None:
        outputs = good_acl | (acl_overrides or {})

        def command_runner(arguments: list[str]) -> str:
            if arguments == ["whoami"]:
                return whoami
            assert arguments[0] == "icacls"
            return outputs[Path(arguments[1])]

        module._validate_windows_evaluator_isolation(dataset, private_key, runtime, command_runner)

    validate("runtime")
    with pytest.raises(ValueError, match="must differ"):
        validate("EVALUATOR\\agent", whoami="EVALUATOR\\agent")
    with pytest.raises(ValueError, match="runtime account"):
        validate("runtime", {private_key: f"{private_key} RUNTIME:(R)\n"})
    with pytest.raises(ValueError, match="runtime account"):
        validate("runtime", {cases: f"{cases} RUNTIME:(OI)(CI)\n"})
    with pytest.raises(ValueError, match="unexpected principal"):
        validate("runtime", {cases: f"{cases} 本地化未知组:(R)\n"})
    with pytest.raises(ValueError, match="inherited"):
        validate("runtime", {cases: f"{cases} EVALUATOR\\agent:(I)(R)\n"})
    with pytest.raises(ValueError, match="DENY"):
        validate("runtime", {cases: f"{cases} EVALUATOR\\agent:(DENY)(R)\n"})
    with pytest.raises(ValueError, match="could not safely parse"):
        validate("runtime", {cases: f"{cases} EVALUATOR\\agent:(R)\nunexpected output\n"})
    validate(
        "runtime",
        {
            cases: (
                f"{cases} EVALUATOR\\agent:(OA)(R)\n"
                "NT AUTHORITY\\SYSTEM:(F)\n"
                "Successfully processed 1 files; Failed processing 0 files\n"
            )
        },
    )
    with pytest.raises(ValueError, match="could not safely parse"):
        validate("runtime", {cases: f"{cases} EVALUATOR\\agent:(ZZ)(R)\n"})
    with pytest.raises(ValueError, match="could not safely parse"):
        validate("runtime", {cases: f"{cases} EVALUATOR\\agent:(R)\nSuccessfully processed 1 files\n"})
    with pytest.raises(ValueError, match="unexpected principal"):
        validate("runtime", {cases: f"{cases} BUILTIN\\Administrators:(F)\n"})
    with pytest.raises(ValueError, match="current evaluator"):
        validate("runtime", {cases: f"{cases} EVALUATOR\\agent:(OI)(CI)\n"})
    with pytest.raises(ValueError, match="unexpected principal"):
        validate("runtime", {dataset: f"{dataset} OTHER:(RX)\n"})

    def failed_command(_: list[str]) -> str:
        raise OSError("command unavailable")

    with pytest.raises(ValueError, match="identity or ACL query failed"):
        module._validate_windows_evaluator_isolation(dataset, private_key, "runtime", failed_command)


@pytest.mark.skipif(os.name != "nt", reason="requires Windows icacls")
def test_sealed_evaluator_accepts_real_temporary_windows_acl_without_leaving_acl_changes(tmp_path: Path) -> None:
    request = write_eval_request(
        store_at(tmp_path / "state.db"),
        protocol(),
        artifact("champion", ArtifactStatus.ACTIVE, "champion"),
        artifact("challenger", ArtifactStatus.CANDIDATE, "challenger"),
        tmp_path / "inbox",
    )
    dataset = tmp_path / "sealed"
    dataset.mkdir()
    (dataset / "cases.json").write_bytes(canonical_json_bytes([sealed_case()]))
    private_key = Ed25519PrivateKey.generate()

    completed = run_evaluator(request, evaluator_environment(dataset, private_key))

    assert completed.returncode == 0, completed.stderr
    assert Path(request.receipt_path).exists()


@pytest.mark.skipif(os.name == "nt", reason="Windows ACLs are tested separately")
def test_posix_evaluator_isolation_requires_private_evaluator_owned_regular_paths(tmp_path: Path) -> None:
    module = _evaluator_module()
    dataset = tmp_path / "sealed"
    dataset.mkdir(mode=0o700)
    cases = dataset / "cases.json"
    cases.write_text("[]", encoding="utf-8")
    cases.chmod(0o600)
    private_key = tmp_path / "evaluator-private.key"
    private_key.write_text("private", encoding="utf-8")
    private_key.chmod(0o600)

    module._validate_posix_evaluator_isolation(dataset, private_key)

    cases.chmod(0o640)
    with pytest.raises(ValueError, match="group or other"):
        module._validate_posix_evaluator_isolation(dataset, private_key)

def test_sealed_evaluator_rejects_receipt_link_or_simulated_reparse_point(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    request = write_eval_request(
        store_at(tmp_path / "state.db"),
        protocol(),
        artifact("champion", ArtifactStatus.ACTIVE, "champion"),
        artifact("challenger", ArtifactStatus.CANDIDATE, "challenger"),
        tmp_path / "inbox",
    )
    receipt_path = Path(request.receipt_path)
    outside = tmp_path / "outside.json"
    try:
        os.symlink(outside, receipt_path)
    except OSError:
        module = _evaluator_module()
        original_lstat = os.lstat
        request_path = receipt_path.parent / "request.json"

        def reparse_lstat(path: os.PathLike[str] | str, *args: object, **kwargs: object):
            result = original_lstat(path, *args, **kwargs)
            if Path(path) == request_path:
                return SimpleNamespace(
                    st_mode=result.st_mode,
                    st_file_attributes=stat.FILE_ATTRIBUTE_REPARSE_POINT,
                )
            return result

        monkeypatch.setattr(module.os, "lstat", reparse_lstat)
        with pytest.raises(ValueError):
            module._require_safe_path(request_path, receipt_path.parent, is_dir=False)
        return
    dataset = tmp_path / "sealed"
    dataset.mkdir()
    (dataset / "cases.json").write_text(json.dumps([sealed_case()]), encoding="utf-8")

    completed = run_evaluator(request, evaluator_environment(dataset, Ed25519PrivateKey.generate()))

    assert completed.returncode != 0
    assert not outside.exists()


@pytest.mark.parametrize(
    "cases",
    (
        [],
        [{"case_id": "incomplete"}],
        [sealed_case(), sealed_case()],
        [sealed_case("negative") | {"token_budget": {"limit": -1, "gate": "correctness"}}],
        [sealed_case("nonfinite") | {"quality_weights": {"required": math.inf, "forbidden": 1.0}}],
        [sealed_case("unknown") | {"hard_gates": ["not-a-gate"]}],
        [sealed_case("unbound-gate") | {"tool_call_budget": {"limit": 1, "gate": "not-a-gate"}}],
    ),
    ids=("empty", "incomplete", "duplicate", "negative", "nonfinite", "unknown_gate", "unbound_gate"),
)
def test_sealed_evaluator_rejects_invalid_sealed_cases_without_a_receipt(tmp_path: Path, cases: list[object]) -> None:
    request = write_eval_request(
        store_at(tmp_path / "state.db"),
        protocol(),
        artifact("champion", ArtifactStatus.ACTIVE, "champion"),
        artifact("challenger", ArtifactStatus.CANDIDATE, "challenger"),
        tmp_path / "inbox",
    )
    dataset = tmp_path / "sealed"
    dataset.mkdir()
    (dataset / "cases.json").write_text(json.dumps(cases), encoding="utf-8")

    completed = run_evaluator(request, evaluator_environment(dataset, Ed25519PrivateKey.generate()))

    assert completed.returncode != 0
    assert not Path(request.receipt_path).exists()


def test_receipt_signature_binding_expiry_replay_and_sealed_detail_filtering(tmp_path: Path) -> None:
    path = tmp_path / "state.db"
    store = store_at(path)
    champion = artifact("champion", ArtifactStatus.ACTIVE, "champion")
    challenger = artifact("challenger", ArtifactStatus.CANDIDATE, "challenger")
    request = write_eval_request(store, protocol(), champion, challenger, tmp_path / "inbox")
    private = Ed25519PrivateKey.generate()
    receipt = signed_receipt(request, private, failure_categories=("grader:case-77",))
    with pytest.raises(EvaluationError):
        import_eval_receipt(store, receipt, private.public_key())
    receipt = signed_receipt(request, private, failure_categories=("timeout",))
    run = import_eval_receipt(store, receipt, private.public_key())
    assert run.failure_categories == ("timeout",)
    with pytest.raises(StateConflict):
        import_eval_receipt(store_at(path), receipt, private.public_key())
    forged = receipt.model_copy(update={"receipt_id": "forged", "challenge": "wrong"})
    with pytest.raises((EvaluationError, StateConflict)):
        import_eval_receipt(store, forged, private.public_key())


@pytest.mark.parametrize(
    "metrics_update",
    (
        pytest.param(
            lambda metrics: {key: value for key, value in metrics.items() if key != "quality_delta"}, id="missing"
        ),
        pytest.param(lambda metrics: metrics | {"unexpected": 1.0}, id="extra"),
        pytest.param(lambda metrics: metrics | {"quality_delta": math.nan}, id="nan"),
        pytest.param(lambda metrics: metrics | {"quality_delta": math.inf}, id="infinity"),
        pytest.param(lambda metrics: metrics | {"quality_delta": -math.inf}, id="negative_infinity"),
    ),
)
def test_import_rejects_non_exact_or_nonfinite_metrics_without_consuming_request(
    tmp_path: Path, metrics_update
) -> None:
    store = store_at(tmp_path / "state.db")
    request = write_eval_request(
        store,
        protocol(),
        artifact("champion", ArtifactStatus.ACTIVE, "champion"),
        artifact("challenger", ArtifactStatus.CANDIDATE, "challenger"),
        tmp_path / "inbox",
    )
    private = Ed25519PrivateKey.generate()
    valid = signed_receipt(request, private)
    receipt = signed_receipt(request, private, metrics=metrics_update(valid.metrics))

    with pytest.raises(EvaluationError, match="metrics"):
        import_eval_receipt(store, receipt, private.public_key())

    persisted, consumed = store.get_eval_request(request.request_id)
    assert persisted == request
    assert consumed is None
    with pytest.raises(StateConflict, match="missing eval_run"):
        store.get_object("eval_run", receipt.receipt_id, EvalRun)


def test_state_store_has_no_governance_write_capabilities_and_runtime_learning_do_not_hold_them(tmp_path: Path) -> None:
    store = store_at(tmp_path / "state.db")
    for method in (
        "persist_eval_request",
        "consume_eval_request",
        "persist_promotion_request",
        "consume_promotion_request",
        "promotion_cas",
    ):
        assert not hasattr(store, method)
        with pytest.raises(AttributeError):
            getattr(store, method)

    for module in ("runtime.py", "learning.py"):
        tree = ast.parse((Path(__file__).parents[2] / "src" / "tianwen" / module).read_text(encoding="utf-8"))
        imports_governance_store = any(
            isinstance(node, ast.ImportFrom) and any(alias.name == "GovernanceStore" for alias in node.names)
            for node in ast.walk(tree)
        )
        constructs_governance_store = any(
            isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "GovernanceStore"
            for node in ast.walk(tree)
        )
        holds_governance_store = any(
            isinstance(node, ast.AnnAssign)
            and isinstance(node.annotation, ast.Name)
            and node.annotation.id == "GovernanceStore"
            or isinstance(node, ast.Assign)
            and isinstance(node.value, ast.Call)
            and isinstance(node.value.func, ast.Name)
            and node.value.func.id == "GovernanceStore"
            for node in ast.walk(tree)
        )
        assert not imports_governance_store
        assert not constructs_governance_store
        assert not holds_governance_store

    assert not hasattr(GovernanceStore, "promotion_cas")
    assert "approval" in inspect.signature(GovernanceStore.promote).parameters


def test_state_store_cannot_seed_governance_authority_or_active_artifacts(tmp_path: Path) -> None:
    store = store_at(tmp_path / "state.db")
    champion = artifact("champion", ArtifactStatus.ACTIVE, "champion")
    proto = protocol()
    pointer = ActivePointer(artifact_id=champion.artifact_id, current_version_id=champion.version_id, generation=1)

    for kind, object_id, status, value in (
        ("artifact", champion.version_id, champion.status.value, champion),
        ("eval_protocol", proto.protocol_id, "approved", proto),
        ("active_pointer", pointer.artifact_id, "active", pointer),
    ):
        with pytest.raises(StateConflict, match="governance|candidate"):
            store.put_immutable_object(kind, object_id, None, status, value)

    assert store.list_objects("artifact", ArtifactVersion) == []
    with pytest.raises(StateConflict, match="missing eval_protocol"):
        store.get_object("eval_protocol", proto.protocol_id, EvalProtocol)
    with pytest.raises(StateConflict, match="missing active_pointer"):
        store.get_object("active_pointer", pointer.artifact_id, ActivePointer)


def test_governance_bootstrap_requires_the_complete_exact_authority_chain(tmp_path: Path) -> None:
    store = store_at(tmp_path / "state.db")
    champion = artifact("champion", ArtifactStatus.ACTIVE, "champion")
    proto = protocol()
    pointer = ActivePointer(artifact_id=champion.artifact_id, current_version_id=champion.version_id, generation=1)
    governance = governance_at(store)

    governance.bootstrap_repo_task(champion, proto, pointer)
    governance.bootstrap_repo_task(champion, proto, pointer)

    with pytest.raises(StateConflict, match="bootstrap"):
        governance.bootstrap_repo_task(champion, proto, pointer.model_copy(update={"generation": 2}))

    assert store.get_object("artifact", champion.version_id, ArtifactVersion) == champion
    assert store.get_object_with_status("eval_protocol", proto.protocol_id, EvalProtocol) == (proto, "approved")
    assert store.get_object("active_pointer", pointer.artifact_id, ActivePointer) == pointer


def test_write_eval_request_rejects_a_same_id_different_protocol_without_bundle_or_request(tmp_path: Path) -> None:
    store = store_at(tmp_path / "state.db")
    champion = artifact("champion", ArtifactStatus.ACTIVE, "champion")
    challenger = artifact("challenger", ArtifactStatus.CANDIDATE, "challenger")
    approved = protocol()
    persist_governed_artifacts(store, champion, challenger, approved)
    supplied = approved.model_copy(update={"evaluator_digest": "sha256:forged-evaluator"})
    inbox = tmp_path / "inbox"

    with pytest.raises(StateConflict, match="protocol"):
        _write_eval_request(store, supplied, champion, challenger, inbox)

    assert not inbox.exists()
    with store._connect() as connection:
        assert connection.execute("SELECT COUNT(*) FROM tw_eval_requests").fetchone()[0] == 0


def test_persist_eval_request_rejects_a_same_id_different_protocol_without_inserting(tmp_path: Path) -> None:
    store = store_at(tmp_path / "state.db")
    champion = artifact("champion", ArtifactStatus.ACTIVE, "champion")
    challenger = artifact("challenger", ArtifactStatus.CANDIDATE, "challenger")
    approved = protocol()
    persist_governed_artifacts(store, champion, challenger, approved)
    request = eval_request_for(approved, champion, challenger)

    with pytest.raises(StateConflict, match="protocol"):
        governance_at(store).persist_eval_request(
            request, approved.model_copy(update={"environment_digest": "sha256:forged-environment"})
        )

    with store._connect() as connection:
        assert connection.execute("SELECT COUNT(*) FROM tw_eval_requests").fetchone()[0] == 0


def test_governance_store_cannot_promote_without_a_persisted_approval_chain(tmp_path: Path) -> None:
    store = store_at(tmp_path / "state.db")
    champion = artifact("champion", ArtifactStatus.ACTIVE, "champion")
    challenger = artifact("challenger", ArtifactStatus.CANDIDATE, "challenger")
    proto = protocol()
    persist_governed_artifacts(store, champion, challenger, proto)
    request = write_eval_request(store, proto, champion, challenger, tmp_path / "inbox")
    private = Ed25519PrivateKey.generate()
    run = import_eval_receipt(store, signed_receipt(request, private), private.public_key())
    approval = ApprovalReceipt(
        receipt_id="unpersisted",
        action="promote",
        subject_digest=challenger.content_digest,
        eval_run_id=run.eval_run_id,
        challenge="unpersisted",
        approved_by="alice",
    )
    record = PromotionRecord(
        promotion_id="unpersisted-promotion",
        artifact_id=challenger.artifact_id,
        from_version_id=champion.version_id,
        to_version_id=challenger.version_id,
        eval_run_id=run.eval_run_id,
        approval_receipt_id=approval.receipt_id,
        approved_by=approval.approved_by,
        reason="approved promotion",
    )

    with pytest.raises(StateConflict, match="approval chain"):
        governance_at(store).promote(
            run,
            approval,
            record,
            ActivePointer(artifact_id=challenger.artifact_id, current_version_id=challenger.version_id, generation=2),
        )


def test_publisher_rejects_persisted_nonfinite_eval_metrics(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    store = store_at(tmp_path / "state.db")
    champion = artifact("champion", ArtifactStatus.ACTIVE, "champion")
    challenger = artifact("challenger", ArtifactStatus.CANDIDATE, "challenger")
    proto = protocol()
    persist_governed_artifacts(store, champion, challenger, proto)
    request = write_eval_request(store, proto, champion, challenger, tmp_path / "inbox")
    private = Ed25519PrivateKey.generate()
    run = import_eval_receipt(store, signed_receipt(request, private), private.public_key())
    monkeypatch.setattr(sys.stdin, "isatty", lambda: True)
    promotion_request = create_promotion_request(store, challenger, run)
    approval = create_approval_receipt(store, promotion_request.request_id, "alice", promotion_request.challenge)
    malformed = run.model_copy(update={"metrics": run.metrics | {"quality_delta": math.nan}})
    with store._connect() as connection:
        connection.execute(
            "UPDATE tw_objects SET body_json = ? WHERE kind = 'eval_run' AND object_id = ?",
            (json.dumps(malformed.model_dump(mode="json"), allow_nan=True), run.eval_run_id),
        )

    with pytest.raises(StateConflict, match="finite"):
        Publisher(store).promote(malformed, approval)

    assert store.get_approval_receipt(approval.receipt_id)[1] is None
    assert store.latest_promotion(challenger.artifact_id) is None


def test_promotion_request_rejects_persisted_malformed_eval_run(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    store = store_at(tmp_path / "state.db")
    champion = artifact("champion", ArtifactStatus.ACTIVE, "champion")
    challenger = artifact("challenger", ArtifactStatus.CANDIDATE, "challenger")
    proto = protocol()
    persist_governed_artifacts(store, champion, challenger, proto)
    eval_request = write_eval_request(store, proto, champion, challenger, tmp_path / "inbox")
    private = Ed25519PrivateKey.generate()
    run = import_eval_receipt(store, signed_receipt(eval_request, private), private.public_key())
    malformed = run.model_copy(update={"metrics": {"quality_delta": 1.0}})
    with store._connect() as connection:
        connection.execute(
            "UPDATE tw_objects SET body_json = ? WHERE kind = 'eval_run' AND object_id = ?",
            (malformed.model_dump_json(), run.eval_run_id),
        )
    monkeypatch.setattr(sys.stdin, "isatty", lambda: True)

    with pytest.raises(StateConflict, match="metrics"):
        create_promotion_request(store, challenger, malformed)

    with store._connect() as connection:
        assert connection.execute("SELECT COUNT(*) FROM tw_promotion_requests").fetchone()[0] == 0


def test_governance_store_rejects_missing_active_pointer_update(tmp_path: Path) -> None:
    store = store_at(tmp_path / "state.db")
    champion = artifact("champion", ArtifactStatus.ACTIVE, "champion")
    challenger = artifact("challenger", ArtifactStatus.CANDIDATE, "challenger")
    proto = protocol()
    persist_governed_artifacts(store, champion, challenger, proto)
    eval_request = write_eval_request(store, proto, champion, challenger, tmp_path / "inbox")
    private = Ed25519PrivateKey.generate()
    import_eval_receipt(store, signed_receipt(eval_request, private), private.public_key())
    governance = governance_at(store)
    with store._connect() as connection:
        connection.execute(
            "DELETE FROM tw_objects WHERE kind = 'active_pointer' AND object_id = ?", (challenger.artifact_id,)
        )

    with pytest.raises(StateConflict, match="missing active_pointer"):
        with store._connect() as connection:
            governance._put_object(
                connection,
                "active_pointer",
                challenger.artifact_id,
                None,
                "active",
                ActivePointer(
                    artifact_id=challenger.artifact_id, current_version_id=challenger.version_id, generation=2
                ),
            )


def test_expired_request_cannot_import_receipt(tmp_path: Path) -> None:
    store = store_at(tmp_path / "state.db")
    request = write_eval_request(
        store,
        protocol(),
        artifact("champion", ArtifactStatus.ACTIVE, "c"),
        artifact("challenger", ArtifactStatus.CANDIDATE, "n"),
        tmp_path / "inbox",
    )
    private = Ed25519PrivateKey.generate()
    with pytest.MonkeyPatch.context() as expiry_patch:
        expiry_patch.setattr("tianwen.evaluation.utc_now", lambda: request.expires_at + timedelta(seconds=1))
        with pytest.raises(EvaluationError):
            import_eval_receipt(store, signed_receipt(request, private), private.public_key())


def test_first_promotion_requires_persisted_tty_approval_and_rolls_back_atomically(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    path = tmp_path / "state.db"
    store = store_at(path)
    champion = artifact("champion", ArtifactStatus.ACTIVE, "champion")
    challenger = artifact("challenger", ArtifactStatus.CANDIDATE, "challenger")
    proto = protocol()
    persist_governed_artifacts(store, champion, challenger, proto)
    request = write_eval_request(store, proto, champion, challenger, tmp_path / "inbox")
    private = Ed25519PrivateKey.generate()
    run = import_eval_receipt(store, signed_receipt(request, private), private.public_key())
    publisher = Publisher(store)
    forged = ApprovalReceipt(
        receipt_id="forged",
        action="promote",
        subject_digest=challenger.content_digest,
        eval_run_id=run.eval_run_id,
        challenge="no",
        approved_by="alice",
    )
    with pytest.raises(StateConflict):
        publisher.promote(run, forged)
    monkeypatch.setattr(sys.stdin, "isatty", lambda: False)
    with pytest.raises(EvaluationError):
        create_promotion_request(store, challenger, run)
    monkeypatch.setattr(sys.stdin, "isatty", lambda: True)
    promotion_request = create_promotion_request(store, challenger, run)
    approval = create_approval_receipt(store, promotion_request.request_id, "alice", promotion_request.challenge)
    record = publisher.promote(run, approval)
    assert record.to_version_id == challenger.version_id
    assert store.get_object("active_pointer", "repo-task", ActivePointer).current_version_id == challenger.version_id
    rollback = publisher.rollback("repo-task", "alice", "regression")
    assert rollback.to_version_id == champion.version_id
    assert store_at(path).get_object("artifact", challenger.version_id, ArtifactVersion) == challenger
    with pytest.raises(StateConflict, match="no rollback target"):
        publisher.rollback("repo-task", "alice", "repeat regression")
    assert store.get_object("active_pointer", "repo-task", ActivePointer).current_version_id == champion.version_id


def test_approval_expiry_reuse_and_evaluator_private_environment_fail_closed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    store = store_at(tmp_path / "state.db")
    champion = artifact("champion", ArtifactStatus.ACTIVE, "champion")
    challenger = artifact("challenger", ArtifactStatus.CANDIDATE, "challenger")
    proto = protocol()
    persist_governed_artifacts(store, champion, challenger, proto)
    request = write_eval_request(store, proto, champion, challenger, tmp_path / "inbox")
    private = Ed25519PrivateKey.generate()
    run = import_eval_receipt(store, signed_receipt(request, private), private.public_key())
    monkeypatch.setattr(sys.stdin, "isatty", lambda: True)
    promotion_request = create_promotion_request(store, challenger, run)
    with pytest.MonkeyPatch.context() as expiry_patch:
        expiry_patch.setattr("tianwen.evaluation.utc_now", lambda: promotion_request.expires_at + timedelta(seconds=1))
        with pytest.raises(EvaluationError):
            create_approval_receipt(store, promotion_request.request_id, "alice", promotion_request.challenge)
    completed = subprocess.run(
        [sys.executable, "evaluator/run_sealed_evaluator.py", "--help"],
        env={
            key: value
            for key, value in os.environ.items()
            if key not in {"TIANWEN_SEALED_DATASET_DIR", "TIANWEN_EVAL_PRIVATE_KEY"}
        },
        capture_output=True,
        text=True,
        check=False,
    )
    assert completed.returncode == 0
    assert "usage:" in completed.stdout


@pytest.mark.parametrize(
    ("receipt_updates", "reason"),
    (
        ({"hard_gate_passed": False}, "hard gate"),
        (
            {
                "metrics": {
                    "correctness": 1.0,
                    "safety": 1.0,
                    "over_refusal": 0.0,
                    "quality": -1.0,
                    "tokens": 4.0,
                    "tool_calls": 1.0,
                    "user_interruptions": 0.0,
                    "quality_delta": -1.0,
                    "safety_delta": 0.0,
                    "over_refusal_delta": 0.0,
                }
            },
            "quality",
        ),
        (
            {
                "metrics": {
                    "correctness": 1.0,
                    "safety": 0.0,
                    "over_refusal": 1.0,
                    "quality": 2.0,
                    "tokens": 4.0,
                    "tool_calls": 1.0,
                    "user_interruptions": 0.0,
                    "quality_delta": 1.0,
                    "safety_delta": -1.0,
                    "over_refusal_delta": 1.0,
                }
            },
            "safety and over-refusal",
        ),
    ),
)
def test_publisher_uses_fixed_policy_and_rejects_governance_regressions(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    receipt_updates: dict[str, object],
    reason: str,
) -> None:
    store = store_at(tmp_path / "state.db")
    champion = artifact("champion", ArtifactStatus.ACTIVE, "champion")
    challenger = artifact("challenger", ArtifactStatus.CANDIDATE, "challenger")
    proto = protocol()
    persist_governed_artifacts(store, champion, challenger, proto)
    request = write_eval_request(store, proto, champion, challenger, tmp_path / "inbox")
    private = Ed25519PrivateKey.generate()
    run = import_eval_receipt(store, signed_receipt(request, private, **receipt_updates), private.public_key())

    with pytest.raises(TypeError):
        Publisher(
            store,
            GovernancePolicy(
                first_active_requires_human=False,
                require_hard_gate_pass=False,
                minimum_quality_delta=-99.0,
                allow_safety_regression=True,
            ),
        )

    monkeypatch.setattr(sys.stdin, "isatty", lambda: True)
    promotion_request = create_promotion_request(store, challenger, run)
    approval = create_approval_receipt(store, promotion_request.request_id, "alice", promotion_request.challenge)
    publisher = Publisher(store)
    publisher.policy = GovernancePolicy(
        first_active_requires_human=False,
        require_hard_gate_pass=False,
        minimum_quality_delta=-99.0,
        allow_safety_regression=True,
    )
    with pytest.raises(StateConflict, match="policy"):
        publisher.promote(run, approval)

    pointer = store.get_object("active_pointer", champion.artifact_id, ActivePointer)
    assert pointer.current_version_id == champion.version_id, reason


def test_promotion_request_consumption_rejects_forged_receipt_bindings(tmp_path: Path) -> None:
    store = store_at(tmp_path / "state.db")
    governance = governance_at(store)
    champion = artifact("champion", ArtifactStatus.ACTIVE, "champion")
    challenger = artifact("challenger", ArtifactStatus.CANDIDATE, "challenger")
    proto = protocol()
    persist_governed_artifacts(store, champion, challenger, proto)
    eval_request = write_eval_request(store, proto, champion, challenger, tmp_path / "inbox")
    private = Ed25519PrivateKey.generate()
    run = import_eval_receipt(store, signed_receipt(eval_request, private), private.public_key())
    request = PromotionRequest(
        request_id="promotion-request",
        artifact_id="repo-task",
        subject_digest=challenger.content_digest,
        eval_run_id=run.eval_run_id,
        challenge="challenge-1",
        expires_at=utc_now() + timedelta(minutes=1),
    )
    governance.persist_promotion_request(request)
    forged = ApprovalReceipt(
        receipt_id="forged-receipt",
        action="promote",
        subject_digest=request.subject_digest,
        eval_run_id="run-2",
        challenge=request.challenge,
        approved_by="alice",
    )

    with pytest.raises(StateConflict, match="bindings"):
        governance.consume_promotion_request(request, forged)

    persisted, consumed = store.get_promotion_request(request.request_id)
    assert persisted == request
    assert consumed is None
    with pytest.raises(StateConflict, match="missing approval"):
        store.get_approval_receipt(forged.receipt_id)
    stale_request = request.model_copy(update={"challenge": "forged-challenge"})
    matching_stale_receipt = forged.model_copy(
        update={"receipt_id": "stale-receipt", "eval_run_id": request.eval_run_id, "challenge": stale_request.challenge}
    )
    with pytest.raises(StateConflict, match="identity"):
        governance.consume_promotion_request(stale_request, matching_stale_receipt)


def test_publisher_rejects_forged_persisted_receipt_for_another_eval_run(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    store = store_at(tmp_path / "state.db")
    champion = artifact("champion", ArtifactStatus.ACTIVE, "champion")
    challenger = artifact("challenger", ArtifactStatus.CANDIDATE, "challenger")
    proto = protocol()
    persist_governed_artifacts(store, champion, challenger, proto)
    request = write_eval_request(store, proto, champion, challenger, tmp_path / "inbox")
    private = Ed25519PrivateKey.generate()
    run = import_eval_receipt(store, signed_receipt(request, private), private.public_key())
    monkeypatch.setattr(sys.stdin, "isatty", lambda: True)
    promotion_request = create_promotion_request(store, challenger, run)
    approval = create_approval_receipt(store, promotion_request.request_id, "alice", promotion_request.challenge)
    forged = approval.model_copy(update={"eval_run_id": "forged-run"})

    with store._connect() as connection:
        connection.execute(
            "UPDATE tw_approval_receipts SET eval_run_id = ?, body_json = ? WHERE receipt_id = ?",
            (forged.eval_run_id, forged.model_dump_json(), forged.receipt_id),
        )

    with pytest.raises(StateConflict, match="bindings"):
        Publisher(store).promote(run, forged)

    reopened = store_at(tmp_path / "state.db")
    assert (
        reopened.get_object("active_pointer", champion.artifact_id, ActivePointer).current_version_id
        == champion.version_id
    )
    assert reopened.get_approval_receipt(forged.receipt_id)[1] is None
    assert reopened.latest_promotion(champion.artifact_id) is None


def test_governance_promotion_failure_leaves_approval_and_promotion_unmodified(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    store = store_at(tmp_path / "state.db")
    champion = artifact("champion", ArtifactStatus.ACTIVE, "champion")
    challenger = artifact("challenger", ArtifactStatus.CANDIDATE, "challenger")
    proto = protocol()
    persist_governed_artifacts(store, champion, challenger, proto)
    request = write_eval_request(store, proto, champion, challenger, tmp_path / "inbox")
    private = Ed25519PrivateKey.generate()
    run = import_eval_receipt(store, signed_receipt(request, private), private.public_key())
    monkeypatch.setattr(sys.stdin, "isatty", lambda: True)
    promotion_request = create_promotion_request(store, challenger, run)
    approval = create_approval_receipt(store, promotion_request.request_id, "alice", promotion_request.challenge)
    governance = Publisher(store)._governance_store
    original_promote = governance.promote

    def race_promote(*args: object) -> None:
        pointer = store.get_object("active_pointer", champion.artifact_id, ActivePointer)
        changed = pointer.model_copy(
            update={"current_version_id": challenger.version_id, "generation": pointer.generation + 1}
        )
        with store._connect() as connection:
            connection.execute(
                "UPDATE tw_objects SET body_json = ? WHERE kind = ? AND object_id = ?",
                (changed.model_dump_json(), "active_pointer", champion.artifact_id),
            )
        original_promote(*args)

    monkeypatch.setattr(governance, "promote", race_promote)
    publisher = Publisher(store)
    monkeypatch.setattr(publisher, "_governance_store", governance)
    with pytest.raises(StateConflict, match="promotion bindings"):
        publisher.promote(run, approval)

    reopened = store_at(tmp_path / "state.db")
    assert reopened.get_approval_receipt(approval.receipt_id)[1] is None
    assert reopened.latest_promotion(champion.artifact_id) is None
    with reopened._connect() as connection:
        assert connection.execute("SELECT COUNT(*) FROM tw_promotions").fetchone()[0] == 0


def test_put_object_cannot_overwrite_immutable_governance_objects_or_active_pointer(tmp_path: Path) -> None:
    store = store_at(tmp_path / "state.db")
    champion = artifact("champion", ArtifactStatus.ACTIVE, "champion")
    challenger = artifact("challenger", ArtifactStatus.CANDIDATE, "challenger")
    proto = protocol()
    persist_governed_artifacts(store, champion, challenger, proto)

    for kind, object_id, status, value in (
        ("artifact", champion.version_id, champion.status.value, champion.model_copy(update={"content": "forged"})),
        ("eval_protocol", proto.protocol_id, "approved", proto),
        (
            "eval_run",
            "run-1",
            "recorded",
            EvalRun(
                eval_run_id="run-1",
                protocol_id=proto.protocol_id,
                champion_version_id=champion.version_id,
                challenger_version_id=challenger.version_id,
                hard_gate_passed=True,
                metrics={},
                failure_categories=(),
            ),
        ),
        (
            "active_pointer",
            champion.artifact_id,
            "active",
            ActivePointer(artifact_id=champion.artifact_id, current_version_id=challenger.version_id, generation=2),
        ),
    ):
        with pytest.raises(StateConflict, match="immutable|active pointer"):
            store.put_object(kind, object_id, None, status, value)

    assert store.get_object("artifact", champion.version_id, ArtifactVersion) == champion
    pointer = store.get_object("active_pointer", champion.artifact_id, ActivePointer)
    assert pointer.current_version_id == champion.version_id


def test_governance_bootstrap_rejects_partial_authority_state(tmp_path: Path) -> None:
    store = store_at(tmp_path / "state.db")
    champion = artifact("champion", ArtifactStatus.ACTIVE, "champion")
    proto = protocol()
    pointer = ActivePointer(artifact_id=champion.artifact_id, current_version_id=champion.version_id, generation=1)
    governance = governance_at(store)
    governance.bootstrap_repo_task(champion, proto, pointer)
    with store._connect() as connection:
        connection.execute(
            "DELETE FROM tw_objects WHERE kind = 'eval_protocol' AND object_id = ?", (proto.protocol_id,)
        )

    with pytest.raises(StateConflict, match="bootstrap"):
        governance.bootstrap_repo_task(champion, proto, pointer)
