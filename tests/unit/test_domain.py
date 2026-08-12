import pytest

from tianwen.domain import (
    BudgetLimit,
    EvidenceRecord,
    ExplorationBrief,
    ExplorationStopReason,
    GoalContract,
    LoopKind,
    LoopRecord,
    RunManifest,
    RunRecord,
    RunStatus,
    UntrustedSourceExcerpt,
    content_digest,
)


def make_evidence(**overrides: object) -> EvidenceRecord:
    values: dict[str, object] = {
        "evidence_id": "evidence-1",
        "run_id": "run-1",
        "evidence_type": "observation",
        "result_class": "success",
        "effect_class": "read",
        "version_bucket": "current",
        "cost_bucket": "low",
        "needed_user": False,
        "safety_category": "safe",
        "summary": "Observed result",
        "payload_digest": "sha256:payload",
        "scope": "workspace",
        "purpose": "verification",
        "source_class": "source_code",
        "sensitivity": "internal",
        "provenance_ids": ("source-1",),
    }
    values.update(overrides)
    return EvidenceRecord(**values)


def test_goal_and_child_loop_keep_human_goal_identity() -> None:
    goal = GoalContract(
        goal_id="goal-1",
        objective="Improve the repository task workflow",
        success_criteria=("tests pass",),
        constraints=("stay inside workspace",),
        authorization=("workspace_read", "workspace_write"),
        budget=BudgetLimit(model_requests=10, tool_calls=30, tokens=50_000),
    )
    child = LoopRecord(
        loop_id="loop-child",
        goal_id=goal.goal_id,
        parent_loop_id="loop-parent",
        kind=LoopKind.CHILD,
        objective="Distinguish retrieval failure from skill failure",
        budget=BudgetLimit(model_requests=2, tool_calls=5, tokens=5_000),
    )
    assert child.goal_id == goal.goal_id
    assert child.parent_loop_id == "loop-parent"


def test_manifest_and_digest_are_stable() -> None:
    manifest = RunManifest(
        workflow_version="1",
        schema_version="1",
        pydantic_ai_version="2.18.0",
        harness_version="0.13.0",
        model_id="test",
        prompt_digest="p",
        skill_versions={"repo_task": "repo-task-v1"},
        skill_digests={"repo_task": "sha256:skill"},
        policy_digest="policy",
        tool_contract_digest="tools",
        goal_contract_digest="goal",
        workspace_digest="workspace",
    )
    run = RunRecord(
        run_id="run-1",
        task_id="task-1",
        status=RunStatus.QUEUED,
        manifest=manifest,
    )
    assert content_digest(run) == content_digest(run.model_dump(mode="json"))


def test_exploration_brief_is_finite_and_attached_to_a_task() -> None:
    brief = ExplorationBrief(
        brief_id="explore-1",
        task_id="task-1",
        question="Which parser version is currently supported?",
        decision_use="Choose the implementation API",
        known_evidence_ids=("e-local",),
        unknowns=("supported version",),
        allowed_local_roots=(".",),
        allowed_source_classes=("official_documentation", "source_code"),
        allowed_domains=("example.org",),
        max_searches=2,
        max_fetches=3,
        max_tokens=5_000,
        max_cost_microunits=100_000,
        wall_seconds=300,
        expected_outputs=("source-backed answer or explicit evidence gap",),
        sufficiency_criteria=("one current primary source",),
        stop_conditions=(ExplorationStopReason.SUFFICIENT,),
    )
    assert brief.task_id == "task-1"
    assert brief.max_searches == 2


def test_untrusted_excerpt_must_match_outer_evidence() -> None:
    with pytest.raises(ValueError):
        make_evidence(
            evidence_id="e1",
            provenance_ids=("source-1",),
            untrusted_excerpt=UntrustedSourceExcerpt(
                source_id="source-2",
                evidence_id="other-evidence",
                text="external data",
            ),
        )
