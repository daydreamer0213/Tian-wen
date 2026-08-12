from __future__ import annotations

import asyncio
import json
import re
import secrets
from collections.abc import Callable
from dataclasses import dataclass
from importlib.metadata import version
from pathlib import Path
from typing import Any

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from pydantic_ai_harness.step_persistence import SqliteStepStore

from tianwen.domain import (
    ActionStatus,
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
    CaseOutcome,
    EvalCase,
    EvaluationError,
    Publisher,
    create_approval_receipt,
    create_promotion_request,
    import_eval_receipt,
    run_public_comparison,
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
from tianwen.learning import AttributionRecord, LearningEngine, LearningSignal
from tianwen.memory import CapabilityLedger, CapabilityObservation
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


class RuntimeControl(FrozenModel):
    run_id: str
    goal_id: str
    workspace: str
    allowed_commands: tuple[str, ...]


class AppConfig(FrozenModel):
    public_evaluator_key_pem: str
    public_evaluator_key_digest: str


class TianwenApp:
    """Small serial coordinator for the bounded local Tian-wen product slice."""

    def __init__(self, config: TianwenConfig) -> None:
        self.config = config
        self.data_dir = config.data_dir.resolve()
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.store = StateStore(self.data_dir / "tianwen.db")
        self.store.initialize()
        self._persist_app_config()
        self._bootstrap()

    def _persist_app_config(self) -> None:
        if not isinstance(self.config.public_evaluator_key, Ed25519PublicKey):
            raise AppError("public evaluator key must be Ed25519")
        pem = self.config.public_evaluator_key.public_bytes(
            Encoding.PEM, PublicFormat.SubjectPublicKeyInfo
        ).decode("ascii")
        try:
            self.store.put_immutable_object(
                "app_config",
                "app-config:v1",
                None,
                "active",
                AppConfig(public_evaluator_key_pem=pem, public_evaluator_key_digest=content_digest(pem)),
            )
        except StateConflict as error:
            raise AppError("public evaluator key does not match the initialized data directory") from error

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
        answered = tuple(unknown for unknown in brief.unknowns if self._covered_by_evidence(unknown, evidence, sources))
        remaining = tuple(unknown for unknown in brief.unknowns if unknown not in answered)
        sufficient = bool(evidence) and not remaining and all(
            self._covered_by_evidence(criterion, evidence, ()) for criterion in brief.sufficiency_criteria
        )
        stop = ExplorationStopReason.SUFFICIENT if sufficient else ExplorationStopReason.INSUFFICIENT_EVIDENCE
        planning_impact = (
            "all exploration unknowns and sufficiency criteria have governed evidence coverage"
            if sufficient
            else (
                f"{len(answered)} exploration unknowns have governed evidence coverage; "
                f"{len(remaining)} remain unresolved"
            )
        )
        report = engine.finish(
            run.run_id,
            brief,
            evidence,
            sources,
            answered,
            remaining,
            planning_impact,
            stop,
        )
        completed = run.model_copy(update={"status": RunStatus.COMPLETED})
        self.store.put_object("run", run.run_id, task.task_id, RunStatus.COMPLETED.value, completed)
        return report

    @staticmethod
    def _coverage_tokens(value: str) -> frozenset[str]:
        stopwords = {
            "the", "a", "an", "and", "or", "of", "to", "for", "in", "on", "is", "are", "what",
            "which", "should", "current", "currently", "的", "了", "是", "和", "或", "在", "对", "于",
            "与", "及", "这", "那", "什么", "哪个", "应该", "当前", "目前",
        }
        return frozenset(
            token
            for token in re.findall(r"[a-z0-9]+|[\u4e00-\u9fff]+", value.casefold())
            if token not in stopwords
        )

    def _covered_by_evidence(
        self, subject: str, evidence: tuple[EvidenceRecord, ...], sources: tuple[SourceRecord, ...]
    ) -> bool:
        required = self._coverage_tokens(subject)
        if not required or not any(len(token) >= 4 or token.isdigit() for token in required):
            return False
        governed_text = " ".join(item.summary for item in evidence)
        return required <= self._coverage_tokens(governed_text)

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
        packet = self.goal_evidence_packet(goal_id)
        prompt = json.dumps(
            {"goal_id": goal.goal_id, "request": request, "evidence_packet": packet},
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
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
        self.store.put_immutable_object(
            "runtime_control",
            run.run_id,
            goal.goal_id,
            "active",
            RuntimeControl(
                run_id=run.run_id,
                goal_id=goal.goal_id,
                workspace=str(repo.resolve()),
                allowed_commands=self.config.allowed_commands,
            ),
        )
        runtime = self._runtime(
            RuntimeConfig(repo.resolve(), self._materialize(champion.version_id), self.config.allowed_commands)
        )
        outcome = asyncio.run(runtime.run(run, prompt))
        self._project_run_outcomes(goal_id, run.run_id)
        if outcome.waiting_action_ids:
            return f"waiting_approval:{outcome.checkpoint_id}"
        return outcome.output or ""

    def pending_approval(self, checkpoint_id: str) -> tuple[tuple[str, str, str], ...]:
        checkpoint, _run, _control = self._approval_checkpoint(checkpoint_id)
        action_ids = checkpoint.state.get("action_to_tool_call")
        if not isinstance(action_ids, dict) or not action_ids:
            raise AppError("checkpoint has no pending approval actions")
        pending = []
        for action_id in sorted(action_ids):
            action = self.store.get_action(action_id)
            pending.append((action_id, action.tool_name, action.effect_class))
        return tuple(pending)

    def resume_approval(self, checkpoint_id: str, approvals: dict[str, bool]) -> str:
        checkpoint, run, control = self._approval_checkpoint(checkpoint_id)
        action_to_tool_call = checkpoint.state.get("action_to_tool_call")
        if not isinstance(action_to_tool_call, dict) or set(approvals) != set(action_to_tool_call):
            raise AppError("approval decisions must exactly match the pending checkpoint actions")
        if any(type(approved) is not bool for approved in approvals.values()):
            raise AppError("approval decisions must be explicit booleans")
        skill_version = run.manifest.skill_versions.get("repo_task")
        if not skill_version:
            raise AppError("run manifest does not contain a frozen repo_task skill version")
        outcome = asyncio.run(
            self._runtime(
                RuntimeConfig(
                    Path(control.workspace),
                    self._materialize(skill_version),
                    control.allowed_commands,
                )
            ).resume_approval(run, checkpoint_id, approvals)
        )
        self._project_run_outcomes(control.goal_id, run.run_id)
        if outcome.waiting_action_ids:
            return f"waiting_approval:{outcome.checkpoint_id}"
        return outcome.output or ""

    def _approval_checkpoint(self, checkpoint_id: str):
        try:
            checkpoint = self.store.get_checkpoint(checkpoint_id)
            run = self.store.get_object("run", checkpoint.run_id, RunRecord)
            control = self.store.get_object("runtime_control", run.run_id, RuntimeControl)
        except StateConflict as error:
            raise AppError("checkpoint does not have a durable runtime control record") from error
        if (
            control.run_id != run.run_id
            or run.status is not RunStatus.WAITING
            or run.status_reason != "user_approval"
            or self.store.latest_checkpoint(run.run_id) != checkpoint
            or self.goal_task(control.goal_id).task_id != run.task_id
        ):
            raise AppError("checkpoint is not the exact current user approval checkpoint")
        return checkpoint, run, control

    def _runtime(self, config: RuntimeConfig) -> RepoTaskRuntime:
        return RepoTaskRuntime(self.store, SqliteStepStore(database=self.store.database), self.config.model, config)

    def goal_evidence_packet(self, goal_id: str) -> dict[str, tuple[dict[str, str], ...]]:
        """Return a small, stable packet of completed current-goal exploration records."""
        self.store.get_object("goal", goal_id, GoalContract)
        loop_ids = {
            loop.loop_id for loop in self.store.list_objects("loop", LoopRecord) if loop.goal_id == goal_id
        }
        task_ids = {
            task.task_id for task in self.store.list_objects("task", TaskRecord) if task.loop_id in loop_ids
        }
        runs = {
            run.run_id: run
            for run in self.store.list_objects("run", RunRecord)
            if run.task_id in task_ids and run.status is RunStatus.COMPLETED
        }
        expected_scope = f"goal:{goal_id}:workspace:{content_digest(str(self.config.workspace.resolve()))}"
        source_records: dict[str, SourceRecord] = {}
        evidence_records: dict[str, EvidenceRecord] = {}
        for listed_report in self.store.list_objects("exploration_report", ExplorationReport):
            try:
                report, status = self.store.get_object_with_status(
                    "exploration_report", listed_report.report_id, ExplorationReport
                )
                brief = self.store.get_object("exploration_brief", report.brief_id, ExplorationBrief)
            except StateConflict:
                continue
            if status != "complete" or brief.task_id not in task_ids:
                continue
            report_sources: dict[str, SourceRecord] = {}
            report_evidence: dict[str, EvidenceRecord] = {}
            try:
                for source_id in report.source_ids:
                    source = self.store.get_object("source", source_id, SourceRecord)
                    if (
                        source.run_id not in runs
                        or source.purpose != "goal_exploration"
                        or source.scope != expected_scope
                    ):
                        raise AppError("exploration source is outside the current goal")
                    report_sources[source_id] = source
                for evidence_id in report.evidence_ids:
                    record = self.store.get_object("evidence", evidence_id, EvidenceRecord)
                    if (
                        record.run_id not in runs
                        or record.purpose != "goal_exploration"
                        or record.scope != expected_scope
                        or not record.provenance_ids
                        or not set(record.provenance_ids) <= report_sources.keys()
                        or any(
                            report_sources[source_id].run_id != record.run_id for source_id in record.provenance_ids
                        )
                    ):
                        raise AppError("exploration evidence is outside the current goal")
                    report_evidence[evidence_id] = record
            except StateConflict:
                continue
            source_records.update(report_sources)
            evidence_records.update(report_evidence)
        sources = tuple(
            {
                "source_id": source.source_id,
                "source_class": source.source_class,
                "locator": source.locator,
                "title": source.title,
            }
            for source in sorted(source_records.values(), key=lambda item: item.source_id)[:8]
        )
        evidence = tuple(
            {
                "evidence_id": record.evidence_id,
                "source_ids": ",".join(sorted(record.provenance_ids)),
                "summary": record.summary,
            }
            for record in sorted(evidence_records.values(), key=lambda item: item.evidence_id)[:8]
        )
        return {"sources": sources, "evidence": evidence}

    def _brief_task(self, report: ExplorationReport) -> str:
        return self.store.get_object("exploration_brief", report.brief_id, ExplorationBrief).task_id

    def _project_run_outcomes(self, goal_id: str, run_id: str) -> None:
        meta = self.meta_loop(goal_id)
        scope = f"goal:{goal_id}:execution"
        actions = [
            action
            for action in self.store.list_actions(run_id)
            if action.status in {ActionStatus.SUCCEEDED, ActionStatus.FAILED}
        ]
        for action in actions:
            evidence_type = (
                "execution_diff"
                if action.tool_name in {"write_file", "edit_file", "create_directory"}
                else "execution_test"
                if action.tool_name in {"run_command", "check_command", "start_command", "stop_command"}
                else "execution_cost"
            )
            record = evidence_from_action(
                action,
                f"governed {evidence_type.removeprefix('execution_')} action",
                scope=scope,
                purpose="execution_evidence",
            ).model_copy(
                update={
                    "evidence_type": evidence_type,
                    "source_class": "runtime_action",
                    "cost_bucket": "governed_action_count",
                }
            )
            self.store.put_immutable_object("evidence", record.evidence_id, run_id, "recorded", record)
            telemetry = project_meta_telemetry(record)
            telemetry_id = content_digest({"action": action.action_id, "telemetry": telemetry})
            self.store.put_immutable_object(
                "meta_telemetry", telemetry_id, meta.loop_id, "recorded", _Telemetry(**telemetry)
            )
        run = self.store.get_object("run", run_id, RunRecord)
        if actions and run.status is RunStatus.COMPLETED:
            action = actions[0]
            cost = evidence_from_action(
                action,
                f"{len(actions)} governed actions completed",
                scope=scope,
                purpose="execution_evidence",
            ).model_copy(
                update={
                    "evidence_type": "execution_cost",
                    "source_class": "runtime_action_count",
                    "cost_bucket": "governed_action_count",
                }
            )
            self.store.put_immutable_object("evidence", cost.evidence_id, run_id, "recorded", cost)
            telemetry = project_meta_telemetry(cost)
            telemetry_id = content_digest({"action": action.action_id, "telemetry": telemetry})
            self.store.put_immutable_object(
                "meta_telemetry", telemetry_id, meta.loop_id, "recorded", _Telemetry(**telemetry)
            )

    def execution_evidence(self, run_id: str) -> tuple[EvidenceRecord, ...]:
        self.store.get_object("run", run_id, RunRecord)
        return tuple(
            record
            for record in self.store.list_objects("evidence", EvidenceRecord)
            if record.run_id == run_id and record.purpose == "execution_evidence"
        )

    def meta_telemetry(self, goal_id: str) -> tuple[_Telemetry, ...]:
        return tuple(self.store.list_objects_for_parent("meta_telemetry", self.meta_loop(goal_id).loop_id, _Telemetry))

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

    def record_learning_signal_on_loop(
        self, loop_id: str, *, category: str, severity: int, recurrence: int, evidence_ids: tuple[str, ...]
    ) -> str | None:
        loop = self.store.get_object("loop", loop_id, LoopRecord)
        if loop.kind is not LoopKind.META:
            raise AppError("learning signals require a meta loop")
        signal = LearningSignal(
            signal_id=f"signal:{secrets.token_urlsafe(18)}",
            loop_id=loop_id,
            category=category,
            severity=severity,
            recurrence=recurrence,
            blocks_goal=False,
            user_corrected=False,
            evidence_ids=evidence_ids,
        )
        self.store.put_immutable_object("pending_learning_signal", signal.signal_id, loop_id, "queued", signal)
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

    def learning_loop(self, ticket_id: str) -> LoopRecord:
        ticket = LearningEngine(self.store, self.config.learning_budget).get_ticket(ticket_id)
        return self.store.get_object("loop", ticket.loop_id, LoopRecord)

    def record_learning_attribution(
        self,
        case_id: str,
        *,
        hypotheses: tuple[str, ...],
        earliest_divergence: str,
        mutation_target: str,
        rejected_targets: tuple[str, ...],
    ) -> AttributionRecord:
        case = self.store.get_object("case", case_id, CaseRecord)
        return LearningEngine(self.store, self.config.learning_budget).record_attribution(
            case, hypotheses, earliest_divergence, mutation_target, rejected_targets
        )

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

    def run_public_candidate_comparison(
        self,
        candidate_version_id: str,
        cases: tuple[EvalCase, ...] | Path,
        *,
        execute: Callable[[ArtifactVersion, EvalCase], CaseOutcome],
    ) -> EvalRun:
        candidate = self.artifact(candidate_version_id)
        champion = self.artifact(self.active_version(candidate.artifact_id))
        try:
            public_cases = (
                tuple(EvalCase.model_validate(item) for item in json.loads(cases.read_text(encoding="utf-8")))
                if isinstance(cases, Path)
                else cases
            )
            run = run_public_comparison(self.config.approved_protocol, champion, candidate, public_cases, execute)
            self.store.put_immutable_object("public_eval_run", run.eval_run_id, None, "recorded", run)
            return run
        except EvaluationError as error:
            raise AppError(str(error)) from error

    def create_eval_request(self, candidate_version_id: str):
        candidate = self.artifact(candidate_version_id)
        champion = self.artifact(self.active_version(candidate.artifact_id))
        try:
            protocol, status = self.store.get_object_with_status(
                "eval_protocol", self.config.approved_protocol.protocol_id, EvalProtocol
            )
            if status != "approved" or protocol != self.config.approved_protocol:
                raise AppError("approved evaluation protocol does not match app configuration")
            return write_eval_request(self.store, protocol, champion, candidate, self.data_dir / "eval-inbox")
        except (EvaluationError, StateConflict) as error:
            raise AppError(str(error)) from error

    def pending_eval_request(self, candidate_version_id: str):
        requests = [
            request
            for request, consumed in self.store.list_eval_requests()
            if request.challenger_version_id == candidate_version_id and consumed is None
        ]
        return max(requests, key=lambda request: request.expires_at) if requests else None

    def evaluate_candidate(self, candidate_version_id: str) -> EvalRun:
        existing = [
            run
            for run in self.store.list_objects("eval_run", EvalRun)
            if run.challenger_version_id == candidate_version_id
        ]
        if existing:
            return existing[-1]
        request = self.pending_eval_request(candidate_version_id) or self.create_eval_request(candidate_version_id)
        receipt_path = Path(request.receipt_path)
        if receipt_path.exists():
            return self.import_eval_receipt(receipt_path)
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

    def record_capability(
        self,
        version_id: str,
        *,
        task_type: str,
        environment: str,
        tools: tuple[str, ...],
        risk: str,
        outcome: str,
        cost: int,
        evidence_ids: tuple[str, ...],
    ) -> CapabilityObservation:
        self.artifact(version_id)
        observation = CapabilityObservation(
            version_id=version_id,
            task_type=task_type,
            environment=environment,
            tools=tools,
            risk=risk,
            outcome=outcome,
            cost=cost,
            evidence_ids=evidence_ids,
        )
        CapabilityLedger(self.store).record(observation)
        return observation

    def lookup_capability(
        self, version_id: str, task_type: str, environment: str, tools: tuple[str, ...], risk: str
    ) -> tuple[CapabilityObservation, ...]:
        return CapabilityLedger(self.store).lookup(version_id, task_type, environment, tools, risk)

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
