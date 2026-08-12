from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Any

from pydantic import Field

from tianwen.domain import (
    ArtifactStatus,
    ArtifactVersion,
    FrozenModel,
    LessonRecord,
    content_digest,
    utc_now,
)
from tianwen.evidence import _contains_credential
from tianwen.store import StateConflict, StateStore

_MAX_CLAIM_LENGTH = 1000
_EXTERNAL_SOURCE_CLASSES = {"external", "untrusted_external", "model", "model_derived"}
_RESTRICTED_PURPOSES = {"authorization", "user_preference"}
_AUTHORITY_CLAIM = re.compile(
    r"(?:"
    r"\b(?:change|grant)\s+(?:the\s+)?(?:authority|authorities|permissions?|goals?|preferences?)\b"
    r"|\b(?:has|have|holds?)\s+(?:the\s+)?(?:authority|permissions?|goals?)\b"
    r"|\b(?:user(?:'s)?\s+)?preferences?\s+(?:is|are)\b"
    r"|\b(?:user(?:'s)?\s+)?goals?\s+(?:is|are)\b"
    r"|\bauthorization\b"
    r")",
    re.IGNORECASE,
)


class MemoryProposal(FrozenModel):
    user_scope: str
    workspace_scope: str
    purpose: str
    source_class: str
    claim: str
    conditions: dict[str, str] = Field(default_factory=dict)
    provenance_ids: tuple[str, ...]
    sensitivity: str
    retention_until: datetime | None


class MemoryRecord(MemoryProposal):
    memory_id: str
    active: bool = True


class MemoryNeed(FrozenModel):
    user_scope: str
    workspace_scope: str
    purpose: str
    query: str
    conditions: dict[str, str] = Field(default_factory=dict)


class EvidencePacketItem(FrozenModel):
    memory_id: str
    claim: str
    evidence_ids: tuple[str, ...]


class EvidencePacket(FrozenModel):
    items: tuple[EvidencePacketItem, ...] = ()


class DeletionReceipt(FrozenModel):
    affected_object_ids: tuple[str, ...]
    deleted_at: datetime


class CapabilityObservation(FrozenModel):
    version_id: str
    task_type: str
    environment: str
    tools: tuple[str, ...]
    risk: str
    outcome: str
    cost: int
    evidence_ids: tuple[str, ...]


class MemoryFirewall:
    def reject_reason(self, proposal: MemoryProposal) -> str | None:
        required = (
            proposal.user_scope,
            proposal.workspace_scope,
            proposal.purpose,
            proposal.source_class,
            *proposal.provenance_ids,
        )
        if not proposal.provenance_ids or any(not value.strip() for value in required):
            return "scope, purpose, source, and provenance are required"
        user_scope = proposal.user_scope.strip()
        workspace_scope = proposal.workspace_scope.strip()
        purpose = proposal.purpose.strip().casefold()
        source_class = proposal.source_class.strip().casefold().replace("-", "_")
        if user_scope in {"global", "*"} or workspace_scope in {"global", "*"}:
            return "global scope is not allowed"
        if proposal.retention_until is None:
            return "expiry policy is required"
        if proposal.retention_until <= utc_now():
            return "expiry policy is expired"
        if source_class in _EXTERNAL_SOURCE_CLASSES and (
            purpose in _RESTRICTED_PURPOSES or _AUTHORITY_CLAIM.search(proposal.claim)
        ):
            return "external/model-derived authority claim"
        if _contains_credential(proposal.claim) or any(
            _contains_credential(value) for value in proposal.conditions.values()
        ):
            return "credential-like value"
        if len(proposal.claim) > _MAX_CLAIM_LENGTH:
            return "claim is oversized"
        return None

    def accept(self, proposal: MemoryProposal) -> MemoryRecord:
        reason = self.reject_reason(proposal)
        if reason is not None:
            raise ValueError(reason)
        values = proposal.model_dump(mode="json")
        memory_id = content_digest(values)
        return MemoryRecord(memory_id=memory_id, **proposal.model_dump())


class MemoryStore:
    def __init__(self, state: StateStore) -> None:
        self.state = state

    def save(self, memory: MemoryRecord) -> None:
        proposal = MemoryProposal.model_validate(
            memory.model_dump(exclude={"memory_id", "active"})
        )
        validated = MemoryFirewall().accept(proposal)
        if memory.memory_id != validated.memory_id:
            raise StateConflict(f"memory id does not match governed content for {memory.memory_id}")
        with self.state._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            existing = connection.execute(
                "SELECT claim, conditions_json, provenance_json FROM tw_memories WHERE memory_id = ?",
                (memory.memory_id,),
            ).fetchone()
            if existing is not None:
                if (existing["claim"], existing["conditions_json"], existing["provenance_json"]) != (
                    memory.claim,
                    _json(memory.conditions),
                    _json(memory.provenance_ids),
                ):
                    raise StateConflict(f"conflicting memory replay for {memory.memory_id}")
                return
            connection.execute(
                """
                INSERT INTO tw_memories
                    (memory_id, user_scope, workspace_scope, purpose, source_class, claim,
                     conditions_json, provenance_json, sensitivity, retention_until, active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    memory.memory_id,
                    memory.user_scope,
                    memory.workspace_scope,
                    memory.purpose,
                    memory.source_class,
                    memory.claim,
                    _json(memory.conditions),
                    _json(memory.provenance_ids),
                    memory.sensitivity,
                    memory.retention_until.isoformat() if memory.retention_until else None,
                    int(memory.active),
                ),
            )
            connection.execute(
                "INSERT INTO tw_memories_fts (memory_id, claim, conditions) VALUES (?, ?, ?)",
                (memory.memory_id, memory.claim, _json(memory.conditions)),
            )

    def search(self, need: MemoryNeed, limit: int = 8) -> EvidencePacket:
        capped = max(0, min(limit, 8))
        if capped == 0:
            return EvidencePacket()
        params: list[Any] = [need.user_scope, need.workspace_scope, need.purpose]
        query = (
            "SELECT m.memory_id, m.claim, m.conditions_json, m.provenance_json, m.retention_until "
            "FROM tw_memories AS m "
        )
        if need.query.strip():
            query += "JOIN tw_memories_fts AS f ON f.memory_id = m.memory_id "
        query += "WHERE m.user_scope = ? AND m.workspace_scope = ? AND m.purpose = ? AND m.active = 1 "
        if need.query.strip():
            query += "AND tw_memories_fts MATCH ? "
            params.append(need.query)
        query += "ORDER BY m.memory_id"
        with self.state._connect() as connection:
            rows = connection.execute(query, params).fetchall()
        now = utc_now()
        items = []
        for row in rows:
            retention = datetime.fromisoformat(row["retention_until"]) if row["retention_until"] else None
            conditions = json.loads(row["conditions_json"])
            if retention is None or retention <= now or not _conditions_match(conditions, need.conditions):
                continue
            items.append(
                EvidencePacketItem(
                    memory_id=row["memory_id"],
                    claim=row["claim"],
                    evidence_ids=tuple(json.loads(row["provenance_json"])),
                )
            )
            if len(items) == capped:
                break
        return EvidencePacket(items=tuple(items))

    def delete_source(self, provenance_id: str) -> DeletionReceipt:
        with self.state._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            closure = {provenance_id}
            objects = connection.execute("SELECT kind, object_id, status, body_json FROM tw_objects").fetchall()
            changed = True
            while changed:
                changed = False
                for row in objects:
                    if row["object_id"] in closure:
                        continue
                    body = json.loads(row["body_json"])
                    refs = _explicit_references(body, row["kind"])
                    if refs & closure:
                        closure.add(row["object_id"])
                        changed = True
            affected: set[str] = set()
            memory_rows = connection.execute(
                "SELECT memory_id, provenance_json FROM tw_memories WHERE active = 1"
            ).fetchall()
            for row in memory_rows:
                if set(json.loads(row["provenance_json"])) & closure:
                    connection.execute("UPDATE tw_memories SET active = 0 WHERE memory_id = ?", (row["memory_id"],))
                    connection.execute("DELETE FROM tw_memories_fts WHERE memory_id = ?", (row["memory_id"],))
                    affected.add(row["memory_id"])
            active_artifacts: list[str] = []
            for row in objects:
                if row["object_id"] not in closure:
                    continue
                if row["kind"] == "lesson" and row["status"] == "candidate":
                    lesson = LessonRecord.model_validate_json(row["body_json"])
                    invalidated = lesson.model_copy(update={"status": "invalidated_by_deletion"})
                    self.state._put_object(
                        connection, "lesson", lesson.lesson_id, None, invalidated.status, invalidated
                    )
                    affected.add(lesson.lesson_id)
                elif row["kind"] == "artifact":
                    artifact = ArtifactVersion.model_validate_json(row["body_json"])
                    if artifact.status is ArtifactStatus.CANDIDATE:
                        invalidated = artifact.model_copy(update={"status": ArtifactStatus.INVALIDATED_BY_DELETION})
                        self.state._put_object(
                            connection, "artifact", artifact.version_id, None, invalidated.status.value, invalidated
                        )
                        affected.add(artifact.version_id)
                    elif artifact.status is ArtifactStatus.ACTIVE:
                        active_artifacts.append(artifact.version_id)
            event_ids = sorted(affected)
            self.state._append_event(
                connection,
                "governance:memory-deletion",
                "source_deleted",
                {"provenance_id": provenance_id, "affected_object_ids": event_ids},
            )
            if active_artifacts:
                self.state._append_event(
                    connection,
                    "governance:memory-deletion",
                    "governance_incident",
                    {"provenance_id": provenance_id, "artifact_ids": sorted(active_artifacts)},
                )
        return DeletionReceipt(affected_object_ids=tuple(sorted(affected)), deleted_at=utc_now())


class CapabilityLedger:
    def __init__(self, state: StateStore) -> None:
        self.state = state

    def record(self, observation: CapabilityObservation) -> None:
        self.state.put_immutable_object(
            "capability_observation", content_digest(observation), None, "recorded", observation
        )

    def lookup(
        self, version_id: str, task_type: str, environment: str, tools: tuple[str, ...], risk: str
    ) -> tuple[CapabilityObservation, ...]:
        observations = self.state.list_objects("capability_observation", CapabilityObservation)
        return tuple(
            observation
            for observation in observations
            if (
                observation.version_id,
                observation.task_type,
                observation.environment,
                observation.tools,
                observation.risk,
            )
            == (version_id, task_type, environment, tools, risk)
        )


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _conditions_match(memory: dict[str, str], need: dict[str, str]) -> bool:
    return all(memory.get(key) == value for key, value in need.items())


def _explicit_references(value: Any, kind: str) -> set[str]:
    references: set[str] = set()
    if isinstance(value, dict):
        for key, child in value.items():
            if key in {"provenance_ids", "parent_object_ids"} and isinstance(child, list):
                references.update(item for item in child if isinstance(item, str))
            if kind in {"lesson", "artifact"} and key == "evidence_ids" and isinstance(child, list):
                references.update(item for item in child if isinstance(item, str))
            references.update(_explicit_references(child, kind))
    elif isinstance(value, list):
        for child in value:
            references.update(_explicit_references(child, kind))
    return references
