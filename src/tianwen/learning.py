from __future__ import annotations

import re
from typing import Literal

from pydantic import Field

from tianwen.domain import (
    ArtifactStatus,
    ArtifactVersion,
    BudgetLimit,
    CaseRecord,
    FrozenModel,
    LessonRecord,
    LoopKind,
    LoopRecord,
    TaskKind,
    TaskRecord,
    content_digest,
)
from tianwen.store import StateConflict, StateStore


class MutationNotAllowed(RuntimeError):
    """Raised when a learning recommendation tries to mutate an out-of-scope layer."""


class LearningSignal(FrozenModel):
    signal_id: str
    loop_id: str
    category: str
    severity: int = Field(ge=0)
    recurrence: int = Field(ge=0)
    blocks_goal: bool
    user_corrected: bool
    evidence_ids: tuple[str, ...]
    source: Literal["legacy", "repeated_attributable_issue", "explicit_user_correction"] = "legacy"
    observed_gap_id: str | None = None
    problem_fingerprint: str | None = None
    capability_scope: str | None = None


class LearningTicket(FrozenModel):
    ticket_id: str
    signal_id: str
    parent_loop_id: str
    loop_id: str
    task_id: str
    evidence_ids: tuple[str, ...]
    problem_statement: str
    learning_budget: BudgetLimit
    max_experiments: int = 3
    allowed_mutation_targets: tuple[str, ...] = ("repo_task_skill",)
    stop_reasons: tuple[str, ...] = (
        "max_experiments_reached",
        "budget_exhausted",
        "insufficient_evidence",
        "safety_boundary",
    )
    investigation_mode: bool = False
    problem_fingerprint: str | None = None
    capability_scope: str | None = None


class AttributionRecord(FrozenModel):
    attribution_id: str
    case_id: str
    observed_outcome: str
    reproduction_scope: str
    earliest_divergence: str
    hypotheses: tuple[str, ...]
    distinguishing_experiment: str
    mutation_target: str
    rejected_targets: tuple[str, ...]
    other_layers_reason: str
    recommendation_only: bool


def _problem(signal: LearningSignal) -> str:
    return (
        f"Learning signal: {signal.category} (severity={signal.severity}, "
        f"recurrence={signal.recurrence}, blocks_goal={signal.blocks_goal}, "
        f"user_corrected={signal.user_corrected})."
    )


def _ticket_id(signal: LearningSignal) -> str:
    return content_digest({"learning_signal": signal.signal_id})


def _section(markdown: str, name: str) -> str | None:
    match = re.search(rf"(?ms)^##\s+{re.escape(name)}\s*\n(.*?)(?=^##\s|\Z)", markdown)
    return None if match is None else match.group(1).strip()


def _front_matter(markdown: str) -> str | None:
    match = re.match(r"(?s)\A(---\n.*?\n---)(?:\n|\Z)", markdown)
    return None if match is None else match.group(1)


class LearningEngine:
    def __init__(self, store: StateStore, learning_budget: BudgetLimit) -> None:
        self.store = store
        self.learning_budget = learning_budget

    def enqueue(self, signal: LearningSignal) -> str | None:
        self.store.put_immutable_object("learning_signal", signal.signal_id, signal.loop_id, "recorded", signal)
        high_value = signal.user_corrected or signal.blocks_goal or signal.severity >= 4 or signal.recurrence >= 2
        if not high_value:
            return None
        ticket_id = _ticket_id(signal)
        try:
            existing = self.get_ticket(ticket_id)
        except StateConflict:
            existing = None
        if existing is not None:
            if existing.signal_id != signal.signal_id:
                raise StateConflict(f"conflicting learning signal for {ticket_id}")
            return ticket_id
        child_id = content_digest({"learning_ticket": ticket_id, "kind": "child_loop"})
        task_id = content_digest({"learning_ticket": ticket_id, "kind": "task"})
        ticket = LearningTicket(
            ticket_id=ticket_id,
            signal_id=signal.signal_id,
            parent_loop_id=signal.loop_id,
            loop_id=child_id,
            task_id=task_id,
            evidence_ids=signal.evidence_ids,
            problem_statement=_problem(signal),
            learning_budget=self.learning_budget,
            investigation_mode=(
                signal.severity >= 4
                and any(word in signal.category.casefold() for word in ("safety", "security", "unsafe"))
            ),
            problem_fingerprint=signal.problem_fingerprint,
            capability_scope=signal.capability_scope,
        )
        parent = self.store.get_object("loop", signal.loop_id, LoopRecord)
        child = LoopRecord(
            loop_id=child_id,
            goal_id=parent.goal_id,
            parent_loop_id=parent.loop_id,
            kind=LoopKind.CHILD,
            objective=ticket.problem_statement,
            budget=self.learning_budget,
        )
        task = TaskRecord(
            task_id=task_id,
            loop_id=child_id,
            kind=TaskKind.LEARNING,
            objective=ticket.problem_statement,
            acceptance=("resolve competing hypotheses within the frozen budget",),
        )
        self.store.create_learning_ticket(signal.loop_id, child, task, ticket_id, ticket)
        return ticket_id

    def get_ticket(self, ticket_id: str) -> LearningTicket:
        return self.store.get_object("learning_ticket", ticket_id, LearningTicket)

    def get_learning_task(self, ticket_id: str) -> TaskRecord:
        return self.store.get_object("task", self.get_ticket(ticket_id).task_id, TaskRecord)

    def create_case(
        self,
        ticket_id: str,
        *,
        gap_id: str | None = None,
        problem_statement: str | None = None,
        evidence_ids: tuple[str, ...] | None = None,
        problem_fingerprint: str | None = None,
        capability_scope: str | None = None,
    ) -> CaseRecord:
        ticket = self.get_ticket(ticket_id)
        governed = gap_id is not None
        case = CaseRecord(
            case_id=(
                content_digest({"learning_ticket": ticket_id, "case": "gap", "gap": gap_id})
                if governed
                else content_digest({"learning_ticket": ticket_id, "case": "observed"})
            ),
            loop_id=ticket.loop_id,
            problem=problem_statement or ticket.problem_statement,
            outcome=f"gap:{gap_id}" if governed else f"signal:{ticket.signal_id}",
            evidence_ids=evidence_ids if evidence_ids is not None else ticket.evidence_ids,
            hypotheses=(),
            ticket_id=ticket_id if governed else None,
            observed_gap_id=gap_id,
            problem_fingerprint=problem_fingerprint,
            capability_scope=capability_scope,
        )
        self.store.put_immutable_object("case", case.case_id, ticket_id, "recorded", case)
        return case

    def record_attribution(
        self,
        case: CaseRecord,
        hypotheses: tuple[str, ...],
        earliest_divergence: str,
        mutation_target: str,
        rejected_targets: tuple[str, ...],
    ) -> AttributionRecord:
        deterministic = case.outcome.startswith("deterministic_verifier_failure:")
        if len(hypotheses) < 2 and not deterministic:
            raise StateConflict("attribution requires at least two hypotheses")
        if not hypotheses or not earliest_divergence.strip():
            raise StateConflict("attribution requires hypotheses and earliest divergence")
        record = AttributionRecord(
            attribution_id=content_digest(
                {
                    "case": case.case_id,
                    "hypotheses": hypotheses,
                    "earliest_divergence": earliest_divergence,
                    "mutation_target": mutation_target,
                    "rejected_targets": rejected_targets,
                }
            ),
            case_id=case.case_id,
            observed_outcome=case.outcome,
            reproduction_scope=(f"loop={case.loop_id}; problem={case.problem}; evidence={','.join(case.evidence_ids)}"),
            earliest_divergence=earliest_divergence,
            hypotheses=hypotheses,
            distinguishing_experiment=("Run a bounded comparison that changes one stated hypothesis at a time."),
            mutation_target=mutation_target,
            rejected_targets=rejected_targets,
            other_layers_reason="Only repo_task_skill is in the first-slice mutation scope.",
            recommendation_only=mutation_target != "repo_task_skill",
        )
        self.store.put_immutable_object("attribution", record.attribution_id, case.case_id, "recorded", record)
        if record.recommendation_only:
            raise MutationNotAllowed(f"mutation target is not allowed: {mutation_target}")
        return record

    def accept_lesson(self, lesson: LessonRecord) -> None:
        if lesson.status != "accepted":
            raise StateConflict("only accepted lessons may enter the governed learning chain")
        if not lesson.when or not lesson.not_when or not lesson.evidence_ids:
            raise StateConflict("accepted lessons require conditions, counterexamples, and evidence")
        self.store.put_immutable_object("lesson", lesson.lesson_id, None, lesson.status, lesson)

    def create_repo_task_candidate(
        self, parent: ArtifactVersion, lesson: LessonRecord, candidate_markdown: str
    ) -> ArtifactVersion:
        if lesson.status != "accepted":
            raise StateConflict("candidate creation requires an accepted persisted lesson")
        try:
            persisted = self.store.get_object("lesson", lesson.lesson_id, LessonRecord)
        except StateConflict as error:
            raise StateConflict("candidate creation requires an accepted persisted lesson") from error
        if persisted != lesson:
            raise StateConflict("candidate creation requires an accepted persisted lesson")
        if parent.artifact_type != "repo_task_skill":
            raise StateConflict("candidate parent must have artifact_type repo_task_skill")
        parent_front_matter = _front_matter(parent.content)
        if parent_front_matter is None or _front_matter(candidate_markdown) != parent_front_matter:
            raise StateConflict("candidate must preserve parent front matter")
        required = {
            "Conditions": tuple(f"When: {value}" for value in lesson.when),
            "Counterexamples": tuple(f"Not when: {value}" for value in lesson.not_when),
            "Evidence": tuple(
                [
                    *(f"Evidence: {value}" for value in lesson.evidence_ids),
                    *(f"Counterevidence: {value}" for value in lesson.counterevidence_ids),
                ]
            ),
        }
        for name, required_lines in required.items():
            body = _section(candidate_markdown, name)
            if not body or any(line not in body for line in required_lines):
                raise StateConflict(f"candidate {name} section is missing required lesson content")
        digest = content_digest(candidate_markdown)
        candidate = ArtifactVersion(
            artifact_id=parent.artifact_id,
            artifact_type=parent.artifact_type,
            version_id=digest,
            parent_version_id=parent.version_id,
            content_digest=digest,
            content=candidate_markdown,
            evidence_ids=lesson.evidence_ids,
            status=ArtifactStatus.CANDIDATE,
        )
        self.store.put_immutable_object(
            "artifact", candidate.version_id, parent.version_id, candidate.status.value, candidate
        )
        return candidate
