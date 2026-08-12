from __future__ import annotations

# ruff: noqa: E501
from pathlib import Path

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
    SourceRecord,
    TaskKind,
    TaskRecord,
    content_digest,
)
from tianwen.exploration import (
    ExplorationAuthorizationError,
    ExplorationBudgetExceeded,
    ExplorationEngine,
    ExplorationScopeError,
    recorded_fetch_tool,
    recorded_search_tool,
)
from tianwen.store import StateStore

FIXTURES = Path(__file__).parents[1] / "fixtures" / "exploration"
FETCHED_PAGE = FIXTURES / "fetched_page.md"


def make_engine_and_brief(
    tmp_path: Path, *, max_searches: int = 2, goal_authorization: tuple[str, ...] = ("workspace_read", "external_read")
) -> tuple[ExplorationEngine, ExplorationBrief]:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    (workspace / "README.md").write_text("parser_version = 1\n", encoding="utf-8")
    store = StateStore(tmp_path / "state.db")
    store.initialize()
    goal = GoalContract(
        goal_id="goal-original",
        objective="Keep the original Goal",
        success_criteria=("learn",),
        constraints=("bounded",),
        authorization=goal_authorization,
        budget=BudgetLimit(model_requests=0, tool_calls=20, tokens=1000),
    )
    loop = LoopRecord(loop_id="loop-1", goal_id=goal.goal_id, kind=LoopKind.USER, objective="learn", budget=goal.budget)
    task = TaskRecord(
        task_id="task-1", loop_id=loop.loop_id, kind=TaskKind.LEARNING, objective="explore", acceptance=("evidence",)
    )
    manifest = RunManifest(
        workflow_version="1",
        schema_version="1",
        pydantic_ai_version="2.18.0",
        harness_version="0.13.0",
        model_id="test",
        prompt_digest="sha256:p",
        skill_versions={},
        skill_digests={},
        policy_digest="sha256:p",
        tool_contract_digest="sha256:t",
        goal_contract_digest="sha256:g",
        workspace_digest="sha256:w",
    )
    run = RunRecord(run_id="run-1", task_id=task.task_id, status=RunStatus.RUNNING, manifest=manifest)
    store.put_object("goal", goal.goal_id, None, "active", goal)
    store.put_object("loop", loop.loop_id, goal.goal_id, "active", loop)
    store.create_budget(loop.loop_id, None, loop.budget)
    store.put_object("task", task.task_id, loop.loop_id, "active", task)
    store.put_object("run", run.run_id, task.task_id, run.status.value, run)
    brief = ExplorationBrief(
        brief_id="brief-1",
        task_id=task.task_id,
        question="Which version?",
        decision_use="Choose API",
        known_evidence_ids=(),
        unknowns=("supported version",),
        allowed_local_roots=(".",),
        allowed_source_classes=("official_documentation",),
        allowed_domains=("example.org",),
        max_searches=max_searches,
        max_fetches=2,
        max_tokens=200,
        max_cost_microunits=10,
        wall_seconds=300,
        expected_outputs=("answer",),
        sufficiency_criteria=("source",),
        stop_conditions=(ExplorationStopReason.SUFFICIENT,),
    )
    store.create_exploration(brief)
    return ExplorationEngine(
        store,
        workspace,
        recorded_search_tool(FIXTURES / "search_results.json"),
        lambda _brief: recorded_fetch_tool(FETCHED_PAGE),
        1,
        2,
    ), brief


def reopen_engine(tmp_path: Path) -> ExplorationEngine:
    store = StateStore(tmp_path / "state.db")
    store.initialize()
    return ExplorationEngine(
        store,
        tmp_path / "workspace",
        recorded_search_tool(FIXTURES / "search_results.json"),
        lambda _brief: recorded_fetch_tool(FETCHED_PAGE),
        1,
        2,
    )


def test_local_exploration_stays_inside_allowed_roots(tmp_path: Path) -> None:
    engine, brief = make_engine_and_brief(tmp_path)
    findings = engine.search_local("run-1", brief, "parser_version")
    assert findings[0].locator == "README.md"
    with pytest.raises(ExplorationScopeError):
        engine.search_local("run-1", brief, "secret", glob="../*")


def test_search_snippet_cannot_become_evidence(tmp_path: Path) -> None:
    engine, brief = make_engine_and_brief(tmp_path)
    results = engine.search_web("run-1", brief, "supported parser version")
    assert results[0].url == "https://example.org/parser"
    assert engine.store.list_objects("source", SourceRecord) == []
    assert engine.store.list_objects("evidence", EvidenceRecord) == []


def test_fetch_creates_source_and_evidence_without_obeying_page_text(tmp_path: Path) -> None:
    engine, brief = make_engine_and_brief(tmp_path)
    source, evidence = engine.fetch_source("run-1", brief, "https://example.org/parser", "official_documentation")
    assert source.content_digest == content_digest(FETCHED_PAGE.read_bytes())
    assert source.trust_status == "untrusted_external"
    assert evidence.provenance_ids == (source.source_id,)
    assert evidence.purpose == "goal_exploration"
    assert engine.store.get_object("goal", "goal-original", GoalContract).objective == "Keep the original Goal"


def test_search_and_fetch_limits_survive_reopen(tmp_path: Path) -> None:
    engine, brief = make_engine_and_brief(tmp_path, max_searches=1)
    engine.search_web("run-1", brief, "parser")
    with pytest.raises(ExplorationBudgetExceeded):
        reopen_engine(tmp_path).search_web("run-1", brief, "parser again")


def test_cross_goal_or_missing_external_read_never_calls_handler(tmp_path: Path) -> None:
    engine, brief = make_engine_and_brief(tmp_path, goal_authorization=("workspace_read",))
    with pytest.raises(ExplorationAuthorizationError):
        engine.search_web("run-1", brief, "parser")
    assert engine.store.count_actions("run-1", "web_search") == 1
    with pytest.raises(ExplorationAuthorizationError):
        engine.search_web("run-from-other-goal", brief, "parser")


def test_local_sources_are_relative_and_sensitive_files_are_skipped(tmp_path: Path) -> None:
    engine, brief = make_engine_and_brief(tmp_path)
    (tmp_path / "workspace" / ".env").write_text("parser_version = secret\n", encoding="utf-8")
    findings = engine.search_local("run-1", brief, "parser_version", glob="*")
    sources = engine.store.list_objects("source", SourceRecord)
    evidence = engine.store.list_objects("evidence", EvidenceRecord)
    assert [finding.locator for finding in findings] == ["README.md"]
    assert sources[0].source_class == "local_repository"
    assert not Path(sources[0].locator).is_absolute()
    assert evidence[0].provenance_ids == (sources[0].source_id,)
    assert engine.store.count_actions("run-1", "local_search") == 1


def test_invalid_queries_and_urls_create_no_external_actions(tmp_path: Path) -> None:
    engine, brief = make_engine_and_brief(tmp_path)
    with pytest.raises(ExplorationScopeError):
        engine.search_web("run-1", brief, "token=please-do-not-search")
    with pytest.raises(ExplorationScopeError):
        engine.fetch_source("run-1", brief, "http://example.org/parser", "official_documentation")
    assert engine.store.count_actions("run-1", "web_search") == 0
    assert engine.store.count_actions("run-1", "web_fetch") == 0


def test_second_identical_fetch_reuses_persisted_source(tmp_path: Path) -> None:
    engine, brief = make_engine_and_brief(tmp_path)
    first_source, first_evidence = engine.fetch_source(
        "run-1", brief, "https://example.org/parser", "official_documentation"
    )
    source, evidence = engine.fetch_source("run-1", brief, "https://example.org/parser", "official_documentation")
    assert (source.source_id, evidence.evidence_id) == (first_source.source_id, first_evidence.evidence_id)
    assert engine.store.count_actions("run-1", "web_fetch") == 1


def test_git_view_is_fixed_and_creates_governed_evidence(tmp_path: Path) -> None:
    engine, brief = make_engine_and_brief(tmp_path)
    subprocess = __import__("subprocess")
    subprocess.run(["git", "init"], cwd=tmp_path / "workspace", check=True, capture_output=True)
    finding = engine.inspect_git("run-1", brief, "status")
    assert finding.locator == "git:status"
    assert engine.store.count_actions("run-1", "git_inspect") == 1


def test_live_tools_use_current_pydantic_ai_public_adapters() -> None:
    from tianwen.exploration import build_live_fetch_tool, build_live_search_tool

    assert build_live_search_tool(1).name == "duckduckgo_search"
    assert build_live_fetch_tool(1000, ("example.org",)).name == "web_fetch"


def test_prior_evidence_is_limited_to_the_same_goal(tmp_path: Path) -> None:
    engine, brief = make_engine_and_brief(tmp_path)
    source, evidence = engine.fetch_source("run-1", brief, "https://example.org/parser", "official_documentation")
    other = evidence.model_copy(
        update={"evidence_id": "other", "run_id": "other-run", "untrusted_excerpt": None}
    )
    engine.store.put_object("evidence", other.evidence_id, "other-run", "active", other)
    assert engine.search_prior_evidence(brief, "fetched") == (evidence,)
    assert source.source_id in evidence.provenance_ids


def test_ip_literal_url_is_rejected_before_action_creation(tmp_path: Path) -> None:
    engine, brief = make_engine_and_brief(tmp_path)
    unrestricted = brief.model_copy(update={"brief_id": "brief-unrestricted", "allowed_domains": ()})
    engine.store.create_exploration(unrestricted)
    with pytest.raises(ExplorationScopeError):
        engine.fetch_source("run-1", unrestricted, "https://8.8.8.8/parser", "official_documentation")
    assert engine.store.count_actions("run-1", "web_fetch") == 0


def test_finish_requires_evidence_for_sufficient_stop_reason(tmp_path: Path) -> None:
    engine, brief = make_engine_and_brief(tmp_path)
    with pytest.raises(ExplorationScopeError):
        engine.finish(
            "run-1",
            brief,
            evidence=(),
            sources=(),
            answered_unknowns=("supported version",),
            remaining_unknowns=(),
            planning_impact="choose parser",
            stop_reason=ExplorationStopReason.SUFFICIENT,
        )
