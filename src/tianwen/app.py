from __future__ import annotations

import asyncio
import secrets
from dataclasses import dataclass
from importlib.metadata import version
from pathlib import Path
from typing import Any

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from pydantic_ai_harness.step_persistence import SqliteStepStore

from tianwen.domain import (
    ArtifactStatus,
    ArtifactVersion,
    BudgetLimit,
    CaseRecord,
    EvalProtocol,
    EvalReceipt,
    EvalRun,
    EvidenceRecord,
    ExplorationBrief,
    ExplorationReport,
    ExplorationStopReason,
    FrozenModel,
    GoalContract,
    LessonRecord,
    LoopKind,
    LoopRecord,
    PromotionRecord,
    RunManifest,
    RunRecord,
    RunStatus,
    SourceRecord,
    TaskKind,
    TaskRecord,
    content_digest,
)
from tianwen.evaluation import (
    ActivePointer,
    EvaluationError,
    Publisher,
    create_approval_receipt,
    create_promotion_request,
    import_eval_receipt,
    write_eval_request,
)
from tianwen.evidence import evidence_from_action, project_meta_telemetry
from tianwen.exploration import (
    ExplorationEngine,
    build_live_fetch_tool,
    build_live_search_tool,
    recorded_fetch_tool,
    recorded_search_tool,
)
from tianwen.learning import LearningEngine, LearningSignal
from tianwen.runtime import RepoTaskRuntime, RuntimeConfig, runtime_manifest_digests
from tianwen.store import GovernanceStore, StateConflict, StateStore


class AppError(RuntimeError):
    """Raised when a public local-product operation cannot safely continue."""


@dataclass(frozen=True)
class TianwenConfig:
    data_dir: Path
    workspace: Path
    model: Any
    public_evaluator_key: Ed25519PublicKey
    approved_protocol: EvalProtocol
    recorded_search_path: Path | None = None
    recorded_fetch_path: Path | None = None
    allowed_commands: tuple[str, ...] = ("python",)
    learning_budget: BudgetLimit = BudgetLimit(model_requests=1, tool_calls=3, tokens=300)


class DecisionBrief(FrozenModel):
    goal: str
    loop: str
    task: str
    phase: str
    verified_facts: tuple[str, ...]
    public_hypotheses: tuple[str, ...]
    exploration: str
    current_action: str
    next_step: str
    budget_usage: str
    risks_and_unknowns: tuple[str, ...]
    champion: str
    challenger: str | None = None
    intervention_level: str
    idle_outcome: str


class TianwenApp:
    """Small serial coordinator for the bounded local Tian-wen product slice."""

    def __init__(self, config: TianwenConfig) -> None:
        self.config = config
        self.data_dir = config.data_dir.resolve()
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.store = StateStore(self.data_dir / "tianwen.db")
        self.store.initialize()
        self._bootstrap()

    def _bootstrap(self) -> None:
        champion_content = (Path(__file__).parents[2] / "skills" / "repo_task" / "SKILL.md").read_text(encoding="utf-8")
        digest = content_digest(champion_content)
        champion = ArtifactVersion(
            artifact_id="repo-task",
            artifact_type="repo_task_skill",
            version_id=digest,
            parent_version_id=None,
            content_digest=digest,
            content=champion_content,
            evidence_ids=(),
            status=ArtifactStatus.ACTIVE,
        )
        pointer = ActivePointer(artifact_id="repo-task", current_version_id=champion.version_id, generation=1)
        GovernanceStore(self.store.database).bootstrap_repo_task(champion, self.config.approved_protocol, pointer)

    def create_goal(
        self,
        *,
        objective: str,
        criteria: tuple[str, ...],
        workspace: Path,
        authorization: tuple[str, ...],
        budget: BudgetLimit,
        kind: LoopKind = LoopKind.USER,
    ) -> GoalContract:
        if kind not in {LoopKind.USER, LoopKind.META} or not objective.strip() or not criteria:
            raise AppError("a root user or meta goal needs an objective and at least one criterion")
        if workspace.resolve() != self.config.workspace.resolve():
            raise AppError("goal workspace must equal the configured local workspace")
        goal = GoalContract(
            goal_id=f"goal:{secrets.token_urlsafe(18)}",
            objective=objective.strip(),
            success_criteria=criteria,
            constraints=("serial local product slice",),
            authorization=authorization,
            budget=budget,
        )
        root = LoopRecord(
            loop_id=f"loop:{secrets.token_urlsafe(18)}",
            goal_id=goal.goal_id,
            kind=kind,
            objective="goal execution" if kind is LoopKind.USER else "allowlisted outcome supervision",
            budget=budget,
        )
        task = TaskRecord(
            task_id=f"task:{secrets.token_urlsafe(18)}",
            loop_id=root.loop_id,
            kind=TaskKind.EXECUTION,
            objective="complete the bounded repository task",
            acceptance=criteria,
        )
        self.store.put_object("goal", goal.goal_id, None, "active", goal)
        self.store.put_object("loop", root.loop_id, goal.goal_id, "active", root)
        self.store.create_budget(root.loop_id, None, budget)
        self.store.put_object("task", task.task_id, root.loop_id, "active", task)
        if kind is LoopKind.USER:
            meta = LoopRecord(
                loop_id=f"meta:{secrets.token_urlsafe(18)}",
                goal_id=goal.goal_id,
                kind=LoopKind.META,
                objective="allowlisted outcome supervision",
                budget=budget,
            )
            self.store.put_object("loop", meta.loop_id, goal.goal_id, "active", meta)
            self.store.create_budget(meta.loop_id, None, budget)
        return goal

    def goal_task(self, goal_id: str) -> TaskRecord:
        user = self._root_loop(goal_id, LoopKind.USER)
        tasks = [task for task in self.store.list_objects("task", TaskRecord) if task.loop_id == user.loop_id]
        if len(tasks) != 1:
            raise AppError("goal has no exact root task")
        return tasks[0]

    def meta_loop(self, goal_id: str) -> LoopRecord:
        return self._root_loop(goal_id, LoopKind.META)

    def _root_loop(self, goal_id: str, kind: LoopKind) -> LoopRecord:
        self.store.get_object("goal", goal_id, GoalContract)
        matches = [
            loop
            for loop in self.store.list_objects("loop", LoopRecord)
            if loop.goal_id == goal_id and loop.kind is kind and loop.parent_loop_id is None
        ]
        if len(matches) != 1:
            raise AppError(f"goal has no exact {kind.value} root loop")
        return matches[0]

    def _manifest(self, *, prompt: str, skill_version: str, skill_digest: str, goal: GoalContract) -> RunManifest:
        runtime_config = RuntimeConfig(
            workspace=self.config.workspace.resolve(),
            skill_dir=self._materialize(skill_version),
            allowed_commands=self.config.allowed_commands,
        )
        digests = runtime_manifest_digests(runtime_config)
        return RunManifest(
            workflow_version="tianwen-v1",
            schema_version="1",
            pydantic_ai_version=version("pydantic-ai-slim"),
            harness_version=version("pydantic-ai-harness"),
            model_id=self._model_id(),
            prompt_digest=content_digest(prompt),
            skill_versions={"repo_task": skill_version},
            skill_digests={"repo_task": skill_digest},
            policy_digest=digests["policy_digest"],
            tool_contract_digest=digests["tool_contract_digest"],
            goal_contract_digest=content_digest(goal),
            workspace_digest=digests["workspace_digest"],
        )

    def _model_id(self) -> str:
        return self.config.model if isinstance(self.config.model, str) else self.config.model.model_name

    def _materialize(self, version_id: str) -> Path:
        artifact = self.artifact(version_id)
        root = self.data_dir / "materialized" / version_id.removeprefix("sha256:") / "repo_task"
        root.mkdir(parents=True, exist_ok=True)
        skill = root / "SKILL.md"
        if skill.exists() and skill.read_text(encoding="utf-8") != artifact.content:
            raise AppError("materialized skill does not match immutable artifact")
        if not skill.exists():
            skill.write_text(artifact.content, encoding="utf-8")
            skill.chmod(0o444)
        return root.parent

    def artifact(self, version_id: str) -> ArtifactVersion:
        return self.store.get_object("artifact", version_id, ArtifactVersion)

    def explore(self, goal_id: str, brief: ExplorationBrief, *, live: bool = False) -> ExplorationReport:
        task = self.store.get_object("task", brief.task_id, TaskRecord)
        loop = self.store.get_object("loop", task.loop_id, LoopRecord)
        goal = self.store.get_object("goal", loop.goal_id, GoalContract)
        if goal_id != loop.goal_id or goal_id != goal.goal_id:
            raise AppError("exploration brief is not authorized by the supplied goal")
        try:
            persisted = self.store.get_object("exploration_brief", brief.brief_id, ExplorationBrief)
            if persisted != brief:
                raise AppError("exploration brief replay conflicts with persisted authority")
        except StateConflict:
            self.store.create_exploration(brief)
        run = RunRecord(
            run_id=f"explore:{secrets.token_urlsafe(18)}",
            task_id=task.task_id,
            status=RunStatus.RUNNING,
            manifest=self._manifest(
                prompt="exploration",
                skill_version=self.active_version(),
                skill_digest=self.artifact(self.active_version()).content_digest,
                goal=goal,
            ),
        )
        self.store.put_object("run", run.run_id, task.task_id, run.status.value, run)
        engine = self._explorer(live, brief)
        for unknown in brief.unknowns:
            engine.search_local(run.run_id, brief, unknown)
        if brief.allowed_domains and brief.allowed_source_classes and engine.search_tool is not None:
            for unknown in brief.unknowns:
                results = engine.search_web(run.run_id, brief, unknown)
                if results:
                    engine.fetch_source(run.run_id, brief, results[0].url, brief.allowed_source_classes[0])
        sources = tuple(
            source for source in self.store.list_objects("source", SourceRecord) if source.run_id == run.run_id
        )
        evidence = tuple(
            item for item in self.store.list_objects("evidence", EvidenceRecord) if item.run_id == run.run_id
        )
        answered = brief.unknowns if evidence else ()
        remaining = () if answered else brief.unknowns
        stop = ExplorationStopReason.SUFFICIENT if answered else ExplorationStopReason.INSUFFICIENT_EVIDENCE
        report = engine.finish(
            run.run_id,
            brief,
            evidence,
            sources,
            answered,
            remaining,
            "source-backed exploration informs the next bounded action",
            stop,
        )
        completed = run.model_copy(update={"status": RunStatus.COMPLETED})
        self.store.put_object("run", run.run_id, task.task_id, RunStatus.COMPLETED.value, completed)
        return report

    def _explorer(self, live: bool, brief: ExplorationBrief) -> ExplorationEngine:
        if live:
            if not brief.allowed_domains:
                raise AppError("live web exploration requires explicit allowed domains")
            search_tool = build_live_search_tool(8)

            def fetch_factory(frozen: ExplorationBrief):
                return build_live_fetch_tool(frozen.max_tokens * 4, frozen.allowed_domains)

        else:
            search_tool = None
            if self.config.recorded_search_path:
                search_tool = recorded_search_tool(self.config.recorded_search_path)
            fetch_factory = None
            if self.config.recorded_fetch_path:

                def fetch_factory(_brief: ExplorationBrief):
                    return recorded_fetch_tool(self.config.recorded_fetch_path)

        return ExplorationEngine(self.store, self.config.workspace, search_tool, fetch_factory, 1, 1)

    def run_repo_task(self, goal_id: str, repo: Path, request: str) -> str:
        goal = self.store.get_object("goal", goal_id, GoalContract)
        if repo.resolve() != self.config.workspace.resolve():
            raise AppError("repository must equal the configured workspace")
        task = self.goal_task(goal_id)
        reports = [
            report
            for report in self.store.list_objects("exploration_report", ExplorationReport)
            if self._brief_task(report) == task.task_id
        ]
        if reports and reports[-1].stop_reason is ExplorationStopReason.INSUFFICIENT_EVIDENCE:
            raise AppError("required exploration remains insufficient_evidence")
        champion_id = self.active_version()
        champion = self.artifact(champion_id)
        source_ids = [
            source.source_id
            for source in self.store.list_objects("source", SourceRecord)
            if source.purpose == "goal_exploration"
        ]
        prompt = f"Goal {goal.goal_id}. Request: {request}\nEvidence source IDs: {','.join(source_ids[:8])}"
        run = RunRecord(
            run_id=f"run:{secrets.token_urlsafe(18)}",
            task_id=task.task_id,
            status=RunStatus.QUEUED,
            manifest=self._manifest(
                prompt=prompt,
                skill_version=champion.version_id,
                skill_digest=champion.content_digest,
                goal=goal,
            ),
        )
        self.store.put_object("run", run.run_id, task.task_id, run.status.value, run)
        runtime = RepoTaskRuntime(
            self.store,
            SqliteStepStore(database=self.store.database),
            self.config.model,
            RuntimeConfig(repo.resolve(), self._materialize(champion.version_id), self.config.allowed_commands),
        )
        outcome = asyncio.run(runtime.run(run, prompt))
        self._project_run_outcomes(goal_id, run.run_id)
        if outcome.waiting_action_ids:
            return f"waiting_approval:{outcome.checkpoint_id}"
        return outcome.output or ""

    def _brief_task(self, report: ExplorationReport) -> str:
        return self.store.get_object("exploration_brief", report.brief_id, ExplorationBrief).task_id

    def _project_run_outcomes(self, goal_id: str, run_id: str) -> None:
        meta = self.meta_loop(goal_id)
        scope = f"goal:{goal_id}:execution"
        for action in self.store.unresolved_actions(run_id):
            del action
        with self.store._connect() as connection:
            rows = connection.execute("SELECT action_id FROM tw_actions WHERE run_id = ?", (run_id,)).fetchall()
        for row in rows:
            action = self.store.get_action(str(row["action_id"]))
            record = evidence_from_action(
                action,
                "bounded runtime action outcome",
                scope=scope,
                purpose="execution_outcome",
            )
            self.store.put_object("evidence", record.evidence_id, run_id, "active", record)
            telemetry = project_meta_telemetry(record)
            telemetry_id = content_digest({"action": action.action_id, "telemetry": telemetry})
            self.store.put_immutable_object(
                "meta_telemetry", telemetry_id, meta.loop_id, "recorded", _Telemetry(**telemetry)
            )

    def record_learning_signal(
        self, goal_id: str, *, category: str, severity: int, recurrence: int, evidence_ids: tuple[str, ...]
    ) -> str | None:
        signal = LearningSignal(
            signal_id=f"signal:{secrets.token_urlsafe(18)}",
            loop_id=self.meta_loop(goal_id).loop_id,
            category=category,
            severity=severity,
            recurrence=recurrence,
            blocks_goal=False,
            user_corrected=False,
            evidence_ids=evidence_ids,
        )
        self.store.put_immutable_object("pending_learning_signal", signal.signal_id, signal.loop_id, "queued", signal)
        return signal.signal_id

    def process_learning(self, loop_id: str) -> str | None:
        processed = {
            signal.signal_id for signal in self.store.list_objects("learning_signal", LearningSignal)
        }
        queued = [
            signal
            for signal in self.store.list_objects("pending_learning_signal", LearningSignal)
            if signal.loop_id == loop_id and signal.signal_id not in processed
        ]
        if not queued:
            return None
        signal = queued[0]
        ticket = LearningEngine(self.store, self.config.learning_budget).enqueue(signal)
        return ticket

    def create_learning_case(self, ticket_id: str) -> CaseRecord:
        return LearningEngine(self.store, self.config.learning_budget).create_case(ticket_id)

    def accept_protocol_fixture_lesson(self, case_id: str, evidence_ids: tuple[str, ...]) -> LessonRecord:
        lesson = LessonRecord(
            lesson_id=f"lesson:{secrets.token_urlsafe(18)}",
            case_ids=(case_id,),
            claim="Stop and replan after an identical failed verification command repeats.",
            when=("a verification command repeats without new evidence",),
            not_when=("the failure has new diagnostics",),
            evidence_ids=evidence_ids,
            counterevidence_ids=(),
            confidence_basis="protocol fixture; not evidence of broad improvement",
            target_scope="repo_task_skill",
            status="accepted",
        )
        LearningEngine(self.store, self.config.learning_budget).accept_lesson(lesson)
        return lesson

    def create_protocol_fixture_candidate(self, ticket_id: str, lesson_id: str) -> ArtifactVersion:
        engine = LearningEngine(self.store, self.config.learning_budget)
        lesson = self.store.get_object("lesson", lesson_id, LessonRecord)
        champion = self.artifact(self.active_version())
        candidate = champion.content + (
            "\n## Conditions\n- When: a verification command repeats without new evidence\n"
            "\n## Counterexamples\n- Not when: the failure has new diagnostics\n"
            f"\n## Evidence\n- Evidence: {lesson.evidence_ids[0]}\n"
            "\nStop and replan instead of repeating an identical failed verification command.\n"
        )
        return engine.create_repo_task_candidate(champion, lesson, candidate)

    def create_eval_request(self, candidate_version_id: str):
        candidate = self.artifact(candidate_version_id)
        champion = self.artifact(self.active_version())
        return write_eval_request(
            self.store,
            self.config.approved_protocol,
            champion,
            candidate,
            self.data_dir / "eval-inbox",
        )

    def evaluate_candidate(self, candidate_version_id: str) -> EvalRun:
        existing = [
            run
            for run in self.store.list_objects("eval_run", EvalRun)
            if run.challenger_version_id == candidate_version_id
        ]
        if existing:
            return existing[-1]
        request = self.create_eval_request(candidate_version_id)
        raise AppError(f"waiting for external evaluator receipt for request {request.request_id}")

    def eval_request_path(self, request_id: str) -> Path:
        request, _ = self.store.get_eval_request(request_id)
        return Path(request.receipt_path).with_name("request.json")

    def import_eval_receipt(self, receipt_path: Path) -> EvalRun:
        receipt = EvalReceipt.model_validate_json(receipt_path.read_text(encoding="utf-8"))
        try:
            return import_eval_receipt(self.store, receipt, self.config.public_evaluator_key)
        except (EvaluationError, StateConflict) as error:
            raise AppError(str(error)) from error

    def request_promotion(self, candidate_version_id: str) -> tuple[str, str]:
        candidate = self.artifact(candidate_version_id)
        runs = [
            run
            for run in self.store.list_objects("eval_run", EvalRun)
            if run.challenger_version_id == candidate_version_id
        ]
        if not runs:
            raise AppError("candidate has no imported external evaluation receipt")
        request = create_promotion_request(self.store, candidate, runs[-1])
        return request.request_id, request.challenge

    def confirm_promotion(self, request_id: str, approved_by: str, typed_challenge: str) -> PromotionRecord:
        try:
            approval = create_approval_receipt(self.store, request_id, approved_by, typed_challenge)
            request, _ = self.store.get_promotion_request(request_id)
            run = self.store.get_object("eval_run", request.eval_run_id, EvalRun)
            return Publisher(self.store).promote(run, approval)
        except (EvaluationError, StateConflict) as error:
            raise AppError(str(error)) from error

    def rollback(self, artifact_id: str, approved_by: str, reason: str) -> PromotionRecord:
        return Publisher(self.store).rollback(artifact_id, approved_by, reason)

    def active_version(self, artifact_id: str = "repo-task") -> str:
        return self.store.get_object("active_pointer", artifact_id, ActivePointer).current_version_id

    def last_run(self, goal_id: str) -> RunRecord:
        task = self.goal_task(goal_id)
        runs = [run for run in self.store.list_objects("run", RunRecord) if run.task_id == task.task_id]
        if not runs:
            raise AppError("goal has no run")
        return max(runs, key=lambda item: item.created_at)

    def status(self, goal_id: str) -> DecisionBrief:
        goal = self.store.get_object("goal", goal_id, GoalContract)
        loop = self._root_loop(goal_id, LoopKind.USER)
        task = self.goal_task(goal_id)
        _limit, usage, reserved = self.store.get_budget(loop.loop_id)
        reports = [
            report
            for report in self.store.list_objects("exploration_report", ExplorationReport)
            if self._brief_task(report) == task.task_id
        ]
        latest = reports[-1] if reports else None
        candidate_ids = [
            artifact.version_id
            for artifact in self.store.list_objects("artifact", ArtifactVersion)
            if artifact.status is ArtifactStatus.CANDIDATE
        ]
        return DecisionBrief(
            goal=goal.goal_id,
            loop=loop.loop_id,
            task=task.task_id,
            phase="execution" if self.last_run_or_none(goal_id) else "planning",
            verified_facts=(f"sources:{sum(len(report.source_ids) for report in reports)}",),
            public_hypotheses=("bounded local evidence can inform the next task",),
            exploration=(
                "none" if latest is None else f"{latest.stop_reason.value}; remaining:{len(latest.remaining_unknowns)}"
            ),
            current_action="none",
            next_step="run the bounded repository task" if latest is None else "review or run the frozen task",
            budget_usage=f"tool_calls:{usage.tool_calls}; reserved_children:{reserved.child_loops}",
            risks_and_unknowns=("external evaluation remains separate",),
            champion=self.active_version(),
            challenger=candidate_ids[-1] if candidate_ids else None,
            intervention_level="none",
            idle_outcome="no action is taken; durable state remains unchanged",
        )

    def last_run_or_none(self, goal_id: str) -> RunRecord | None:
        try:
            return self.last_run(goal_id)
        except AppError:
            return None


class _Telemetry(FrozenModel):
    evidence_type: str
    result_class: str
    effect_class: str
    version_bucket: str
    cost_bucket: str
    needed_user: bool
    safety_category: str
