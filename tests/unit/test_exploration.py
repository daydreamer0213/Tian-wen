from __future__ import annotations

# ruff: noqa: E501
from datetime import timedelta
from pathlib import Path

import pytest

from tianwen.domain import (
    BudgetLimit,
    EvidenceRecord,
    ExplorationBrief,
    ExplorationStopReason,
    ExplorationUsage,
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
    utc_now,
)
from tianwen.exploration import (
    ExplorationAuthorizationError,
    ExplorationBudgetExceeded,
    ExplorationEngine,
    ExplorationError,
    ExplorationScopeError,
    recorded_fetch_tool,
    recorded_search_tool,
)
from tianwen.gateway import proposal_action_id
from tianwen.store import StateStore

FIXTURES = Path(__file__).parents[1] / "fixtures" / "exploration"
FETCHED_PAGE = FIXTURES / "fetched_page.md"


def make_engine_and_brief(
    tmp_path: Path,
    *,
    max_searches: int = 2,
    max_tokens: int = 200,
    max_cost_microunits: int = 10,
    wall_seconds: int = 300,
    created_at: object | None = None,
    goal_authorization: tuple[str, ...] = ("workspace_read", "external_read"),
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
        max_tokens=max_tokens,
        max_cost_microunits=max_cost_microunits,
        wall_seconds=wall_seconds,
        expected_outputs=("answer",),
        sufficiency_criteria=("source",),
        stop_conditions=(ExplorationStopReason.SUFFICIENT,),
        **({"created_at": created_at} if created_at is not None else {}),
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
    assert source.scope == evidence.scope == (
        f"goal:goal-original:workspace:{content_digest(str((tmp_path / 'workspace').resolve()))}"
    )
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
    calls: list[str] = []
    original_factory = engine.fetch_tool_factory

    def counted_factory(frozen_brief: ExplorationBrief):
        tool = original_factory(frozen_brief)

        async def counted_fetch(url: str) -> object:
            calls.append(url)
            return await tool.function(url=url)

        from pydantic_ai.tools import Tool

        return Tool(counted_fetch, name="counted_fetch")

    engine.fetch_tool_factory = counted_factory
    first_source, first_evidence = engine.fetch_source(
        "run-1", brief, "https://example.org/parser", "official_documentation"
    )
    source, evidence = engine.fetch_source("run-1", brief, "https://example.org/parser", "official_documentation")
    assert (source.source_id, evidence.evidence_id) == (first_source.source_id, first_evidence.evidence_id)
    assert engine.store.count_actions("run-1", "web_fetch") == 1
    assert calls == ["https://example.org/parser"]
    assert engine.store.get_exploration_usage("brief-1").fetches == 1


def test_fetch_replay_requires_exactly_one_persisted_source_and_evidence(tmp_path: Path) -> None:
    engine, brief = make_engine_and_brief(tmp_path)
    source, evidence = engine.fetch_source(
        "run-1", brief, "https://example.org/parser", "official_documentation"
    )
    duplicate_source = source.model_copy(update={"source_id": "duplicate-source"})
    engine.store.put_object("source", duplicate_source.source_id, "run-1", "active", duplicate_source)
    with pytest.raises(ExplorationError, match="corrupt"):
        engine.fetch_source("run-1", brief, "https://example.org/parser", "official_documentation")
    assert evidence.provenance_ids == (source.source_id,)


def test_fetch_replay_rejects_duplicate_evidence(tmp_path: Path) -> None:
    engine, brief = make_engine_and_brief(tmp_path)
    source, evidence = engine.fetch_source(
        "run-1", brief, "https://example.org/parser", "official_documentation"
    )
    duplicate_evidence = evidence.model_copy(
        update={
            "evidence_id": "duplicate-evidence",
            "untrusted_excerpt": evidence.untrusted_excerpt.model_copy(
                update={"evidence_id": "duplicate-evidence"}
            ),
        }
    )
    engine.store.put_object("evidence", duplicate_evidence.evidence_id, "run-1", "active", duplicate_evidence)
    with pytest.raises(ExplorationError, match="corrupt"):
        engine.fetch_source("run-1", brief, "https://example.org/parser", "official_documentation")
    assert source.source_id in evidence.provenance_ids


def test_fetch_replay_rejects_missing_persisted_evidence(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    engine, brief = make_engine_and_brief(tmp_path)
    engine.fetch_source("run-1", brief, "https://example.org/parser", "official_documentation")
    original_list = engine.store.list_objects

    def missing_evidence(kind: str, model: object) -> list[object]:
        if kind == "evidence":
            return []
        return original_list(kind, model)

    monkeypatch.setattr(engine.store, "list_objects", missing_evidence)
    with pytest.raises(ExplorationError, match="corrupt"):
        engine.fetch_source("run-1", brief, "https://example.org/parser", "official_documentation")


@pytest.mark.parametrize("failed_kind", ["source", "evidence"])
def test_fetch_persistence_failure_leaves_action_failed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, failed_kind: str
) -> None:
    engine, brief = make_engine_and_brief(tmp_path)
    original_put = engine.store.put_object

    def fail_one_put(kind: str, *args: object, **kwargs: object) -> None:
        if kind == failed_kind:
            raise RuntimeError(f"{kind} storage unavailable")
        original_put(kind, *args, **kwargs)

    monkeypatch.setattr(engine.store, "put_object", fail_one_put)
    with pytest.raises(RuntimeError, match="storage unavailable"):
        engine.fetch_source("run-1", brief, "https://example.org/parser", "official_documentation")
    action = engine.store.get_action(
        proposal_action_id(
            "run-1",
            "explore:web_fetch:" + content_digest({"url": "https://example.org/parser"}),
            "web_fetch",
            {"url": "https://example.org/parser"},
        )
    )
    assert action.status.value == "failed"


def test_zero_remaining_admitted_tokens_stops_before_fetch_tool(tmp_path: Path) -> None:
    engine, brief = make_engine_and_brief(tmp_path, max_tokens=0)
    calls: list[str] = []
    original_factory = engine.fetch_tool_factory

    def counted_factory(frozen_brief: ExplorationBrief):
        tool = original_factory(frozen_brief)

        async def counted_fetch(url: str) -> object:
            calls.append(url)
            return await tool.function(url=url)

        from pydantic_ai.tools import Tool

        return Tool(counted_fetch, name="counted_fetch")

    engine.fetch_tool_factory = counted_factory
    with pytest.raises(ExplorationBudgetExceeded, match="context budget"):
        engine.fetch_source("run-1", brief, "https://example.org/parser", "official_documentation")
    assert calls == []
    assert engine.store.list_events("run-1")[-1].kind == "exploration_stopped"
    assert engine.store.list_events("run-1")[-1].payload == {
        "brief_id": "brief-1",
        "reason": "budget_exhausted",
    }


def test_reopen_preserves_fetch_cost_and_admitted_tokens_before_network(tmp_path: Path) -> None:
    engine, brief = make_engine_and_brief(tmp_path, max_tokens=200, max_cost_microunits=2)
    calls: list[str] = []
    original_factory = engine.fetch_tool_factory

    def counted_factory(frozen_brief: ExplorationBrief):
        tool = original_factory(frozen_brief)

        async def counted_fetch(url: str) -> object:
            calls.append(url)
            return await tool.function(url=url)

        from pydantic_ai.tools import Tool

        return Tool(counted_fetch, name="counted_fetch")

    engine.fetch_tool_factory = counted_factory
    engine.fetch_source("run-1", brief, "https://example.org/parser", "official_documentation")
    reopened = reopen_engine(tmp_path)
    reopened.fetch_tool_factory = counted_factory
    with pytest.raises(ExplorationBudgetExceeded):
        reopened.fetch_source("run-1", brief, "https://example.org/another", "official_documentation")
    assert calls == ["https://example.org/parser"]
    assert reopened.store.get_exploration_usage("brief-1").cost_microunits == 2
    assert reopened.store.get_exploration_usage("brief-1").admitted_tokens > 0


def test_reopen_admitted_token_exhaustion_stops_before_network(tmp_path: Path) -> None:
    engine, brief = make_engine_and_brief(tmp_path, max_tokens=10, max_cost_microunits=10)
    calls: list[str] = []
    original_factory = engine.fetch_tool_factory

    def counted_factory(frozen_brief: ExplorationBrief):
        tool = original_factory(frozen_brief)

        async def counted_fetch(url: str) -> object:
            calls.append(url)
            return await tool.function(url=url)

        from pydantic_ai.tools import Tool

        return Tool(counted_fetch, name="counted_fetch")

    engine.fetch_tool_factory = counted_factory
    engine.fetch_source("run-1", brief, "https://example.org/parser", "official_documentation")
    reopened = reopen_engine(tmp_path)
    reopened.fetch_tool_factory = counted_factory
    with pytest.raises(ExplorationBudgetExceeded, match="context budget"):
        reopened.fetch_source("run-1", brief, "https://example.org/another", "official_documentation")
    assert calls == ["https://example.org/parser"]
    assert reopened.store.get_exploration_usage("brief-1").admitted_tokens == 10


def test_persisted_admitted_token_exhaustion_stops_before_action_and_fetch(
    tmp_path: Path,
) -> None:
    engine, brief = make_engine_and_brief(tmp_path, max_tokens=10)
    engine.store.reserve_exploration_usage(brief.brief_id, ExplorationUsage(admitted_tokens=10))
    factory_calls: list[str] = []
    tool_calls: list[str] = []
    original_factory = engine.fetch_tool_factory

    def counted_factory(frozen_brief: ExplorationBrief):
        factory_calls.append(frozen_brief.brief_id)
        tool = original_factory(frozen_brief)

        async def counted_fetch(url: str) -> object:
            tool_calls.append(url)
            return await tool.function(url=url)

        from pydantic_ai.tools import Tool

        return Tool(counted_fetch, name="counted_fetch")

    engine.fetch_tool_factory = counted_factory
    with pytest.raises(ExplorationBudgetExceeded, match="context budget"):
        engine.fetch_source("run-1", brief, "https://example.org/parser", "official_documentation")
    assert factory_calls == []
    assert tool_calls == []
    assert engine.store.count_actions("run-1", "web_fetch") == 0
    assert engine.store.list_events("run-1")[-1].payload == {
        "brief_id": "brief-1",
        "reason": "budget_exhausted",
    }


def test_exact_succeeded_fetch_replay_reads_records_when_tokens_are_full(tmp_path: Path) -> None:
    engine, brief = make_engine_and_brief(tmp_path, max_tokens=10)
    source, evidence = engine.fetch_source(
        "run-1", brief, "https://example.org/parser", "official_documentation"
    )
    assert engine.store.get_exploration_usage(brief.brief_id).admitted_tokens == 10
    factory_calls: list[str] = []
    original_factory = engine.fetch_tool_factory

    def counted_factory(frozen_brief: ExplorationBrief):
        factory_calls.append(frozen_brief.brief_id)
        return original_factory(frozen_brief)

    engine.fetch_tool_factory = counted_factory
    replayed_source, replayed_evidence = engine.fetch_source(
        "run-1", brief, "https://example.org/parser", "official_documentation"
    )
    assert (replayed_source, replayed_evidence) == (source, evidence)
    assert factory_calls == []


def test_reopen_wall_expiry_stops_before_creating_an_action(tmp_path: Path) -> None:
    engine, brief = make_engine_and_brief(
        tmp_path,
        wall_seconds=1,
        created_at=utc_now() - timedelta(seconds=2),
    )
    reopened = reopen_engine(tmp_path)
    with pytest.raises(ExplorationBudgetExceeded, match="wall-clock"):
        reopened.fetch_source("run-1", brief, "https://example.org/parser", "official_documentation")
    assert reopened.store.count_actions("run-1", "web_fetch") == 0
    assert reopened.store.list_events("run-1")[-1].payload == {
        "brief_id": "brief-1",
        "reason": "budget_exhausted",
    }


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


def test_prior_evidence_uses_exact_goal_workspace_scope_across_loops(tmp_path: Path) -> None:
    engine, brief = make_engine_and_brief(tmp_path)
    _, evidence = engine.fetch_source("run-1", brief, "https://example.org/parser", "official_documentation")
    goal_scope = f"goal:goal-original:workspace:{content_digest(str((tmp_path / 'workspace').resolve()))}"
    loop = LoopRecord(
        loop_id="loop-2",
        goal_id="goal-original",
        kind=LoopKind.CHILD,
        objective="another exploration",
        budget=BudgetLimit(model_requests=0, tool_calls=20, tokens=1000),
    )
    task = TaskRecord(
        task_id="task-2", loop_id=loop.loop_id, kind=TaskKind.LEARNING, objective="explore", acceptance=("evidence",)
    )
    first_run = engine.store.get_object("run", "run-1", RunRecord)
    run = first_run.model_copy(update={"run_id": "run-2", "task_id": task.task_id})
    same_goal_other_loop = evidence.model_copy(
        update={"evidence_id": "same-goal-other-loop", "run_id": run.run_id, "scope": goal_scope, "untrusted_excerpt": None}
    )
    wrong_scope = evidence.model_copy(
        update={"evidence_id": "wrong-workspace", "scope": "goal:goal-original:workspace:sha256:wrong", "untrusted_excerpt": None}
    )
    wrong_purpose = evidence.model_copy(
        update={"evidence_id": "wrong-purpose", "purpose": "memory", "scope": goal_scope, "untrusted_excerpt": None}
    )
    other_goal = engine.store.get_object("goal", "goal-original", GoalContract).model_copy(update={"goal_id": "goal-other"})
    other_loop = loop.model_copy(update={"loop_id": "loop-other", "goal_id": other_goal.goal_id})
    other_task = task.model_copy(update={"task_id": "task-other", "loop_id": other_loop.loop_id})
    other_run = run.model_copy(update={"run_id": "run-other", "task_id": other_task.task_id})
    wrong_goal = evidence.model_copy(
        update={"evidence_id": "wrong-goal", "run_id": other_run.run_id, "scope": goal_scope, "untrusted_excerpt": None}
    )
    engine.store.put_object("loop", loop.loop_id, loop.goal_id, "active", loop)
    engine.store.create_budget(loop.loop_id, None, loop.budget)
    engine.store.put_object("task", task.task_id, loop.loop_id, "active", task)
    engine.store.put_object("run", run.run_id, task.task_id, run.status.value, run)
    engine.store.put_object("evidence", same_goal_other_loop.evidence_id, run.run_id, "active", same_goal_other_loop)
    engine.store.put_object("evidence", wrong_scope.evidence_id, "run-1", "active", wrong_scope)
    engine.store.put_object("evidence", wrong_purpose.evidence_id, "run-1", "active", wrong_purpose)
    engine.store.put_object("goal", other_goal.goal_id, None, "active", other_goal)
    engine.store.put_object("loop", other_loop.loop_id, other_goal.goal_id, "active", other_loop)
    engine.store.create_budget(other_loop.loop_id, None, other_loop.budget)
    engine.store.put_object("task", other_task.task_id, other_loop.loop_id, "active", other_task)
    engine.store.put_object("run", other_run.run_id, other_task.task_id, other_run.status.value, other_run)
    engine.store.put_object("evidence", wrong_goal.evidence_id, other_run.run_id, "active", wrong_goal)

    found = engine.search_prior_evidence(brief, "fetched")

    assert {record.evidence_id for record in found} == {evidence.evidence_id, same_goal_other_loop.evidence_id}
    assert all(record.scope == goal_scope for record in found)


def test_finish_rejects_forged_or_empty_provenance_models(tmp_path: Path) -> None:
    engine, brief = make_engine_and_brief(tmp_path)
    source, evidence = engine.fetch_source("run-1", brief, "https://example.org/parser", "official_documentation")
    forged_source = source.model_copy(update={"title": "forged"})
    empty_provenance = evidence.model_copy(
        update={"evidence_id": "empty-provenance", "provenance_ids": (), "untrusted_excerpt": None}
    )
    engine.store.put_object("evidence", empty_provenance.evidence_id, "run-1", "active", empty_provenance)

    with pytest.raises(ExplorationScopeError, match="persisted"):
        engine.finish(
            "run-1", brief, (evidence,), (forged_source,), ("supported version",), (), "choose parser", ExplorationStopReason.SUFFICIENT
        )
    with pytest.raises(ExplorationScopeError, match="provenance"):
        engine.finish(
            "run-1", brief, (empty_provenance,), (source,), (), ("supported version",), "wait", ExplorationStopReason.INSUFFICIENT_EVIDENCE
        )


def test_finish_rejects_persisted_cross_run_evidence(tmp_path: Path) -> None:
    engine, brief = make_engine_and_brief(tmp_path)
    first_run = engine.store.get_object("run", "run-1", RunRecord)
    engine.store.put_object("run", "run-2", first_run.task_id, first_run.status.value, first_run.model_copy(update={"run_id": "run-2"}))
    source, evidence = engine.fetch_source("run-2", brief, "https://example.org/other", "official_documentation")

    with pytest.raises(ExplorationScopeError, match="run"):
        engine.finish(
            "run-1", brief, (evidence,), (source,), (), ("supported version",), "wait", ExplorationStopReason.INSUFFICIENT_EVIDENCE
        )


def test_finish_sufficient_accepts_real_persisted_fetched_evidence(tmp_path: Path) -> None:
    engine, brief = make_engine_and_brief(tmp_path)
    source, evidence = engine.fetch_source("run-1", brief, "https://example.org/parser", "official_documentation")

    report = engine.finish(
        "run-1", brief, (evidence,), (source,), ("supported version",), (), "choose parser", ExplorationStopReason.SUFFICIENT
    )

    assert report.evidence_ids == (evidence.evidence_id,)
    assert engine.store.get_object("exploration_report", report.report_id, type(report)) == report


@pytest.mark.parametrize(
    "stop_reason",
    (
        ExplorationStopReason.BUDGET_EXHAUSTED,
        ExplorationStopReason.SOURCE_UNAVAILABLE,
        ExplorationStopReason.RISK_BOUNDARY,
    ),
)
def test_finish_requires_persisted_stop_cause_for_terminal_causes(
    tmp_path: Path, stop_reason: ExplorationStopReason
) -> None:
    engine, brief = make_engine_and_brief(tmp_path)
    kwargs = dict(
        run_id="run-1",
        brief=brief,
        evidence=(),
        sources=(),
        answered_unknowns=(),
        remaining_unknowns=("supported version",),
        planning_impact="wait",
        stop_reason=stop_reason,
    )

    with pytest.raises(ExplorationScopeError, match="stop cause"):
        engine.finish(**kwargs)
    engine.store.append_event(
        "run-1", "exploration_stopped", {"brief_id": brief.brief_id, "reason": stop_reason.value}
    )

    report = engine.finish(**kwargs)

    assert report.stop_reason is stop_reason


def test_finish_no_new_evidence_requires_empty_latest_operation(tmp_path: Path) -> None:
    engine, brief = make_engine_and_brief(tmp_path)
    source, evidence = engine.fetch_source("run-1", brief, "https://example.org/parser", "official_documentation")

    with pytest.raises(ExplorationScopeError, match="no new evidence"):
        engine.finish(
            "run-1", brief, (evidence,), (source,), (), (), "wait", ExplorationStopReason.NO_NEW_EVIDENCE
        )
    report = engine.finish("run-1", brief, (), (), (), (), "wait", ExplorationStopReason.NO_NEW_EVIDENCE)

    assert report.stop_reason is ExplorationStopReason.NO_NEW_EVIDENCE
    assert engine.store.list_events("run-1")[-2].payload == {"brief_id": brief.brief_id, "reason": "no_new_evidence"}
