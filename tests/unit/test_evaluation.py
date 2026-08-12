from __future__ import annotations

import base64
import inspect
import json
import math
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
    PromotionRequest,
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


def sealed_case(case_id: str = "sealed-case-1") -> dict[str, object]:
    return {
        "case_id": case_id,
        "hard_gates": ["correctness", "safety"],
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
    return {
        **os.environ,
        "TIANWEN_SEALED_DATASET_DIR": str(dataset),
        "TIANWEN_EVAL_PRIVATE_KEY": base64.b64encode(
            private_key.private_bytes_raw()
        ).decode("ascii"),
    }


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


def test_sealed_evaluator_accepts_only_the_frozen_production_bundle(tmp_path: Path) -> None:
    request = write_eval_request(
        store_at(tmp_path / "state.db"),
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


@pytest.mark.parametrize(
    "cases",
    (
        [],
        [{"case_id": "incomplete"}],
        [sealed_case(), sealed_case()],
        [
            sealed_case(
                "negative"
            )
            | {"challenger": sealed_case("negative")["challenger"] | {"tokens": -1}}
        ],
        [
            sealed_case(
                "nonfinite"
            )
            | {"challenger": sealed_case("nonfinite")["challenger"] | {"quality": math.inf}}
        ],
        [sealed_case("unknown") | {"hard_gates": ["not-a-gate"]}],
        [
            sealed_case(
                "unbound-failure"
            )
            | {
                "challenger": sealed_case("unbound-failure")["challenger"]
                | {"hard_gate_failures": ["not-a-gate"]}
            }
        ],
    ),
    ids=("empty", "incomplete", "duplicate", "negative", "nonfinite", "unknown_gate", "unbound_failure"),
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
    request = PromotionRequest(
        request_id="promotion-request",
        artifact_id="repo-task",
        subject_digest="sha256:challenger",
        eval_run_id="run-1",
        challenge="challenge-1",
        expires_at=utc_now() + timedelta(minutes=1),
    )
    store.persist_promotion_request(request)
    forged = ApprovalReceipt(
        receipt_id="forged-receipt",
        action="promote",
        subject_digest=request.subject_digest,
        eval_run_id="run-2",
        challenge=request.challenge,
        approved_by="alice",
    )

    with pytest.raises(StateConflict, match="bindings"):
        store.consume_promotion_request(request, forged)

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
        store.consume_promotion_request(stale_request, matching_stale_receipt)


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


def test_promotion_cas_failure_leaves_approval_and_promotion_unmodified(
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
    original_cas = store.promotion_cas

    def race_cas(*args: object) -> None:
        pointer = store.get_object("active_pointer", champion.artifact_id, ActivePointer)
        changed = pointer.model_copy(
            update={"current_version_id": challenger.version_id, "generation": pointer.generation + 1}
        )
        with store._connect() as connection:
            connection.execute(
                "UPDATE tw_objects SET body_json = ? WHERE kind = ? AND object_id = ?",
                (changed.model_dump_json(), "active_pointer", champion.artifact_id),
            )
        original_cas(*args)

    monkeypatch.setattr(store, "promotion_cas", race_cas)
    with pytest.raises(StateConflict, match="active pointer changed"):
        Publisher(store).promote(run, approval)

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


def test_active_pointer_immutable_seed_allows_only_exact_replay(tmp_path: Path) -> None:
    store = store_at(tmp_path / "state.db")
    seed = ActivePointer(artifact_id="repo-task", current_version_id="champion", generation=1)
    store.put_immutable_object("active_pointer", seed.artifact_id, None, "active", seed)
    store.put_immutable_object("active_pointer", seed.artifact_id, None, "active", seed)

    for parent_id, status, value in (
        ("other-parent", "active", seed),
        (None, "candidate", seed),
        (None, "active", seed.model_copy(update={"current_version_id": "challenger", "generation": 2})),
    ):
        with pytest.raises(StateConflict, match="immutable"):
            store.put_immutable_object("active_pointer", seed.artifact_id, parent_id, status, value)

    assert store.get_object("active_pointer", seed.artifact_id, ActivePointer) == seed
