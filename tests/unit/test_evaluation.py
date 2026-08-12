from __future__ import annotations

import base64
import inspect
import os
import subprocess
import sys
from datetime import timedelta
from pathlib import Path

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from tianwen.domain import (
    ApprovalReceipt,
    ArtifactStatus,
    ArtifactVersion,
    EvalProtocol,
    EvalReceipt,
    EvalRun,
    utc_now,
)
from tianwen.evaluation import (
    ActivePointer,
    CaseOutcome,
    EvaluationError,
    Publisher,
    create_approval_receipt,
    create_promotion_request,
    import_eval_receipt,
    load_public_cases,
    receipt_canonical_bytes,
    run_public_comparison,
    write_eval_request,
)
from tianwen.store import StateConflict, StateStore


def store_at(path: Path) -> StateStore:
    store = StateStore(path)
    store.initialize()
    return store


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
        content_digest=f"sha256:{version_id}",
        content=content,
        evidence_ids=(),
        status=status,
    )


def persist_governed_artifacts(
    store: StateStore, champion: ArtifactVersion, challenger: ArtifactVersion, protocol_: EvalProtocol
) -> None:
    store.put_immutable_object("artifact", champion.version_id, None, champion.status.value, champion)
    store.put_immutable_object(
        "artifact", challenger.version_id, champion.version_id, challenger.status.value, challenger
    )
    store.put_immutable_object("eval_protocol", protocol_.protocol_id, None, "approved", protocol_)
    store.put_immutable_object(
        "active_pointer",
        champion.artifact_id,
        None,
        "active",
        ActivePointer(artifact_id=champion.artifact_id, current_version_id=champion.version_id, generation=1),
    )


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


def test_request_snapshots_are_fresh_readonly_and_cannot_escape_output_directory(tmp_path: Path) -> None:
    store = store_at(tmp_path / "state.db")
    champion = artifact("champion", ArtifactStatus.ACTIVE, "champion")
    challenger = artifact("challenger", ArtifactStatus.CANDIDATE, "challenger")
    request = write_eval_request(store, protocol(), champion, challenger, tmp_path / "inbox")
    again = write_eval_request(store, protocol(), champion, challenger, tmp_path / "inbox")
    request_dir = (tmp_path / "inbox" / request.request_id).resolve()
    assert request.challenge != again.challenge
    for path in (Path(request.champion_snapshot), Path(request.challenger_snapshot), Path(request.receipt_path)):
        assert path.resolve().is_relative_to(request_dir)
    assert not (Path(request.champion_snapshot).stat().st_mode & 0o222)
    assert Path(request.champion_snapshot).read_text() == champion.content


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
    assert completed.returncode != 0
    assert "TIANWEN_SEALED_DATASET_DIR" in completed.stderr
