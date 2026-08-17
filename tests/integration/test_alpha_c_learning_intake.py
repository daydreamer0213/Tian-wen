from __future__ import annotations

import json
from datetime import timedelta
from pathlib import Path

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
    OutcomeSourceAuthority,
)
from tianwen.memory import MemoryNeed, MemoryProposal, MemoryStore
from tianwen.store import StateStore


def _store(path: Path) -> StateStore:
    store = StateStore(path)
    store.initialize()
    return store


def _intake(tmp_path: Path) -> tuple[LearningIntake, StateStore]:
    store = _store(tmp_path / "governance.db")
    budget = BudgetLimit(
        model_requests=4, tool_calls=12, tokens=1200, wall_seconds=7200, child_loops=6, action_effects=40
    )
    goal = GoalContract(
        goal_id="goal-integration",
        objective="offline governed learning",
        success_criteria=("durable",),
        constraints=("no candidate",),
        authorization=(),
        budget=budget,
    )
    loop = LoopRecord(
        loop_id="meta-integration", goal_id=goal.goal_id, kind=LoopKind.META, objective="supervise", budget=budget
    )
    store.put_object("goal", goal.goal_id, None, "active", goal)
    store.put_object("loop", loop.loop_id, goal.goal_id, "active", loop)
    store.create_budget(loop.loop_id, None, budget)
    return LearningIntake(LearningEngine(store, BudgetLimit(model_requests=1, tool_calls=3, tokens=300))), store


def _manifest(trial_id: str) -> TrialManifest:
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
        task_id="offline-task",
        task_version="1",
        task_bundle_digest="sha256:bundle",
        model_input_digest="sha256:input",
        round_order_digest=content_digest(json.dumps(["round-1"])),
        goal_contract_digest="sha256:goal",
        confirmation_digest="sha256:confirmation",
        evidence_packet_digest="sha256:packet",
        model_id="offline-model",
        model_settings_snapshot={},
        model_settings_digest=content_digest({}),
        provider_name="offline",
        provider_base_url="offline",
        provider_config_digest=content_digest(
            {"provider_name": "offline", "provider_base_url": "offline", "model_id": "offline-model"}
        ),
        pydantic_ai_version="test",
        harness_version="test",
        champion_version_id="champion-offline",
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
        workspace_identity="opaque-workspace",
    )


def _failed_trial(
    tmp_path: Path, trial_id: str, *, user_feedback: bool = False
) -> tuple[StateStore, TrialResult, EvidenceRecord | None]:
    store, manifest = _store(tmp_path / f"{trial_id}.db"), _manifest(trial_id)
    run_id = f"alpha:{trial_id}:settlement"
    final = EvidenceRecord(
        evidence_id=f"final-{trial_id}",
        run_id=run_id,
        action_id=f"action-{trial_id}",
        evidence_type="alpha_final_verification",
        result_class="not_met",
        effect_class="external_read_only",
        version_bucket="frozen",
        cost_bucket="controller",
        needed_user=False,
        safety_category="final_verifier",
        summary="offline verifier failure",
        payload_digest=f"sha256:final-{trial_id}",
        scope=f"trial:{trial_id}",
        purpose="alpha_final_verification",
        source_class="docker_verifier",
        sensitivity="internal",
        provenance_ids=(f"action-{trial_id}",),
    )
    feedback = EvidenceRecord(
        evidence_id=f"feedback-{trial_id}",
        run_id=run_id,
        evidence_type="user_feedback",
        result_class="recorded",
        effect_class="none",
        version_bucket="frozen",
        cost_bucket="none",
        needed_user=True,
        safety_category="user",
        summary="structured feedback receipt",
        payload_digest=f"sha256:feedback-{trial_id}",
        scope=f"trial:{trial_id}",
        purpose="user_feedback",
        source_class="user",
        sensitivity="internal",
        provenance_ids=(f"feedback-id-{trial_id}",),
    )
    evidence = (final, feedback) if user_feedback else (final,)
    result = TrialResult(
        trial_id=trial_id,
        previous_trial_id=None,
        trial_manifest_digest=content_digest(manifest),
        goal_id="goal-integration",
        run_ids=(f"run-{trial_id}",),
        exploration_run_ids=(),
        checkpoint_ids=(),
        task_id=manifest.task_id,
        task_version=manifest.task_version,
        model_id=manifest.model_id,
        champion_version_id=manifest.champion_version_id,
        champion_digest=manifest.champion_digest,
        baseline_tree_digest=manifest.baseline_tree_digest,
        final_tree_digest=f"sha256:final-tree-{trial_id}",
        diff_digest=f"sha256:diff-{trial_id}",
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
        workspace_path="C:/not-persisted",
        artifacts=(),
        qualifies_as_real_model_trial=False,
        started_at=utc_now(),
        finished_at=utc_now(),
    )
    store.put_immutable_object("alpha_trial_manifest", trial_id, result.goal_id, "active", manifest)
    store.put_immutable_object("alpha_trial_result", trial_id, result.goal_id, "finished", result)
    for item in evidence:
        store.put_immutable_object("evidence", item.evidence_id, item.run_id, "recorded", item)
    return store, result, feedback if user_feedback else None


def _artifact_pointer_rows(store: StateStore) -> tuple[tuple[str, str, str | None, str, str], ...]:
    with store._connect() as connection:
        rows = connection.execute(
            "SELECT kind, object_id, parent_id, status, body_json FROM tw_objects "
            "WHERE kind IN ('artifact', 'active_pointer') ORDER BY kind, object_id"
        ).fetchall()
    return tuple((row["kind"], row["object_id"], row["parent_id"], row["status"], row["body_json"]) for row in rows)


def _count(store: StateStore, kind: str) -> int:
    with store._connect() as connection:
        return int(connection.execute("SELECT count(*) FROM tw_objects WHERE kind = ?", (kind,)).fetchone()[0])


def _attribution(
    intake: LearningIntake, store: StateStore, triage: LearningTriageReceipt, *, status: str
) -> AttributionRecord:
    gap = store.get_object("observed_gap", triage.gap_id, ObservedGap)
    case = store.get_object("case", triage.case_id, CaseRecord)
    return intake.engine.record_governed_attribution(
        case,
        hypotheses=("prompt ordering", "tool selection"),
        earliest_divergence="first verifier-visible action",
        mutation_target="repo_task_skill",
        rejected_targets=("runtime",),
        status=status,  # type: ignore[arg-type]
        triage_id=triage.triage_id,
        ticket_id=triage.ticket_id,
        observed_gap_id=gap.gap_id,
        capability_scope=gap.capability_scope,
        supporting_evidence_ids=(gap.evidence_ids[0],),
        counterevidence_ids=(gap.evidence_ids[1],),
    )


def test_repeated_real_failures_reach_conditional_lesson_without_candidate(tmp_path: Path) -> None:
    intake, store = _intake(tmp_path)
    baseline = _artifact_pointer_rows(store)
    first_store, first, _ = _failed_trial(tmp_path, "trial-a")
    second_store, second, _ = _failed_trial(tmp_path, "trial-b")

    first_outcome = intake.record_trial_outcome(first, trial_store=first_store)
    second_outcome = intake.record_trial_outcome(second, trial_store=second_store)
    assert first_outcome.problem_fingerprint == second_outcome.problem_fingerprint
    assert first_outcome.capability_scope == second_outcome.capability_scope
    for outcome in (first_outcome, second_outcome):
        assert store.get_object("outcome_observation", outcome.outcome_id, OutcomeObservation) == outcome
        authority = store.get_object("outcome_source_authority", outcome.authority_id, OutcomeSourceAuthority)
        assert authority.source_id == outcome.source_id
        assert authority.evidence_ids == outcome.evidence_ids

    triage = intake.triage((first_outcome, second_outcome))
    gap = store.get_object("observed_gap", triage.gap_id, ObservedGap)
    signal = store.get_object("learning_signal", triage.signal_id, LearningSignal)
    ticket = store.get_object("learning_ticket", triage.ticket_id, LearningTicket)
    case = store.get_object("case", triage.case_id, CaseRecord)
    assert store.get_object("learning_triage", triage.triage_id, LearningTriageReceipt) == triage
    assert gap.recurrence == 2
    assert set(gap.outcome_ids) == {first_outcome.outcome_id, second_outcome.outcome_id}
    assert signal.source == "repeated_attributable_issue"
    assert (signal.observed_gap_id, ticket.signal_id, case.ticket_id, case.observed_gap_id) == (
        gap.gap_id,
        signal.signal_id,
        ticket.ticket_id,
        gap.gap_id,
    )
    assert triage.candidate_version_id is None

    unknown = _attribution(intake, store, triage, status="unknown")
    stopped = intake.conclude(triage, unknown)
    assert stopped.outcome == "no_lesson"
    assert stopped.stop_reason == "attribution_unknown"

    resolved = _attribution(intake, store, triage, status="resolved")
    lesson = LessonRecord(
        lesson_id=content_digest({"lesson": case.case_id}),
        case_ids=(case.case_id,),
        claim="Apply the verified ordering within this exact task capability scope.",
        when=("the same frozen verifier gap recurs",),
        not_when=("a different task or artifact scope applies",),
        evidence_ids=(gap.evidence_ids[0],),
        counterevidence_ids=(gap.evidence_ids[1],),
        confidence_basis="two independent durable verifier receipts",
        target_scope="repo_task_skill",
        capability_scope=gap.capability_scope,
        status="accepted",
    )
    concluded = intake.conclude(triage, resolved, lesson=lesson)
    assert concluded.outcome == "conditional_lesson"
    assert store.get_object("attribution", resolved.attribution_id, AttributionRecord) == resolved
    assert store.get_object("lesson", lesson.lesson_id, LessonRecord) == lesson
    assert store.get_object("learning_conclusion", concluded.conclusion_id, LearningConclusionReceipt) == concluded
    assert all(receipt.candidate_version_id is None for receipt in (triage, stopped, concluded))
    assert _artifact_pointer_rows(store) == baseline
    assert _count(store, "artifact") == 0


def test_insufficient_and_non_learning_inputs_finish_without_candidate(tmp_path: Path) -> None:
    intake, store = _intake(tmp_path)
    baseline = _artifact_pointer_rows(store)
    trial_store, result, _ = _failed_trial(tmp_path, "single-failure")
    insufficient = intake.triage((intake.record_trial_outcome(result, trial_store=trial_store),))
    usage_invalid = intake.triage(
        (
            intake.record_non_learning_outcome(
                source_id="stage-a:usage-invalid",
                source_digest="sha256:usage-invalid",
                kind="runtime_failure",
                capability_scope="repo_task_skill/champion-offline/task/offline-task@1",
            ),
        )
    )
    model_claim = intake.triage(
        (
            intake.record_non_learning_outcome(
                source_id="model-self-assessment-1",
                source_digest="sha256:model-self-assessment",
                kind="model_self_assessment",
                capability_scope="repo_task_skill/champion-offline/task/offline-task@1",
            ),
        )
    )

    assert (insufficient.disposition, usage_invalid.disposition, model_claim.disposition) == (
        "observe",
        "current_fix",
        "observe",
    )
    assert all(receipt.candidate_version_id is None for receipt in (insufficient, usage_invalid, model_claim))
    assert _count(store, "learning_signal") == 0
    assert _count(store, "learning_ticket") == 0
    assert _count(store, "case") == 0
    assert _count(store, "lesson") == 0
    assert _count(store, "learning_conclusion") == 0
    assert _artifact_pointer_rows(store) == baseline
    assert _count(store, "artifact") == 0


def test_user_correction_and_scoped_preference_take_separate_governed_paths(tmp_path: Path) -> None:
    intake, store = _intake(tmp_path)
    baseline = _artifact_pointer_rows(store)
    correction_store, _correction_result, correction_evidence = _failed_trial(
        tmp_path, "correction", user_feedback=True
    )
    correction = intake.record_user_feedback(
        feedback_id="feedback-id-correction",
        feedback_digest="sha256:explicit-correction",
        kind="explicit_user_correction",
        trial_id="correction",
        trial_store=correction_store,
        evidence_ids=(correction_evidence.evidence_id,),
    )
    correction_triage = intake.triage((correction,))
    correction_signal = store.get_object("learning_signal", correction_triage.signal_id, LearningSignal)
    assert correction_triage.disposition == "learning_case"
    assert correction_signal.source == "explicit_user_correction"
    assert correction_triage.candidate_version_id is None

    preference_store, _preference_result, preference_evidence = _failed_trial(
        tmp_path, "preference", user_feedback=True
    )
    preference = intake.record_user_feedback(
        feedback_id="feedback-id-preference",
        feedback_digest="sha256:persistent-preference",
        kind="persistent_user_preference",
        trial_id="preference",
        trial_store=preference_store,
        evidence_ids=(preference_evidence.evidence_id,),
    )
    proposal = MemoryProposal(
        user_scope="user-42",
        workspace_scope="workspace-alpha",
        purpose="user_preference",
        source_class="user",
        claim="Prefer concise outcome summaries for this workspace.",
        conditions={"surface": "learning-intake"},
        provenance_ids=("feedback-id-preference",),
        sensitivity="internal",
        retention_until=utc_now() + timedelta(days=7),
    )
    preference_triage = intake.triage((preference,), preference=proposal)
    assert preference_triage.disposition == "preference_binding"
    assert preference_triage.memory_id is not None
    assert preference_triage.candidate_version_id is None

    memory = MemoryStore(store)
    exact = memory.search(
        MemoryNeed(
            user_scope="user-42",
            workspace_scope="workspace-alpha",
            purpose="user_preference",
            query="",
            conditions={"surface": "learning-intake"},
        )
    )
    assert tuple(item.memory_id for item in exact.items) == (preference_triage.memory_id,)
    for wrong_scope in (
        MemoryNeed(
            user_scope="user-43",
            workspace_scope="workspace-alpha",
            purpose="user_preference",
            query="",
            conditions={"surface": "learning-intake"},
        ),
        MemoryNeed(
            user_scope="user-42",
            workspace_scope="workspace-beta",
            purpose="user_preference",
            query="",
            conditions={"surface": "learning-intake"},
        ),
        MemoryNeed(
            user_scope="user-42",
            workspace_scope="workspace-alpha",
            purpose="other_purpose",
            query="",
            conditions={"surface": "learning-intake"},
        ),
    ):
        assert not memory.search(wrong_scope).items

    assert _count(store, "learning_signal") == 1
    assert _count(store, "learning_ticket") == 1
    assert _count(store, "case") == 1
    assert _count(store, "lesson") == 0
    assert _artifact_pointer_rows(store) == baseline
    assert _count(store, "artifact") == 0
