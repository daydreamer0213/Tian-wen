from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from datetime import UTC, datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator


def utc_now() -> datetime:
    return datetime.now(UTC)


def content_digest(value: BaseModel | Mapping[str, Any] | str | bytes) -> str:
    if isinstance(value, BaseModel):
        value = value.model_dump(mode="json")
    if isinstance(value, Mapping):
        value = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    if isinstance(value, str):
        value = value.encode("utf-8")
    return "sha256:" + hashlib.sha256(value).hexdigest()


class FrozenModel(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class LoopKind(str, Enum):  # noqa: UP042
    USER = "user"
    META = "meta"
    CHILD = "child"


class TaskKind(str, Enum):  # noqa: UP042
    EXECUTION = "execution"
    LEARNING = "learning"
    EVALUATION = "evaluation"


class RunStatus(str, Enum):  # noqa: UP042
    QUEUED = "queued"
    RUNNING = "running"
    WAITING = "waiting"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ActionStatus(str, Enum):  # noqa: UP042
    PROPOSED = "proposed"
    WAITING_APPROVAL = "waiting_approval"
    APPROVED = "approved"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    DENIED = "denied"
    CANCELLED = "cancelled"
    UNKNOWN = "unknown"


class ArtifactStatus(str, Enum):  # noqa: UP042
    CANDIDATE = "candidate"
    SHADOW = "shadow"
    ACTIVE = "active"
    REJECTED = "rejected"
    RETIRED = "retired"
    INVALIDATED_BY_DELETION = "invalidated_by_deletion"


class ExplorationStopReason(str, Enum):  # noqa: UP042
    SUFFICIENT = "sufficient"
    NO_NEW_EVIDENCE = "no_new_evidence"
    BUDGET_EXHAUSTED = "budget_exhausted"
    SOURCE_UNAVAILABLE = "source_unavailable"
    RISK_BOUNDARY = "risk_boundary"
    INSUFFICIENT_EVIDENCE = "insufficient_evidence"


class BudgetLimit(FrozenModel):
    model_requests: int = Field(ge=0)
    tool_calls: int = Field(ge=0)
    tokens: int = Field(ge=0)
    wall_seconds: int = Field(default=3600, ge=0)
    child_loops: int = Field(default=3, ge=0)
    action_effects: int = Field(default=20, ge=0)


class BudgetUsage(FrozenModel):
    model_requests: int = Field(default=0, ge=0)
    tool_calls: int = Field(default=0, ge=0)
    tokens: int = Field(default=0, ge=0)
    wall_seconds: int = Field(default=0, ge=0)
    child_loops: int = Field(default=0, ge=0)
    action_effects: int = Field(default=0, ge=0)


class GoalContract(FrozenModel):
    goal_id: str
    objective: str
    success_criteria: tuple[str, ...]
    constraints: tuple[str, ...]
    authorization: tuple[str, ...]
    budget: BudgetLimit
    created_at: datetime = Field(default_factory=utc_now)


class LoopRecord(FrozenModel):
    loop_id: str
    goal_id: str
    parent_loop_id: str | None = None
    kind: LoopKind
    objective: str
    budget: BudgetLimit
    created_at: datetime = Field(default_factory=utc_now)


class TaskRecord(FrozenModel):
    task_id: str
    loop_id: str
    kind: TaskKind
    objective: str
    acceptance: tuple[str, ...]
    created_at: datetime = Field(default_factory=utc_now)


class RunManifest(FrozenModel):
    workflow_version: str
    schema_version: str
    pydantic_ai_version: str
    harness_version: str
    model_id: str
    prompt_digest: str
    skill_versions: dict[str, str]
    skill_digests: dict[str, str]
    policy_digest: str
    tool_contract_digest: str
    goal_contract_digest: str
    workspace_digest: str
    trial_id: str | None = None
    round_id: str | None = None
    trial_manifest_digest: str | None = None

    @model_validator(mode="after")
    def validate_schema_bindings(self) -> RunManifest:
        bindings = (self.trial_id, self.round_id, self.trial_manifest_digest)
        if self.schema_version == "1" and any(value is not None for value in bindings):
            raise ValueError("v1 run manifest cannot contain alpha bindings")
        if self.schema_version == "2" and any(value is None for value in bindings):
            raise ValueError("v2 run manifest requires alpha trial bindings")
        if self.schema_version == "2" and not self.prompt_digest.strip():
            raise ValueError("v2 run manifest requires a prompt digest")
        if self.schema_version not in {"1", "2"}:
            raise ValueError("unsupported run manifest schema")
        return self


class RunRecord(FrozenModel):
    run_id: str
    task_id: str
    status: RunStatus
    status_reason: str | None = None
    manifest: RunManifest
    created_at: datetime = Field(default_factory=utc_now)


class ActionRecord(FrozenModel):
    action_id: str
    run_id: str
    tool_call_id: str
    tool_name: str
    args_json: str
    args_digest: str
    effect_class: str
    idempotency_key: str
    status: ActionStatus
    result_digest: str | None = None
    created_at: datetime = Field(default_factory=utc_now)


class EventRecord(FrozenModel):
    run_id: str
    sequence: int = Field(ge=1)
    kind: str
    payload: dict[str, Any]
    created_at: datetime = Field(default_factory=utc_now)


class CheckpointRecord(FrozenModel):
    checkpoint_id: str
    run_id: str
    event_sequence: int = Field(ge=0)
    state_digest: str
    state: dict[str, Any]
    created_at: datetime = Field(default_factory=utc_now)


class ExplorationBrief(FrozenModel):
    brief_id: str
    task_id: str
    question: str
    decision_use: str
    known_evidence_ids: tuple[str, ...]
    unknowns: tuple[str, ...]
    allowed_local_roots: tuple[str, ...]
    allowed_source_classes: tuple[str, ...]
    allowed_domains: tuple[str, ...]
    max_searches: int = Field(ge=0)
    max_fetches: int = Field(ge=0)
    max_tokens: int = Field(ge=0)
    max_cost_microunits: int = Field(ge=0)
    wall_seconds: int = Field(ge=0)
    expected_outputs: tuple[str, ...]
    sufficiency_criteria: tuple[str, ...]
    stop_conditions: tuple[ExplorationStopReason, ...]
    created_at: datetime = Field(default_factory=utc_now)


class ExplorationUsage(FrozenModel):
    searches: int = Field(default=0, ge=0)
    fetches: int = Field(default=0, ge=0)
    admitted_tokens: int = Field(default=0, ge=0)
    cost_microunits: int = Field(default=0, ge=0)


class SourceRecord(FrozenModel):
    source_id: str
    run_id: str
    action_id: str
    source_class: str
    locator: str
    publisher_or_repository: str
    title: str
    published_or_version: str | None = None
    retrieved_at: datetime
    content_digest: str
    scope: str
    purpose: str
    fully_read: bool
    conflict: bool = False
    trust_status: str = "untrusted_external"


class UntrustedSourceExcerpt(FrozenModel):
    source_id: str
    evidence_id: str
    text: str = Field(max_length=1000)
    label: str = "untrusted_source_data"


class ExplorationReport(FrozenModel):
    report_id: str
    brief_id: str
    answered_unknowns: tuple[str, ...]
    evidence_ids: tuple[str, ...]
    source_ids: tuple[str, ...]
    conflicting_source_ids: tuple[str, ...]
    remaining_unknowns: tuple[str, ...]
    planning_impact: str
    stop_reason: ExplorationStopReason
    created_at: datetime = Field(default_factory=utc_now)


class EvidenceRecord(FrozenModel):
    evidence_id: str
    run_id: str
    action_id: str | None = None
    evidence_type: str
    result_class: str
    effect_class: str
    version_bucket: str
    cost_bucket: str
    needed_user: bool
    safety_category: str
    summary: str
    payload_digest: str
    scope: str
    purpose: str
    source_class: str
    sensitivity: str
    provenance_ids: tuple[str, ...]
    untrusted_excerpt: UntrustedSourceExcerpt | None = None
    retention_until: datetime | None = None

    @model_validator(mode="after")
    def validate_untrusted_excerpt_links(self) -> EvidenceRecord:
        excerpt = self.untrusted_excerpt
        if excerpt is not None:
            if excerpt.evidence_id != self.evidence_id:
                raise ValueError("untrusted excerpt must reference its outer evidence")
            if excerpt.source_id not in self.provenance_ids:
                raise ValueError("untrusted excerpt source must be in provenance_ids")
        return self


class CaseRecord(FrozenModel):
    case_id: str
    loop_id: str
    problem: str
    outcome: str
    evidence_ids: tuple[str, ...]
    hypotheses: tuple[str, ...]
    ticket_id: str | None = None
    observed_gap_id: str | None = None
    problem_fingerprint: str | None = None
    capability_scope: str | None = None


class LessonRecord(FrozenModel):
    lesson_id: str
    case_ids: tuple[str, ...]
    claim: str
    when: tuple[str, ...]
    not_when: tuple[str, ...]
    evidence_ids: tuple[str, ...]
    counterevidence_ids: tuple[str, ...]
    confidence_basis: str
    target_scope: str
    status: str = "candidate"


class ArtifactVersion(FrozenModel):
    artifact_id: str
    artifact_type: str
    version_id: str
    parent_version_id: str | None
    content_digest: str
    content: str
    evidence_ids: tuple[str, ...]
    status: ArtifactStatus


class EvalProtocol(FrozenModel):
    protocol_id: str
    task_set_digest: str
    evaluator_digest: str
    harness_digest: str
    tool_digest: str
    budget_digest: str
    environment_digest: str
    model_digest: str


class EvalRun(FrozenModel):
    eval_run_id: str
    protocol_id: str
    champion_version_id: str
    challenger_version_id: str
    hard_gate_passed: bool
    metrics: dict[str, float]
    failure_categories: tuple[str, ...]


class PromotionRecord(FrozenModel):
    promotion_id: str
    artifact_id: str
    from_version_id: str
    to_version_id: str
    eval_run_id: str | None
    approval_receipt_id: str | None
    approved_by: str
    reason: str
    created_at: datetime = Field(default_factory=utc_now)


class EvalRequest(FrozenModel):
    request_id: str
    protocol_id: str
    champion_version_id: str
    champion_digest: str
    champion_snapshot: str
    challenger_version_id: str
    challenger_digest: str
    challenger_snapshot: str
    challenge: str
    receipt_path: str
    expires_at: datetime


class EvalReceipt(FrozenModel):
    receipt_id: str
    request_id: str
    protocol_id: str
    champion_digest: str
    challenger_digest: str
    challenge: str
    hard_gate_passed: bool
    metrics: dict[str, float]
    failure_categories: tuple[str, ...]
    issued_at: datetime
    signature_b64: str


class PromotionRequest(FrozenModel):
    request_id: str
    artifact_id: str
    subject_digest: str
    eval_run_id: str
    challenge: str
    expires_at: datetime


class ApprovalReceipt(FrozenModel):
    receipt_id: str
    action: str
    subject_digest: str
    eval_run_id: str
    challenge: str
    approved_by: str
    source: str = "local_user_cli"
    created_at: datetime = Field(default_factory=utc_now)
