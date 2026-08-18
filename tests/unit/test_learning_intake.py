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
    LessonRecord,
    LoopKind,
    LoopRecord,
    content_digest,
    utc_now,
)
from tianwen.learning import AttributionRecord, LearningEngine, LearningSignal, LearningTicket
from tianwen.learning_intake import (
    LearningConclusionReceipt,
    LearningIntake,
    LearningTriageReceipt,
    ObservedGap,
    OutcomeObservation,
)
from tianwen.memory import MemoryProposal
from tianwen.store import StateConflict, StateStore


def _new_store(path: Path) -> StateStore:
    store = StateStore(path)
    store.initialize()
    return store


def _intake(tmp_path: Path) -> tuple[LearningIntake, StateStore]:
    store, budget = _new_store(tmp_path / "governance.db"), BudgetLimit(
        model_requests=4, tool_calls=12, tokens=1200, wall_seconds=7200, child_loops=6, action_effects=40
    )
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
    verifier = {"verifier_id": "final", "digest": "sha256:verifier-spec"}
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
        verifier_snapshot=verifier,
        verifier_digest=content_digest(verifier),
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
    run_ids: tuple[str, ...] | None = None,
    exploration_run_ids: tuple[str, ...] | None = None,
    final_run_id: str | None = None,
    result_verifier_digest: str | None = None,
) -> tuple[StateStore, TrialResult, EvidenceRecord]:
    store, manifest = _new_store(tmp_path / f"{trial_id}.db"), _manifest(trial_id, task_id, champion)
    run_ids = (f"alpha:{trial_id}:round-1",) if run_ids is None else run_ids
    exploration_run_ids = () if exploration_run_ids is None else exploration_run_ids
    final_run_id = final_run_id or (
        run_ids[-1]
        if run_ids
        else exploration_run_ids[-1]
        if exploration_run_ids
        else f"alpha:{trial_id}:settlement"
    )
    final = EvidenceRecord(
        evidence_id=f"e-final-{trial_id}",
        run_id=final_run_id,
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
        run_ids=run_ids,
        exploration_run_ids=exploration_run_ids,
        checkpoint_ids=(),
        task_id=task_id,
        task_version="1",
        model_id="model-1",
        champion_version_id=champion,
        champion_digest="sha256:champion",
        baseline_tree_digest="sha256:baseline",
        final_tree_digest="sha256:final",
        diff_digest="sha256:diff",
        verifier_digest=result_verifier_digest or str(manifest.verifier_snapshot["digest"]),
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


def _governed_chain(tmp_path: Path, name: str = "primary") -> tuple[LearningIntake, StateStore, LearningTriageReceipt]:
    intake, store = _intake(tmp_path)
    first_store, first, _ = _source(tmp_path, f"{name}-trial-1")
    second_store, second, _ = _source(tmp_path, f"{name}-trial-2")
    return (
        intake,
        store,
        intake.triage(
            (
                intake.record_trial_outcome(first, trial_store=first_store),
                intake.record_trial_outcome(second, trial_store=second_store),
            )
        ),
    )


def _artifact_pointer_snapshot(store: StateStore) -> tuple[tuple[str, str, str | None, str, str], ...]:
    with store._connect() as connection:
        rows = connection.execute(
            "SELECT kind, object_id, parent_id, status, body_json FROM tw_objects "
            "WHERE kind IN ('artifact', 'active_pointer') ORDER BY kind, object_id"
        ).fetchall()
    return tuple((row["kind"], row["object_id"], row["parent_id"], row["status"], row["body_json"]) for row in rows)


def _attribution(
    intake: LearningIntake,
    store: StateStore,
    triage: LearningTriageReceipt,
    *,
    status: str = "resolved",
    mutation_target: str = "repo_task_skill",
    counterevidence_ids: tuple[str, ...] | None = None,
) -> AttributionRecord:
    gap = store.get_object("observed_gap", triage.gap_id, ObservedGap)
    case = store.get_object("case", triage.case_id, CaseRecord)
    evidence_ids = gap.evidence_ids
    return intake.engine.record_governed_attribution(
        case,
        hypotheses=("prompt ordering", "tool selection"),
        earliest_divergence="first verifier-visible action",
        mutation_target=mutation_target,
        rejected_targets=("runtime",),
        status=status,
        triage_id=triage.triage_id,
        ticket_id=triage.ticket_id,
        observed_gap_id=triage.gap_id,
        capability_scope=gap.capability_scope,
        supporting_evidence_ids=(evidence_ids[0],),
        counterevidence_ids=counterevidence_ids if counterevidence_ids is not None else (evidence_ids[1],),
    )


def _lesson(store: StateStore, triage: LearningTriageReceipt, *, capability_scope: str | None = None) -> LessonRecord:
    gap = store.get_object("observed_gap", triage.gap_id, ObservedGap)
    return LessonRecord(
        lesson_id=content_digest({"lesson": triage.case_id, "scope": capability_scope or gap.capability_scope}),
        case_ids=(triage.case_id,),
        claim="Use the verified ordering only in the observed task scope.",
        when=("the frozen verifier reports the same gap",),
        not_when=("the task or artifact scope differs",),
        evidence_ids=(gap.evidence_ids[0],),
        counterevidence_ids=(gap.evidence_ids[1],),
        confidence_basis="two persisted verifier outcomes",
        target_scope="repo_task_skill",
        capability_scope=capability_scope or gap.capability_scope,
        status="accepted",
    )


def test_unknown_attribution_stops_with_no_lesson_or_candidate(tmp_path: Path) -> None:
    intake, store, triage = _governed_chain(tmp_path)
    before = _artifact_pointer_snapshot(store)

    conclusion = intake.conclude(triage, _attribution(intake, store, triage, status="unknown"))

    assert (conclusion.outcome, conclusion.stop_reason, conclusion.lesson_id, conclusion.candidate_version_id) == (
        "no_lesson",
        "attribution_unknown",
        None,
        None,
    )
    assert store.list_objects("lesson", LessonRecord) == []
    assert _artifact_pointer_snapshot(store) == before


def test_out_of_scope_attribution_is_recommendation_only_and_stops(tmp_path: Path) -> None:
    intake, store, triage = _governed_chain(tmp_path)
    before = _artifact_pointer_snapshot(store)

    attribution = _attribution(intake, store, triage, mutation_target="runtime")
    conclusion = intake.conclude(triage, attribution)

    assert attribution.recommendation_only is True
    assert (conclusion.outcome, conclusion.stop_reason, conclusion.lesson_id, conclusion.candidate_version_id) == (
        "no_lesson",
        "causal_layer_out_of_scope",
        None,
        None,
    )
    assert store.list_objects("lesson", LessonRecord) == []
    assert _artifact_pointer_snapshot(store) == before


def test_resolved_chain_accepts_scope_bound_conditional_lesson(tmp_path: Path) -> None:
    intake, store, triage = _governed_chain(tmp_path)
    before = _artifact_pointer_snapshot(store)
    lesson = _lesson(store, triage)

    conclusion = intake.conclude(triage, _attribution(intake, store, triage), lesson=lesson)

    assert (conclusion.outcome, conclusion.lesson_id, conclusion.stop_reason, conclusion.candidate_version_id) == (
        "conditional_lesson",
        lesson.lesson_id,
        None,
        None,
    )
    assert store.get_object("lesson", lesson.lesson_id, LessonRecord) == lesson
    assert _artifact_pointer_snapshot(store) == before


def test_lesson_requires_persisted_chain_counterevidence_and_matching_scope(tmp_path: Path) -> None:
    intake, store, triage = _governed_chain(tmp_path)
    attribution = _attribution(intake, store, triage)
    missing_counterevidence = _lesson(store, triage).model_copy(update={"counterevidence_ids": ()})
    wrong_scope = _lesson(store, triage, capability_scope="repo_task_skill/other/task/task-2@1")
    before = _artifact_pointer_snapshot(store)

    insufficient = intake.conclude(triage, attribution)

    with pytest.raises(StateConflict):
        intake.conclude(triage, attribution, lesson=missing_counterevidence)
    with pytest.raises(StateConflict):
        intake.conclude(triage, attribution, lesson=wrong_scope)

    assert (insufficient.outcome, insufficient.stop_reason, insufficient.candidate_version_id) == (
        "no_lesson",
        "insufficient_evidence",
        None,
    )
    assert store.list_objects("lesson", LessonRecord) == []
    assert store.list_objects("learning_conclusion", LearningConclusionReceipt) == [insufficient]
    assert _artifact_pointer_snapshot(store) == before


def test_conclusion_replay_is_exact_and_candidate_is_always_none(tmp_path: Path) -> None:
    intake, store, triage = _governed_chain(tmp_path)
    attribution, lesson = _attribution(intake, store, triage), _lesson(store, triage)
    before = _artifact_pointer_snapshot(store)

    first = intake.conclude(triage, attribution, lesson=lesson)
    second = intake.conclude(triage, attribution, lesson=lesson)

    assert first == second
    assert store.get_object("learning_conclusion", first.conclusion_id, LearningConclusionReceipt) == first
    assert first.candidate_version_id is None
    assert _artifact_pointer_snapshot(store) == before


def test_conclude_rejects_persisted_case_with_cross_ticket_or_gap_binding(tmp_path: Path) -> None:
    intake, store, first = _governed_chain(tmp_path, "first")
    second_first_store, second_first, _ = _source(tmp_path, "second-trial-1")
    second_second_store, second_second, _ = _source(tmp_path, "second-trial-2")
    second = intake.triage(
        (
            intake.record_trial_outcome(second_first, trial_store=second_first_store),
            intake.record_trial_outcome(second_second, trial_store=second_second_store),
        )
    )
    second_case = store.get_object("case", second.case_id, CaseRecord)
    cross_case = second_case.model_copy(update={"case_id": "cross-ticket-case", "ticket_id": first.ticket_id})
    store.put_immutable_object("case", cross_case.case_id, first.ticket_id, "recorded", cross_case)
    cross_triage = LearningTriageReceipt(
        triage_id="cross-ticket-triage",
        gap_id=second.gap_id,
        outcome_ids=second.outcome_ids,
        disposition="learning_case",
        reason="schema-valid cross ticket receipt",
        signal_id=second.signal_id,
        ticket_id=second.ticket_id,
        case_id=cross_case.case_id,
    )
    store.put_immutable_object("learning_triage", cross_triage.triage_id, cross_triage.gap_id, "recorded", cross_triage)
    cross_attribution = AttributionRecord(
        attribution_id="cross-ticket-attribution",
        case_id=cross_case.case_id,
        observed_outcome=cross_case.outcome,
        reproduction_scope="persisted schema-valid cross ticket case",
        earliest_divergence="first verifier-visible action",
        hypotheses=("prompt ordering", "tool selection"),
        distinguishing_experiment="bounded comparison",
        mutation_target="repo_task_skill",
        rejected_targets=("runtime",),
        other_layers_reason="first slice",
        recommendation_only=False,
        status="resolved",
        ticket_id=second.ticket_id,
        observed_gap_id=second.gap_id,
        capability_scope=second_case.capability_scope,
        supporting_evidence_ids=(second_case.evidence_ids[0],),
        counterevidence_ids=(second_case.evidence_ids[1],),
    )
    store.put_immutable_object(
        "attribution", cross_attribution.attribution_id, cross_case.case_id, "recorded", cross_attribution
    )
    before = _artifact_pointer_snapshot(store)

    with pytest.raises(StateConflict):
        intake.conclude(cross_triage, cross_attribution, lesson=_lesson(store, second))

    assert store.list_objects("lesson", LessonRecord) == []
    assert store.list_objects("learning_conclusion", LearningConclusionReceipt) == []
    assert _artifact_pointer_snapshot(store) == before


def test_conclude_rejects_persisted_triage_with_missing_or_foreign_gap_outcome_binding(tmp_path: Path) -> None:
    intake, store, triage = _governed_chain(tmp_path, "primary")
    gap = store.get_object("observed_gap", triage.gap_id, ObservedGap)
    foreign_store, foreign_result, _ = _source(tmp_path, "foreign-trial")
    foreign_outcome = intake.record_trial_outcome(foreign_result, trial_store=foreign_store)
    valid_attribution = _attribution(intake, store, triage)
    lesson = _lesson(store, triage)
    before = _artifact_pointer_snapshot(store)

    for suffix, outcome_ids in (
        ("missing", (gap.outcome_ids[0], "missing-outcome")),
        ("foreign", (gap.outcome_ids[0], foreign_outcome.outcome_id)),
    ):
        forged_triage = LearningTriageReceipt(
            triage_id=f"forged-triage-{suffix}",
            gap_id=triage.gap_id,
            outcome_ids=outcome_ids,
            disposition="learning_case",
            reason="schema-valid but outcome-mismatched receipt",
            signal_id=triage.signal_id,
            ticket_id=triage.ticket_id,
            case_id=triage.case_id,
        )
        store.put_immutable_object(
            "learning_triage", forged_triage.triage_id, forged_triage.gap_id, "recorded", forged_triage
        )
        forged_attribution = valid_attribution.model_copy(
            update={
                "attribution_id": f"forged-attribution-{suffix}",
                "triage_id": forged_triage.triage_id,
            }
        )
        store.put_immutable_object(
            "attribution", forged_attribution.attribution_id, forged_attribution.case_id, "recorded", forged_attribution
        )

        with pytest.raises(StateConflict):
            intake.conclude(forged_triage, forged_attribution, lesson=lesson)

    assert store.list_objects("lesson", LessonRecord) == []
    assert store.list_objects("learning_conclusion", LearningConclusionReceipt) == []
    assert _artifact_pointer_snapshot(store) == before


def test_governed_attribution_rejects_missing_or_out_of_gap_evidence_before_persistence(tmp_path: Path) -> None:
    intake, store, triage = _governed_chain(tmp_path)
    gap = store.get_object("observed_gap", triage.gap_id, ObservedGap)
    case = store.get_object("case", triage.case_id, CaseRecord)
    foreign_store, _foreign_result, foreign_evidence = _source(tmp_path, "foreign-evidence")
    store.put_immutable_object(
        "evidence", foreign_evidence.evidence_id, foreign_evidence.run_id, "recorded", foreign_evidence
    )
    before = _object_count(store, "attribution")
    common = {
        "hypotheses": ("prompt ordering", "tool selection"),
        "earliest_divergence": "first verifier-visible action",
        "mutation_target": "repo_task_skill",
        "rejected_targets": ("runtime",),
        "status": "resolved",
        "triage_id": triage.triage_id,
        "ticket_id": triage.ticket_id,
        "observed_gap_id": triage.gap_id,
        "capability_scope": gap.capability_scope,
        "counterevidence_ids": (gap.evidence_ids[1],),
    }

    with pytest.raises(StateConflict):
        intake.engine.record_governed_attribution(
            case, supporting_evidence_ids=("missing-evidence",), **common
        )
    with pytest.raises(StateConflict):
        intake.engine.record_governed_attribution(
            case, supporting_evidence_ids=(foreign_evidence.evidence_id,), **common
        )

    assert _object_count(store, "attribution") == before


def test_governed_attribution_rejects_triage_with_missing_or_foreign_signal_before_persistence(
    tmp_path: Path,
) -> None:
    intake, store, triage = _governed_chain(tmp_path, "primary")
    second_first_store, second_first, _ = _source(tmp_path, "secondary-trial-1")
    second_second_store, second_second, _ = _source(tmp_path, "secondary-trial-2")
    secondary = intake.triage(
        (
            intake.record_trial_outcome(second_first, trial_store=second_first_store),
            intake.record_trial_outcome(second_second, trial_store=second_second_store),
        )
    )
    gap = store.get_object("observed_gap", triage.gap_id, ObservedGap)
    case = store.get_object("case", triage.case_id, CaseRecord)
    before = _object_count(store, "attribution")
    common = {
        "hypotheses": ("prompt ordering", "tool selection"),
        "earliest_divergence": "first verifier-visible action",
        "mutation_target": "repo_task_skill",
        "rejected_targets": ("runtime",),
        "status": "resolved",
        "ticket_id": triage.ticket_id,
        "observed_gap_id": triage.gap_id,
        "capability_scope": gap.capability_scope,
        "supporting_evidence_ids": (gap.evidence_ids[0],),
        "counterevidence_ids": (gap.evidence_ids[1],),
    }

    for suffix, signal_id in (("missing", "missing-signal"), ("foreign", secondary.signal_id)):
        forged_triage = triage.model_copy(
            update={"triage_id": f"signal-forged-triage-{suffix}", "signal_id": signal_id}
        )
        store.put_immutable_object(
            "learning_triage", forged_triage.triage_id, forged_triage.gap_id, "recorded", forged_triage
        )

        with pytest.raises(StateConflict):
            intake.engine.record_governed_attribution(case, triage_id=forged_triage.triage_id, **common)

    assert _object_count(store, "attribution") == before


def test_governed_attribution_rejects_ticket_case_and_caller_scope_outside_gap_before_persistence(
    tmp_path: Path,
) -> None:
    intake, store, triage = _governed_chain(tmp_path)
    gap = store.get_object("observed_gap", triage.gap_id, ObservedGap)
    ticket = store.get_object("learning_ticket", triage.ticket_id, LearningTicket)
    case = store.get_object("case", triage.case_id, CaseRecord)
    other_scope = "repo_task_skill/other/task/task-2@1"
    forged_ticket = ticket.model_copy(update={"ticket_id": "scope-forged-ticket", "capability_scope": other_scope})
    forged_case = case.model_copy(
        update={"case_id": "scope-forged-case", "ticket_id": forged_ticket.ticket_id, "capability_scope": other_scope}
    )
    forged_triage = triage.model_copy(
        update={
            "triage_id": "scope-forged-triage",
            "ticket_id": forged_ticket.ticket_id,
            "case_id": forged_case.case_id,
        }
    )
    store.put_immutable_object(
        "learning_ticket", forged_ticket.ticket_id, forged_ticket.parent_loop_id, "recorded", forged_ticket
    )
    store.put_immutable_object("case", forged_case.case_id, forged_ticket.ticket_id, "recorded", forged_case)
    store.put_immutable_object(
        "learning_triage", forged_triage.triage_id, forged_triage.gap_id, "recorded", forged_triage
    )
    before = _object_count(store, "attribution")

    with pytest.raises(StateConflict):
        intake.engine.record_governed_attribution(
            forged_case,
            hypotheses=("prompt ordering", "tool selection"),
            earliest_divergence="first verifier-visible action",
            mutation_target="repo_task_skill",
            rejected_targets=("runtime",),
            status="resolved",
            triage_id=forged_triage.triage_id,
            ticket_id=forged_ticket.ticket_id,
            observed_gap_id=gap.gap_id,
            capability_scope=other_scope,
            supporting_evidence_ids=(gap.evidence_ids[0],),
            counterevidence_ids=(gap.evidence_ids[1],),
        )

    assert _object_count(store, "attribution") == before


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


def test_trial_projection_binds_result_to_final_verifier_spec_digest(tmp_path: Path) -> None:
    """Break caught: the Result verifier spec digest is compared with the Manifest snapshot digest."""
    intake, store = _intake(tmp_path)
    source, result, _ = _source(tmp_path, "trial-valid")

    assert result.verifier_digest != source.get_object(
        "alpha_trial_manifest", result.trial_id, TrialManifest
    ).verifier_digest
    assert intake.record_trial_outcome(result, trial_store=source).trial_id == result.trial_id

    invalid_source, invalid, _ = _source(
        tmp_path, "trial-invalid", result_verifier_digest="sha256:wrong-verifier-spec"
    )
    with pytest.raises(StateConflict):
        intake.record_trial_outcome(invalid, trial_store=invalid_source)

    assert len(store.list_objects("outcome_observation", OutcomeObservation)) == 1


@pytest.mark.parametrize(
    ("run_ids", "exploration_run_ids", "expected_suffix"),
    (
        (("alpha:{trial_id}:round-1",), (), "round-1"),
        ((), ("alpha:{trial_id}:exploration-1",), "exploration-1"),
        ((), (), "settlement"),
    ),
)
def test_trial_projection_requires_final_evidence_on_alpha_selected_run(
    tmp_path: Path,
    run_ids: tuple[str, ...],
    exploration_run_ids: tuple[str, ...],
    expected_suffix: str,
) -> None:
    """Break caught: final evidence is accepted on an arbitrary run instead of Alpha's selected run."""
    intake, store = _intake(tmp_path)
    trial_id = f"trial-{expected_suffix}"
    concrete_runs = tuple(item.format(trial_id=trial_id) for item in run_ids)
    concrete_exploration = tuple(item.format(trial_id=trial_id) for item in exploration_run_ids)
    source, result, _ = _source(
        tmp_path,
        trial_id,
        run_ids=concrete_runs,
        exploration_run_ids=concrete_exploration,
    )

    assert intake.record_trial_outcome(result, trial_store=source).trial_id == trial_id

    wrong_source, wrong, _ = _source(
        tmp_path,
        f"{trial_id}-wrong",
        run_ids=tuple(item.replace(trial_id, f"{trial_id}-wrong") for item in concrete_runs),
        exploration_run_ids=tuple(
            item.replace(trial_id, f"{trial_id}-wrong") for item in concrete_exploration
        ),
        final_run_id=f"alpha:{trial_id}-wrong:foreign",
    )
    with pytest.raises(StateConflict):
        intake.record_trial_outcome(wrong, trial_store=wrong_source)

    assert len(store.list_objects("outcome_observation", OutcomeObservation)) == 1


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


def test_manual_trial_verifier_observations_without_source_authority_never_learn(tmp_path: Path) -> None:
    """Break caught: callers can bypass Trial projector validation with direct immutable writes."""
    intake, store = _intake(tmp_path)
    _source_store, _result, evidence = _source(tmp_path, "trial-1")
    store.put_immutable_object("evidence", evidence.evidence_id, evidence.run_id, "recorded", evidence)
    outcomes = tuple(
        OutcomeObservation(
            outcome_id=f"manual-trial-{number}",
            source_kind="trial_verifier",
            source_id=f"manual-source-{number}",
            source_digest=f"sha256:manual-{number}",
            outcome_kind="verified_failure",
            capability_scope="repo_task_skill/champion-1/task/task-1@1",
            goal_id="goal-1",
            run_id=f"manual-run-{number}",
            trial_id=f"manual-trial-{number}",
            problem_fingerprint="sha256:manual-problem",
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


def test_manual_user_feedback_without_source_authority_never_learns(tmp_path: Path) -> None:
    """Break caught: direct user-feedback observations can bypass feedback projector evidence checks."""
    intake, store = _intake(tmp_path)
    _source_store, _result, evidence = _source(tmp_path, "trial-1")
    store.put_immutable_object("evidence", evidence.evidence_id, evidence.run_id, "recorded", evidence)
    outcome = OutcomeObservation(
        outcome_id="manual-feedback",
        source_kind="user_feedback",
        source_id="manual-feedback-source",
        source_digest="sha256:manual-feedback",
        outcome_kind="explicit_user_correction",
        capability_scope="repo_task_skill/champion-1/task/task-1@1",
        goal_id="goal-1",
        trial_id="manual-trial",
        problem_fingerprint="sha256:manual-feedback-problem",
        evidence_ids=(evidence.evidence_id,),
    )
    store.put_immutable_object("outcome_observation", outcome.outcome_id, outcome.source_id, "recorded", outcome)

    with pytest.raises(StateConflict):
        intake.triage((outcome,))

    assert _object_count(store, "learning_signal") == _object_count(store, "learning_ticket") == 0
    assert _object_count(store, "case") == 0
    assert _object_count(store, "artifact") == _object_count(store, "active_pointer") == 0
