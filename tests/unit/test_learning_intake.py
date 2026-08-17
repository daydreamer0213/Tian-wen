from __future__ import annotations

import json
import sqlite3
from datetime import timedelta
from pathlib import Path

import pytest

from tianwen.alpha import TrialManifest, TrialResult, TrialUsage
from tianwen.domain import (
    BudgetLimit,
    CaseRecord,
    EvidenceRecord,
    GoalContract,
    LoopKind,
    LoopRecord,
    content_digest,
    utc_now,
)
from tianwen.learning import LearningEngine, LearningSignal, LearningTicket
from tianwen.learning_intake import LearningIntake, ObservedGap, OutcomeObservation
from tianwen.memory import MemoryProposal
from tianwen.store import StateConflict, StateStore


def _new_store(path: Path) -> StateStore:
    store = StateStore(path)
    store.initialize()
    return store


def _intake(tmp_path: Path) -> tuple[LearningIntake, StateStore]:
    store, budget = _new_store(tmp_path / "governance.db"), BudgetLimit(model_requests=4, tool_calls=12, tokens=1200)
    goal = GoalContract(
        goal_id="goal-1",
        objective="safe",
        success_criteria=("done",),
        constraints=("bounded",),
        authorization=(),
        budget=budget,
    )
    loop = LoopRecord(loop_id="meta", goal_id=goal.goal_id, kind=LoopKind.META, objective="supervise", budget=budget)
    store.put_object("goal", goal.goal_id, None, "active", goal)
    store.put_object("loop", loop.loop_id, goal.goal_id, "active", loop)
    store.create_budget(loop.loop_id, None, budget)
    return LearningIntake(LearningEngine(store, BudgetLimit(model_requests=1, tool_calls=3, tokens=300))), store


def _manifest(trial_id: str, task_id: str, champion: str) -> TrialManifest:
    prompt, policy = {"round_id": "round-1", "public_check_ids": []}, {"round_id": "round-1", "public_check_ids": []}
    runtime = {
        "rounds": {
            "round-1": {
                "prompt": prompt,
                "policy": policy,
                "prompt_digest": content_digest(json.dumps(prompt, sort_keys=True)),
                "policy_digest": content_digest(policy),
            }
        }
    }
    tools = {
        "rounds": {
            "round-1": {
                "prompt_digest": content_digest(json.dumps(prompt, sort_keys=True)),
                "tool_contract": {},
                "tool_contract_digest": content_digest({}),
            }
        }
    }
    return TrialManifest(
        trial_id=trial_id,
        previous_trial_id=None,
        task_id=task_id,
        task_version="1",
        task_bundle_digest="sha256:bundle",
        model_input_digest="sha256:input",
        round_order_digest=content_digest(json.dumps(["round-1"])),
        goal_contract_digest="sha256:goal",
        confirmation_digest="sha256:confirmation",
        evidence_packet_digest="sha256:packet",
        model_id="model-1",
        model_settings_snapshot={},
        model_settings_digest=content_digest({}),
        provider_name="offline",
        provider_base_url="offline",
        provider_config_digest=content_digest(
            {"provider_name": "offline", "provider_base_url": "offline", "model_id": "model-1"}
        ),
        pydantic_ai_version="test",
        harness_version="test",
        champion_version_id=champion,
        champion_digest="sha256:champion",
        runtime_policy_snapshot=runtime,
        runtime_policy_digest=content_digest(runtime),
        tool_contract_snapshot=tools,
        tool_contract_digest=content_digest(tools),
        image_manifest_digest="sha256:image",
        image_platform_digest="sha256:platform",
        container_config_snapshot={},
        container_config_digest=content_digest({}),
        named_checks_snapshot={},
        named_checks_digest=content_digest({}),
        verifier_snapshot={},
        verifier_digest=content_digest({}),
        baseline_tree_digest="sha256:baseline",
        budget=BudgetLimit(model_requests=1, tool_calls=1, tokens=1),
        workspace_identity="opaque",
    )


def _source(
    tmp_path: Path,
    trial_id: str,
    *,
    task_id: str = "task-1",
    champion: str = "champion-1",
    user: bool = False,
    foreign_final: bool = False,
) -> tuple[StateStore, TrialResult, EvidenceRecord]:
    store, manifest = _new_store(tmp_path / f"{trial_id}.db"), _manifest(trial_id, task_id, champion)
    final = EvidenceRecord(
        evidence_id=f"e-final-{trial_id}",
        run_id=f"alpha:{trial_id}:settlement",
        action_id=f"action-{trial_id}",
        evidence_type="alpha_final_verification",
        result_class="not_met",
        effect_class="external_read_only",
        version_bucket="frozen",
        cost_bucket="controller",
        needed_user=False,
        safety_category="final_verifier",
        summary="verifier",
        payload_digest=f"sha256:{trial_id}",
        scope=f"trial:{trial_id}",
        purpose="alpha_final_verification",
        source_class="docker_verifier",
        sensitivity="internal",
        provenance_ids=(f"action-{trial_id}",),
    )
    feedback = EvidenceRecord(
        evidence_id=f"e-user-{trial_id}",
        run_id=f"alpha:{trial_id}:settlement",
        evidence_type="user_feedback",
        result_class="recorded",
        effect_class="none",
        version_bucket="frozen",
        cost_bucket="none",
        needed_user=True,
        safety_category="user",
        summary="feedback",
        payload_digest=f"sha256:user-{trial_id}",
        scope=f"trial:{trial_id}",
        purpose="user_feedback",
        source_class="user",
        sensitivity="internal",
        provenance_ids=(f"feedback-{trial_id}",),
    )
    foreign = final.model_copy(
        update={
            "evidence_id": f"e-final-foreign-{trial_id}",
            "run_id": "alpha:other-trial:settlement",
            "scope": "trial:other-trial",
        }
    )
    if foreign_final:
        evidence = (final, foreign, feedback) if user else (final, foreign)
    else:
        evidence = (final, feedback) if user else (final,)
    result = TrialResult(
        trial_id=trial_id,
        previous_trial_id=None,
        trial_manifest_digest=content_digest(manifest),
        goal_id="goal-1",
        run_ids=(f"run-{trial_id}",),
        exploration_run_ids=(),
        checkpoint_ids=(),
        task_id=task_id,
        task_version="1",
        model_id="model-1",
        champion_version_id=champion,
        champion_digest="sha256:champion",
        baseline_tree_digest="sha256:baseline",
        final_tree_digest="sha256:final",
        diff_digest="sha256:diff",
        verifier_digest=manifest.verifier_digest,
        verdict="not_met",
        failure_categories=("correctness",),
        execution_status="completed",
        verification_status="completed",
        boundary_status="passed",
        action_ids=(f"action-{trial_id}",),
        evidence_ids=tuple(item.evidence_id for item in evidence),
        usage=TrialUsage(model_requests=0, tokens=0, tool_calls=0, action_effects=0, wall_seconds=0),
        run_stop_reasons=(),
        workspace_path="C:/private/workspace",
        artifacts=(),
        qualifies_as_real_model_trial=False,
        started_at=utc_now(),
        finished_at=utc_now(),
    )
    store.put_immutable_object("alpha_trial_manifest", trial_id, "goal-1", "active", manifest)
    store.put_immutable_object("alpha_trial_result", trial_id, "goal-1", "finished", result)
    for item in evidence:
        store.put_immutable_object("evidence", item.evidence_id, item.run_id, "recorded", item)
    return store, result, feedback if user else final


def _object_count(store: StateStore, kind: str) -> int:
    with store._connect() as connection:
        return int(connection.execute("SELECT count(*) FROM tw_objects WHERE kind = ?", (kind,)).fetchone()[0])


def test_one_verified_failure_is_observed_without_learning_objects(tmp_path: Path) -> None:
    intake, store = _intake(tmp_path)
    source, result, _ = _source(tmp_path, "trial-1")
    assert intake.triage((intake.record_trial_outcome(result, trial_store=source),)).disposition == "observe"
    assert store.list_objects("learning_signal", LearningSignal) == []
    assert store.list_objects("learning_ticket", LearningTicket) == []


def test_two_independent_verified_failures_create_bound_gap_signal_ticket_case(tmp_path: Path) -> None:
    intake, store = _intake(tmp_path)
    first_store, first, _ = _source(tmp_path, "trial-1")
    second_store, second, _ = _source(tmp_path, "trial-2")
    outcomes = (
        intake.record_trial_outcome(first, trial_store=first_store),
        intake.record_trial_outcome(second, trial_store=second_store),
    )
    receipt = intake.triage(outcomes)
    gap = store.get_object("observed_gap", receipt.gap_id, ObservedGap)
    signal = store.get_object("learning_signal", receipt.signal_id, LearningSignal)
    ticket = store.get_object("learning_ticket", receipt.ticket_id, LearningTicket)
    case = store.get_object("case", receipt.case_id, CaseRecord)
    assert gap.recurrence == 2 and signal.source == "repeated_attributable_issue"
    assert (signal.observed_gap_id, signal.problem_fingerprint, signal.capability_scope) == (
        gap.gap_id,
        gap.problem_fingerprint,
        gap.capability_scope,
    )
    assert (ticket.problem_fingerprint, ticket.capability_scope, case.outcome, case.observed_gap_id) == (
        gap.problem_fingerprint,
        gap.capability_scope,
        f"gap:{gap.gap_id}",
        gap.gap_id,
    )
    assert receipt.candidate_version_id is None
    assert _object_count(store, "artifact") == _object_count(store, "active_pointer") == 0


def test_explicit_user_correction_qualifies_once(tmp_path: Path) -> None:
    intake, store = _intake(tmp_path)
    source, result, user = _source(tmp_path, "trial-1", user=True)
    outcome = intake.record_user_feedback(
        feedback_id="feedback-trial-1",
        feedback_digest="sha256:feedback",
        kind="explicit_user_correction",
        trial_id=result.trial_id,
        trial_store=source,
        evidence_ids=(user.evidence_id,),
    )
    receipt = intake.triage((outcome,))
    assert (
        receipt.disposition == "learning_case"
        and store.get_object("learning_signal", receipt.signal_id, LearningSignal).source == "explicit_user_correction"
    )


@pytest.mark.parametrize(
    ("kind", "source_id"),
    (
        ("runtime_failure", "stage-a:usage-invalid"),
        ("capability_discovery", "discovery"),
        ("model_self_assessment", "model"),
        ("ordinary_low_score", "score"),
    ),
)
def test_stage_a_usage_invalid_and_model_claims_never_become_signals(tmp_path: Path, kind: str, source_id: str) -> None:
    intake, store = _intake(tmp_path)
    outcome = intake.record_non_learning_outcome(
        source_id=source_id,
        source_digest=f"sha256:{source_id}",
        kind=kind,
        capability_scope="repo_task_skill/champion-1/task/task-1@1",
    )
    intake.triage((outcome,))
    assert (
        store.list_objects("learning_signal", LearningSignal) == []
        and store.list_objects("learning_ticket", LearningTicket) == []
    )


def test_one_off_choice_is_current_fix_only(tmp_path: Path) -> None:
    intake, store = _intake(tmp_path)
    source, result, user = _source(tmp_path, "trial-1", user=True)
    outcome = intake.record_user_feedback(
        feedback_id="feedback-trial-1",
        feedback_digest="sha256:feedback",
        kind="one_off_user_choice",
        trial_id=result.trial_id,
        trial_store=source,
        evidence_ids=(user.evidence_id,),
    )
    assert (
        intake.triage((outcome,)).disposition == "current_fix"
        and store.list_objects("learning_signal", LearningSignal) == []
    )


def test_persistent_preference_uses_scoped_memory_only(tmp_path: Path) -> None:
    intake, store = _intake(tmp_path)
    source, result, user = _source(tmp_path, "trial-1", user=True)
    outcome = intake.record_user_feedback(
        feedback_id="feedback-trial-1",
        feedback_digest="sha256:feedback",
        kind="persistent_user_preference",
        trial_id=result.trial_id,
        trial_store=source,
        evidence_ids=(user.evidence_id,),
    )
    proposal = MemoryProposal(
        user_scope="user:1",
        workspace_scope="workspace:1",
        purpose="user_preference",
        source_class="user",
        claim="Prefer concise answers.",
        provenance_ids=(outcome.source_id,),
        sensitivity="internal",
        retention_until=utc_now() + timedelta(days=1),
    )
    assert intake.triage((outcome,), preference=proposal).disposition == "preference_binding"
    with store._connect() as connection:
        assert connection.execute("SELECT count(*) FROM tw_memories").fetchone()[0] == 1
    assert store.list_objects("learning_signal", LearningSignal) == []


def test_mixed_scope_fingerprint_and_missing_evidence_fail_closed(tmp_path: Path) -> None:
    intake, store = _intake(tmp_path)
    source, result, _ = _source(tmp_path, "trial-1")
    outcome = intake.record_trial_outcome(result, trial_store=source)
    with pytest.raises(StateConflict):
        intake.triage((outcome, outcome.model_copy(update={"capability_scope": "other"})))
    with pytest.raises(StateConflict):
        intake.record_non_learning_outcome(
            source_id="x",
            source_digest="sha256:x",
            kind="runtime_failure",
            capability_scope="scope",
            evidence_ids=("missing",),
        )
    assert store.list_objects("learning_signal", LearningSignal) == []


def test_outcome_gap_and_triage_replay_exactly_and_exclude_raw_payloads(tmp_path: Path) -> None:
    intake, _store = _intake(tmp_path)
    source, result, _ = _source(tmp_path, "trial-1")
    outcome = intake.record_trial_outcome(result, trial_store=source)
    assert intake.record_trial_outcome(result, trial_store=source) == outcome
    assert "workspace_path" not in outcome.model_dump() and "C:/private/workspace" not in outcome.model_dump_json()
    assert intake.triage((outcome,)).outcome_ids == (outcome.outcome_id,)


@pytest.mark.parametrize("field", ("task_id", "champion_version_id", "model_id", "failure_categories"))
def test_trial_projection_rejects_forged_result_manifest_or_final_verifier_evidence_before_observation(
    tmp_path: Path, field: str
) -> None:
    intake, store = _intake(tmp_path)
    source, result, _ = _source(tmp_path, "trial-1")
    with pytest.raises(StateConflict):
        intake.record_trial_outcome(
            result.model_copy(update={field: "forged" if field != "failure_categories" else ()}), trial_store=source
        )
    assert store.list_objects("outcome_observation", OutcomeObservation) == []


def test_user_feedback_rejects_cross_trial_task_or_champion_binding_before_observation(tmp_path: Path) -> None:
    intake, store = _intake(tmp_path)
    first_store, _first, first_user = _source(tmp_path, "trial-1", user=True)
    second_store, second, _second_user = _source(
        tmp_path, "trial-2", task_id="task-2", champion="champion-2", user=True
    )
    with pytest.raises(StateConflict):
        intake.record_user_feedback(
            feedback_id="feedback-trial-1",
            feedback_digest="sha256:feedback",
            kind="explicit_user_correction",
            trial_id=second.trial_id,
            trial_store=second_store,
            evidence_ids=(first_user.evidence_id,),
        )
    assert store.list_objects("outcome_observation", OutcomeObservation) == []


def test_operational_verified_failure_receipts_never_qualify_for_learning(tmp_path: Path) -> None:
    """Break caught: operational receipts can masquerade as verifier failures."""
    intake, store = _intake(tmp_path)
    _source_store, _result, evidence = _source(tmp_path, "trial-1")
    store.put_immutable_object("evidence", evidence.evidence_id, evidence.run_id, "recorded", evidence)
    outcomes = tuple(
        OutcomeObservation(
            outcome_id=f"operational-{number}",
            source_kind="operational",
            source_id=f"operational-source-{number}",
            source_digest=f"sha256:operational-{number}",
            outcome_kind="verified_failure",
            capability_scope="repo_task_skill/champion-1/task/task-1@1",
            goal_id="goal-1",
            problem_fingerprint="sha256:shared-problem",
            evidence_ids=(evidence.evidence_id,),
        )
        for number in (1, 2)
    )
    for outcome in outcomes:
        store.put_immutable_object("outcome_observation", outcome.outcome_id, outcome.source_id, "recorded", outcome)

    with pytest.raises(StateConflict):
        intake.triage(outcomes)

    assert _object_count(store, "learning_signal") == _object_count(store, "learning_ticket") == 0
    assert _object_count(store, "case") == 0
    assert _object_count(store, "artifact") == _object_count(store, "active_pointer") == 0


def test_trial_projection_rejects_foreign_final_evidence_before_learning_objects(tmp_path: Path) -> None:
    """Break caught: a foreign final verifier receipt can be smuggled into one TrialResult."""
    intake, store = _intake(tmp_path)
    source, result, _ = _source(tmp_path, "trial-1", foreign_final=True)

    with pytest.raises(StateConflict):
        intake.record_trial_outcome(result, trial_store=source)

    assert _object_count(store, "outcome_observation") == _object_count(store, "observed_gap") == 0
    assert _object_count(store, "learning_signal") == _object_count(store, "learning_ticket") == 0
    assert _object_count(store, "case") == 0
    assert _object_count(store, "artifact") == _object_count(store, "active_pointer") == 0


def test_trial_projection_rejects_tampered_manifest_digest_before_observation(tmp_path: Path) -> None:
    """Break caught: a stored Manifest can change while the durable Result stays unchanged."""
    intake, store = _intake(tmp_path)
    source, result, _ = _source(tmp_path, "trial-1")
    manifest = source.get_object("alpha_trial_manifest", result.trial_id, TrialManifest)
    tampered = manifest.model_copy(update={"task_bundle_digest": "sha256:tampered"})
    with sqlite3.connect(source.database) as connection:
        connection.execute(
            "UPDATE tw_objects SET body_json = ? WHERE kind = ? AND object_id = ?",
            (tampered.model_dump_json(), "alpha_trial_manifest", result.trial_id),
        )

    with pytest.raises(StateConflict):
        intake.record_trial_outcome(result, trial_store=source)

    assert _object_count(store, "outcome_observation") == _object_count(store, "observed_gap") == 0
    assert _object_count(store, "learning_signal") == _object_count(store, "learning_ticket") == 0
    assert _object_count(store, "case") == 0
    assert _object_count(store, "artifact") == _object_count(store, "active_pointer") == 0


def test_legacy_create_case_preserves_its_original_id_and_replays_once(tmp_path: Path) -> None:
    """Break caught: governed Case fields change the legacy case identity."""
    intake, store = _intake(tmp_path)
    signal = LearningSignal(
        signal_id="legacy-signal",
        loop_id="meta",
        category="legacy",
        severity=1,
        recurrence=2,
        blocks_goal=False,
        user_corrected=False,
        evidence_ids=("legacy-evidence",),
    )
    ticket_id = intake.engine.enqueue(signal)
    assert ticket_id is not None

    first = intake.engine.create_case(ticket_id)
    second = intake.engine.create_case(ticket_id)

    assert first == second
    assert first.case_id == content_digest({"learning_ticket": ticket_id, "case": "observed"})
    assert _object_count(store, "case") == 1
