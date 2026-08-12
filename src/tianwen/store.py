from __future__ import annotations

import json
import sqlite3
import time
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any, TypeVar

from pydantic import BaseModel

from tianwen.domain import (
    ActionRecord,
    ActionStatus,
    ApprovalReceipt,
    BudgetLimit,
    BudgetUsage,
    CheckpointRecord,
    EvalRequest,
    EvalRun,
    EventRecord,
    ExplorationBrief,
    ExplorationUsage,
    LoopRecord,
    PromotionRecord,
    PromotionRequest,
    RunRecord,
    content_digest,
    utc_now,
)

T = TypeVar("T", bound=BaseModel)

_IMMUTABLE_GOVERNANCE_KINDS = frozenset(
    {
        "active_pointer",
        "artifact",
        "attribution",
        "capability_observation",
        "case",
        "eval_protocol",
        "eval_run",
        "learning_signal",
        "learning_ticket",
        "lesson",
        "promotion",
    }
)


class StateConflict(RuntimeError):
    """Raised when durable state no longer matches an expected state."""


class BudgetExceeded(RuntimeError):
    """Raised when a budget reservation or charge exceeds its limit."""


class LeaseConflict(RuntimeError):
    """Raised when a different active owner holds a run lease."""


def _add(left: BudgetUsage, right: BudgetUsage) -> BudgetUsage:
    return BudgetUsage(**{field: getattr(left, field) + getattr(right, field) for field in BudgetUsage.model_fields})


def _zero_usage() -> BudgetUsage:
    return BudgetUsage()


def _within_limit(usage: BudgetUsage, limit: BudgetLimit) -> bool:
    return all(getattr(usage, field) <= getattr(limit, field) for field in BudgetUsage.model_fields)


class StateStore:
    def __init__(self, database: Path) -> None:
        self.database = database

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.database)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA busy_timeout=5000")
        try:
            yield connection
        except BaseException:
            connection.rollback()
            raise
        else:
            connection.commit()
        finally:
            connection.close()

    def initialize(self) -> None:
        with self._connect() as connection:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute("PRAGMA synchronous=FULL")
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS tw_objects (
                    kind TEXT NOT NULL,
                    object_id TEXT NOT NULL,
                    parent_id TEXT,
                    status TEXT NOT NULL,
                    body_json TEXT NOT NULL,
                    body_digest TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (kind, object_id)
                );

                CREATE TABLE IF NOT EXISTS tw_events (
                    run_id TEXT NOT NULL,
                    sequence INTEGER NOT NULL,
                    kind TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    PRIMARY KEY (run_id, sequence)
                );

                CREATE TABLE IF NOT EXISTS tw_checkpoints (
                    checkpoint_id TEXT PRIMARY KEY,
                    run_id TEXT NOT NULL,
                    event_sequence INTEGER NOT NULL,
                    state_digest TEXT NOT NULL,
                    body_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS tw_actions (
                    action_id TEXT PRIMARY KEY,
                    run_id TEXT NOT NULL,
                    tool_call_id TEXT NOT NULL,
                    args_digest TEXT NOT NULL,
                    idempotency_key TEXT NOT NULL,
                    status TEXT NOT NULL,
                    body_json TEXT NOT NULL,
                    UNIQUE (run_id, tool_call_id),
                    UNIQUE (idempotency_key)
                );

                CREATE TABLE IF NOT EXISTS tw_budgets (
                    loop_id TEXT PRIMARY KEY,
                    parent_loop_id TEXT,
                    limit_json TEXT NOT NULL,
                    usage_json TEXT NOT NULL,
                    reserved_json TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS tw_leases (
                    run_id TEXT PRIMARY KEY,
                    owner_id TEXT NOT NULL,
                    generation INTEGER NOT NULL,
                    expires_at REAL NOT NULL
                );

                CREATE TABLE IF NOT EXISTS tw_exploration_usage (
                    brief_id TEXT PRIMARY KEY,
                    usage_json TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS tw_memories (
                    memory_id TEXT PRIMARY KEY,
                    user_scope TEXT NOT NULL,
                    workspace_scope TEXT NOT NULL,
                    purpose TEXT NOT NULL,
                    source_class TEXT NOT NULL,
                    claim TEXT NOT NULL,
                    conditions_json TEXT NOT NULL,
                    provenance_json TEXT NOT NULL,
                    sensitivity TEXT NOT NULL,
                    retention_until TEXT,
                    active INTEGER NOT NULL
                );

                CREATE VIRTUAL TABLE IF NOT EXISTS tw_memories_fts USING fts5(
                    memory_id UNINDEXED,
                    claim,
                    conditions
                );

                CREATE TABLE IF NOT EXISTS tw_eval_requests (
                    request_id TEXT PRIMARY KEY,
                    protocol_id TEXT NOT NULL,
                    champion_digest TEXT NOT NULL,
                    challenger_digest TEXT NOT NULL,
                    challenge TEXT NOT NULL UNIQUE,
                    body_json TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    consumed_receipt_id TEXT UNIQUE
                );

                CREATE TABLE IF NOT EXISTS tw_promotion_requests (
                    request_id TEXT PRIMARY KEY,
                    artifact_id TEXT NOT NULL,
                    subject_digest TEXT NOT NULL,
                    eval_run_id TEXT NOT NULL,
                    challenge TEXT NOT NULL UNIQUE,
                    body_json TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    consumed_receipt_id TEXT UNIQUE
                );

                CREATE TABLE IF NOT EXISTS tw_approval_receipts (
                    receipt_id TEXT PRIMARY KEY,
                    action TEXT NOT NULL,
                    subject_digest TEXT NOT NULL,
                    eval_run_id TEXT NOT NULL,
                    challenge TEXT NOT NULL UNIQUE,
                    approved_by TEXT NOT NULL,
                    source TEXT NOT NULL,
                    body_json TEXT NOT NULL,
                    consumed_at TEXT
                );

                CREATE TABLE IF NOT EXISTS tw_promotions (
                    promotion_id TEXT PRIMARY KEY,
                    artifact_id TEXT NOT NULL,
                    eval_run_id TEXT,
                    approval_receipt_id TEXT UNIQUE,
                    body_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (approval_receipt_id)
                        REFERENCES tw_approval_receipts(receipt_id)
                );
                """
            )

    def put_object(
        self,
        kind: str,
        object_id: str,
        parent_id: str | None,
        status: str,
        value: BaseModel,
    ) -> None:
        if kind in _IMMUTABLE_GOVERNANCE_KINDS:
            raise StateConflict(f"immutable governance {kind} must not use put_object")
        if kind == "loop" and isinstance(value, LoopRecord) and value.parent_loop_id is not None:
            raise StateConflict("child loops must be created with create_child_loop")
        if kind == "exploration_brief":
            raise StateConflict("exploration briefs must be created with create_exploration")
        if kind == "run" and (not isinstance(value, RunRecord) or status != value.status.value):
            raise StateConflict("run object status must match its record")
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            existing = connection.execute(
                "SELECT kind, object_id, parent_id, body_json FROM tw_objects WHERE kind = ? AND object_id = ?",
                (kind, object_id),
            ).fetchone()
            if kind == "run" and existing is not None:
                persisted = RunRecord.model_validate_json(existing["body_json"])
                if (
                    existing["kind"] != kind
                    or existing["object_id"] != object_id
                    or existing["parent_id"] != parent_id
                    or persisted.manifest != value.manifest
                    or persisted.model_copy(update={"status": value.status, "status_reason": value.status_reason})
                    != value
                ):
                    raise StateConflict("run manifest and identity are immutable")
            self._put_object(connection, kind, object_id, parent_id, status, value)

    def get_object(self, kind: str, object_id: str, model: type[T]) -> T:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT body_json FROM tw_objects WHERE kind = ? AND object_id = ?",
                (kind, object_id),
            ).fetchone()
        if row is None:
            raise StateConflict(f"missing {kind} {object_id}")
        return model.model_validate_json(row["body_json"])

    def get_object_with_status(self, kind: str, object_id: str, model: type[T]) -> tuple[T, str]:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT body_json, status FROM tw_objects WHERE kind = ? AND object_id = ?",
                (kind, object_id),
            ).fetchone()
        if row is None:
            raise StateConflict(f"missing {kind} {object_id}")
        return model.model_validate_json(row["body_json"]), str(row["status"])

    def put_immutable_object(
        self,
        kind: str,
        object_id: str,
        parent_id: str | None,
        status: str,
        value: BaseModel,
    ) -> None:
        """Persist a content-immutable object, allowing only exact replay."""
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            existing = connection.execute(
                "SELECT parent_id, status, body_json FROM tw_objects WHERE kind = ? AND object_id = ?",
                (kind, object_id),
            ).fetchone()
            if existing is not None:
                if (
                    existing["parent_id"],
                    existing["status"],
                    existing["body_json"],
                ) != (parent_id, status, value.model_dump_json()):
                    raise StateConflict(f"conflicting immutable {kind} replay for {object_id}")
                return
            self._put_object(connection, kind, object_id, parent_id, status, value)

    def list_objects(self, kind: str, model: type[T]) -> list[T]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT body_json FROM tw_objects WHERE kind = ? ORDER BY object_id", (kind,)
            ).fetchall()
        return [model.model_validate_json(row["body_json"]) for row in rows]

    def persist_eval_request(self, request: EvalRequest) -> None:
        self._persist_request(
            "tw_eval_requests", request, request.protocol_id, request.champion_digest, request.challenger_digest
        )

    def get_eval_request(self, request_id: str) -> tuple[EvalRequest, str | None]:
        return self._get_request("tw_eval_requests", request_id, EvalRequest)

    def consume_eval_request(self, request: EvalRequest, run: EvalRun) -> None:
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT consumed_receipt_id FROM tw_eval_requests WHERE request_id = ?", (request.request_id,)
            ).fetchone()
            if row is None or row["consumed_receipt_id"] is not None:
                raise StateConflict("evaluation request is already consumed or missing")
            self._insert_object(connection, "eval_run", run.eval_run_id, request.request_id, "recorded", run)
            result = connection.execute(
                "UPDATE tw_eval_requests SET consumed_receipt_id = ? "
                "WHERE request_id = ? AND consumed_receipt_id IS NULL",
                (run.eval_run_id, request.request_id),
            )
            if result.rowcount != 1:
                raise StateConflict("evaluation request changed during receipt import")

    def persist_promotion_request(self, request: PromotionRequest) -> None:
        self._persist_request(
            "tw_promotion_requests", request, request.artifact_id, request.subject_digest, request.eval_run_id
        )

    def get_promotion_request(self, request_id: str) -> tuple[PromotionRequest, str | None]:
        return self._get_request("tw_promotion_requests", request_id, PromotionRequest)

    def consume_promotion_request(self, request: PromotionRequest, receipt: ApprovalReceipt) -> None:
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT body_json, consumed_receipt_id FROM tw_promotion_requests WHERE request_id = ?",
                (request.request_id,),
            ).fetchone()
            if row is None or row["consumed_receipt_id"] is not None:
                raise StateConflict("promotion request is already consumed or missing")
            persisted = PromotionRequest.model_validate_json(row["body_json"])
            if persisted != request or persisted.expires_at <= utc_now():
                raise StateConflict("promotion request identity is stale or expired")
            if (
                receipt.action,
                receipt.subject_digest,
                receipt.eval_run_id,
                receipt.challenge,
                receipt.source,
            ) != (
                "promote",
                persisted.subject_digest,
                persisted.eval_run_id,
                persisted.challenge,
                "local_user_cli",
            ):
                raise StateConflict("approval receipt bindings do not match promotion request")
            try:
                connection.execute(
                    "INSERT INTO tw_approval_receipts "
                    "(receipt_id, action, subject_digest, eval_run_id, challenge, approved_by, "
                    "source, body_json, consumed_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)",
                    (
                        receipt.receipt_id,
                        receipt.action,
                        receipt.subject_digest,
                        receipt.eval_run_id,
                        receipt.challenge,
                        receipt.approved_by,
                        receipt.source,
                        receipt.model_dump_json(),
                    ),
                )
            except sqlite3.IntegrityError as error:
                raise StateConflict("approval receipt already exists") from error
            result = connection.execute(
                "UPDATE tw_promotion_requests SET consumed_receipt_id = ? "
                "WHERE request_id = ? AND consumed_receipt_id IS NULL",
                (receipt.receipt_id, request.request_id),
            )
            if result.rowcount != 1:
                raise StateConflict("promotion request changed during approval")

    def get_approval_receipt(self, receipt_id: str) -> tuple[ApprovalReceipt, str | None]:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT body_json, consumed_at FROM tw_approval_receipts WHERE receipt_id = ?", (receipt_id,)
            ).fetchone()
        if row is None:
            raise StateConflict(f"missing approval receipt {receipt_id}")
        return ApprovalReceipt.model_validate_json(row["body_json"]), row["consumed_at"]

    def get_promotion_request_for_receipt(self, receipt_id: str) -> PromotionRequest:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT body_json FROM tw_promotion_requests WHERE consumed_receipt_id = ?",
                (receipt_id,),
            ).fetchone()
        if row is None:
            raise StateConflict("approval receipt is not bound to a promotion request")
        return PromotionRequest.model_validate_json(row["body_json"])

    def promotion_cas(
        self,
        pointer_kind: str,
        pointer_id: str,
        expected_version_id: str,
        pointer: BaseModel,
        record: PromotionRecord,
        approval_receipt_id: str | None,
    ) -> None:
        if pointer_kind != "active_pointer":
            raise StateConflict("promotion CAS only updates active pointers")
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT body_json FROM tw_objects WHERE kind = ? AND object_id = ?", (pointer_kind, pointer_id)
            ).fetchone()
            if row is None or json.loads(row["body_json"])["current_version_id"] != expected_version_id:
                raise StateConflict("active pointer changed")
            if approval_receipt_id is not None:
                approval = connection.execute(
                    "SELECT consumed_at FROM tw_approval_receipts WHERE receipt_id = ?", (approval_receipt_id,)
                ).fetchone()
                if approval is None or approval["consumed_at"] is not None:
                    raise StateConflict("approval receipt is unavailable")
                consumed = connection.execute(
                    "UPDATE tw_approval_receipts SET consumed_at = ? WHERE receipt_id = ? AND consumed_at IS NULL",
                    (utc_now().isoformat(), approval_receipt_id),
                )
                if consumed.rowcount != 1:
                    raise StateConflict("approval receipt changed")
            self._put_object(connection, pointer_kind, pointer_id, None, "active", pointer)
            try:
                connection.execute(
                    "INSERT INTO tw_promotions "
                    "(promotion_id, artifact_id, eval_run_id, approval_receipt_id, body_json, created_at) "
                    "VALUES (?, ?, ?, ?, ?, ?)",
                    (
                        record.promotion_id,
                        record.artifact_id,
                        record.eval_run_id,
                        approval_receipt_id,
                        record.model_dump_json(),
                        record.created_at.isoformat(),
                    ),
                )
            except sqlite3.IntegrityError as error:
                raise StateConflict("promotion already exists") from error

    def latest_promotion(self, artifact_id: str) -> PromotionRecord | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT body_json FROM tw_promotions WHERE artifact_id = ? AND eval_run_id IS NOT NULL "
                "ORDER BY created_at DESC LIMIT 1",
                (artifact_id,),
            ).fetchone()
        return None if row is None else PromotionRecord.model_validate_json(row["body_json"])

    def _persist_request(self, table: str, request: BaseModel, first: str, second: str, third: str) -> None:
        with self._connect() as connection:
            try:
                connection.execute(
                    f"INSERT INTO {table} VALUES (?, ?, ?, ?, ?, ?, ?, NULL)",
                    (
                        request.request_id,
                        first,
                        second,
                        third,
                        request.challenge,
                        request.model_dump_json(),
                        request.expires_at.isoformat(),
                    ),
                )
            except sqlite3.IntegrityError as error:
                raise StateConflict(f"conflicting {table} replay") from error

    def _get_request(self, table: str, request_id: str, model: type[T]) -> tuple[T, str | None]:
        with self._connect() as connection:
            row = connection.execute(
                f"SELECT body_json, consumed_receipt_id FROM {table} WHERE request_id = ?", (request_id,)
            ).fetchone()
        if row is None:
            raise StateConflict(f"missing request {request_id}")
        return model.model_validate_json(row["body_json"]), row["consumed_receipt_id"]

    def get_budget(self, loop_id: str) -> tuple[BudgetLimit, BudgetUsage, BudgetUsage]:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT limit_json, usage_json, reserved_json FROM tw_budgets WHERE loop_id = ?",
                (loop_id,),
            ).fetchone()
        if row is None:
            raise StateConflict(f"missing budget {loop_id}")
        return (
            BudgetLimit.model_validate_json(row["limit_json"]),
            BudgetUsage.model_validate_json(row["usage_json"]),
            BudgetUsage.model_validate_json(row["reserved_json"]),
        )

    def create_learning_ticket(
        self,
        parent_loop_id: str,
        child: LoopRecord,
        task: BaseModel,
        ticket_id: str,
        ticket: BaseModel,
    ) -> bool:
        """Atomically reserve a child budget and create its governed learning records."""
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            existing = connection.execute(
                "SELECT body_json FROM tw_objects WHERE kind = 'learning_ticket' AND object_id = ?",
                (ticket_id,),
            ).fetchone()
            if existing is not None:
                if existing["body_json"] != ticket.model_dump_json():
                    raise StateConflict(f"conflicting learning ticket replay for {ticket_id}")
                return False
            parent_row = connection.execute(
                "SELECT body_json FROM tw_objects WHERE kind = 'loop' AND object_id = ?",
                (parent_loop_id,),
            ).fetchone()
            if parent_row is None:
                raise StateConflict(f"missing parent loop {parent_loop_id}")
            parent = LoopRecord.model_validate_json(parent_row["body_json"])
            goal_row = connection.execute(
                "SELECT 1 FROM tw_objects WHERE kind = 'goal' AND object_id = ?",
                (parent.goal_id,),
            ).fetchone()
            if goal_row is None or child.parent_loop_id != parent_loop_id or child.goal_id != parent.goal_id:
                raise StateConflict("learning child must retain its persisted parent goal")
            if getattr(task, "loop_id", None) != child.loop_id:
                raise StateConflict("learning task must belong to its child loop")
            for kind, object_id in (("loop", child.loop_id), ("task", getattr(task, "task_id", None))):
                if (
                    object_id is None
                    or connection.execute(
                        "SELECT 1 FROM tw_objects WHERE kind = ? AND object_id = ?", (kind, object_id)
                    ).fetchone()
                    is not None
                ):
                    raise StateConflict(f"learning {kind} already exists for {object_id}")
            self._reserve_child_budget(connection, parent_loop_id, child.loop_id, child.budget)
            self._insert_object(connection, "loop", child.loop_id, parent_loop_id, "active", child)
            self._insert_object(connection, "task", task.task_id, child.loop_id, "active", task)
            self._insert_object(connection, "learning_ticket", ticket_id, parent_loop_id, "active", ticket)
            return True

    def append_event(self, run_id: str, kind: str, payload: dict[str, Any]) -> EventRecord:
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            return self._append_event(connection, run_id, kind, payload)

    def list_events(self, run_id: str) -> list[EventRecord]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT run_id, sequence, kind, payload_json, created_at "
                "FROM tw_events WHERE run_id = ? ORDER BY sequence",
                (run_id,),
            ).fetchall()
        return [
            EventRecord(
                run_id=row["run_id"],
                sequence=row["sequence"],
                kind=row["kind"],
                payload=json.loads(row["payload_json"]),
                created_at=row["created_at"],
            )
            for row in rows
        ]

    def save_checkpoint(self, checkpoint: CheckpointRecord) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO tw_checkpoints
                    (checkpoint_id, run_id, event_sequence, state_digest, body_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(checkpoint_id) DO UPDATE SET
                    run_id = excluded.run_id,
                    event_sequence = excluded.event_sequence,
                    state_digest = excluded.state_digest,
                    body_json = excluded.body_json,
                    created_at = excluded.created_at
                """,
                (
                    checkpoint.checkpoint_id,
                    checkpoint.run_id,
                    checkpoint.event_sequence,
                    checkpoint.state_digest,
                    checkpoint.model_dump_json(),
                    checkpoint.created_at.isoformat(),
                ),
            )

    def latest_checkpoint(self, run_id: str) -> CheckpointRecord | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT body_json FROM tw_checkpoints WHERE run_id = ? "
                "ORDER BY event_sequence DESC, created_at DESC LIMIT 1",
                (run_id,),
            ).fetchone()
        return None if row is None else CheckpointRecord.model_validate_json(row["body_json"])

    def prepare_action(self, action: ActionRecord) -> None:
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            self._prepare_action(connection, action)

    def get_action(self, action_id: str) -> ActionRecord:
        with self._connect() as connection:
            row = connection.execute("SELECT body_json FROM tw_actions WHERE action_id = ?", (action_id,)).fetchone()
        if row is None:
            raise StateConflict(f"missing action {action_id}")
        return ActionRecord.model_validate_json(row["body_json"])

    def prepare_action_with_reservation(
        self,
        action: ActionRecord,
        loop_id: str,
        budget_delta: BudgetUsage,
        brief_id: str,
        exploration_delta: ExplorationUsage,
    ) -> None:
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            inserted = self._prepare_action(connection, action)
            if not inserted:
                return
            self._charge_budget(connection, loop_id, budget_delta)
            self._reserve_exploration_usage(connection, brief_id, exploration_delta)

    def transition_action(
        self,
        action_id: str,
        expected: set[ActionStatus],
        target: ActionStatus,
        result_digest: str | None = None,
    ) -> ActionRecord:
        if not expected:
            raise StateConflict("expected action states must not be empty")
        with self._connect() as connection:
            row = connection.execute("SELECT body_json FROM tw_actions WHERE action_id = ?", (action_id,)).fetchone()
            if row is None:
                raise StateConflict(f"missing action {action_id}")
            action = ActionRecord.model_validate_json(row["body_json"])
            transitioned = action.model_copy(update={"status": target, "result_digest": result_digest})
            placeholders = ", ".join("?" for _ in expected)
            result = connection.execute(
                f"UPDATE tw_actions SET status = ?, body_json = ? WHERE action_id = ? AND status IN ({placeholders})",
                (
                    target.value,
                    transitioned.model_dump_json(),
                    action_id,
                    *(status.value for status in expected),
                ),
            )
            if result.rowcount != 1:
                raise StateConflict(f"action {action_id} was not in an expected state")
        return transitioned

    def unresolved_actions(self, run_id: str) -> list[ActionRecord]:
        terminal = (
            ActionStatus.SUCCEEDED.value,
            ActionStatus.FAILED.value,
            ActionStatus.DENIED.value,
            ActionStatus.CANCELLED.value,
        )
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT body_json FROM tw_actions WHERE run_id = ? AND status NOT IN (?, ?, ?, ?) ORDER BY action_id",
                (run_id, *terminal),
            ).fetchall()
        return [ActionRecord.model_validate_json(row["body_json"]) for row in rows]

    def count_actions(self, run_id: str, tool_name: str) -> int:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT COUNT(*) AS count FROM tw_actions WHERE run_id = ? "
                "AND json_extract(body_json, '$.tool_name') = ?",
                (run_id, tool_name),
            ).fetchone()
        return int(row["count"])

    def create_budget(self, loop_id: str, parent_loop_id: str | None, limit: BudgetLimit) -> None:
        if parent_loop_id is not None:
            raise StateConflict("child budgets must be created with reserve_child_budget")
        with self._connect() as connection:
            try:
                connection.execute(
                    "INSERT INTO tw_budgets (loop_id, parent_loop_id, limit_json, usage_json, reserved_json) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (
                        loop_id,
                        parent_loop_id,
                        limit.model_dump_json(),
                        _zero_usage().model_dump_json(),
                        _zero_usage().model_dump_json(),
                    ),
                )
            except sqlite3.IntegrityError as error:
                raise StateConflict(f"budget already exists for {loop_id}") from error

    def reserve_child_budget(self, parent_loop_id: str, child_loop_id: str, limit: BudgetLimit) -> None:
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            self._reserve_child_budget(connection, parent_loop_id, child_loop_id, limit)

    def charge_budget(self, loop_id: str, delta: BudgetUsage) -> BudgetUsage:
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            return self._charge_budget(connection, loop_id, delta)

    def create_exploration(self, brief: ExplorationBrief) -> None:
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            self._put_object(
                connection,
                "exploration_brief",
                brief.brief_id,
                None,
                "active",
                brief,
            )
            try:
                connection.execute(
                    "INSERT INTO tw_exploration_usage (brief_id, usage_json) VALUES (?, ?)",
                    (brief.brief_id, ExplorationUsage().model_dump_json()),
                )
            except sqlite3.IntegrityError as error:
                raise StateConflict(f"exploration already exists for {brief.brief_id}") from error

    def reserve_exploration_usage(self, brief_id: str, delta: ExplorationUsage) -> ExplorationUsage:
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            return self._reserve_exploration_usage(connection, brief_id, delta)

    def get_exploration_usage(self, brief_id: str) -> ExplorationUsage:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT usage_json FROM tw_exploration_usage WHERE brief_id = ?", (brief_id,)
            ).fetchone()
        if row is None:
            raise StateConflict(f"missing exploration usage for {brief_id}")
        return ExplorationUsage.model_validate_json(row["usage_json"])

    def acquire_lease(self, run_id: str, owner_id: str, ttl_seconds: int) -> int:
        now = time.time()
        with self._connect() as connection:
            result = connection.execute(
                """
                INSERT INTO tw_leases (run_id, owner_id, generation, expires_at)
                VALUES (?, ?, 1, ?)
                ON CONFLICT(run_id) DO UPDATE SET
                    owner_id = excluded.owner_id,
                    generation = CASE
                        WHEN tw_leases.owner_id = excluded.owner_id THEN tw_leases.generation
                        ELSE tw_leases.generation + 1
                    END,
                    expires_at = excluded.expires_at
                WHERE tw_leases.owner_id = excluded.owner_id OR tw_leases.expires_at <= ?
                """,
                (run_id, owner_id, now + ttl_seconds, now),
            )
            if result.rowcount != 1:
                raise LeaseConflict(f"lease for {run_id} is held by another owner")
            row = connection.execute("SELECT generation FROM tw_leases WHERE run_id = ?", (run_id,)).fetchone()
        return int(row["generation"])

    def renew_lease(self, run_id: str, owner_id: str, generation: int, ttl_seconds: int) -> None:
        with self._connect() as connection:
            result = connection.execute(
                "UPDATE tw_leases SET expires_at = ? WHERE run_id = ? AND owner_id = ? AND generation = ?",
                (time.time() + ttl_seconds, run_id, owner_id, generation),
            )
            if result.rowcount != 1:
                raise LeaseConflict(f"lease generation for {run_id} does not match")

    def create_child_loop(self, parent_loop_id: str, child: LoopRecord) -> None:
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT body_json FROM tw_objects WHERE kind = 'loop' AND object_id = ?",
                (parent_loop_id,),
            ).fetchone()
            if row is None:
                raise StateConflict(f"missing parent loop {parent_loop_id}")
            parent = LoopRecord.model_validate_json(row["body_json"])
            if child.parent_loop_id != parent_loop_id or child.goal_id != parent.goal_id:
                raise StateConflict("child loop must retain its persisted parent goal")
            self._reserve_child_budget(connection, parent_loop_id, child.loop_id, child.budget)
            self._put_object(connection, "loop", child.loop_id, parent_loop_id, "active", child)

    def mark_inflight_actions_unknown(self, run_id: str) -> list[ActionRecord]:
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            rows = connection.execute(
                "SELECT body_json FROM tw_actions WHERE run_id = ? AND status = ? ORDER BY action_id",
                (run_id, ActionStatus.RUNNING.value),
            ).fetchall()
            changed: list[ActionRecord] = []
            for row in rows:
                action = ActionRecord.model_validate_json(row["body_json"])
                unknown = action.model_copy(update={"status": ActionStatus.UNKNOWN})
                result = connection.execute(
                    "UPDATE tw_actions SET status = ?, body_json = ? WHERE action_id = ? AND status = ?",
                    (
                        ActionStatus.UNKNOWN.value,
                        unknown.model_dump_json(),
                        action.action_id,
                        ActionStatus.RUNNING.value,
                    ),
                )
                if result.rowcount != 1:
                    raise StateConflict(f"action {action.action_id} changed during recovery")
                self._append_event(
                    connection,
                    run_id,
                    "action_unknown_after_recovery",
                    {"action_id": action.action_id},
                )
                changed.append(unknown)
        return changed

    def _put_object(
        self,
        connection: sqlite3.Connection,
        kind: str,
        object_id: str,
        parent_id: str | None,
        status: str,
        value: BaseModel,
    ) -> None:
        connection.execute(
            """
            INSERT INTO tw_objects
                (kind, object_id, parent_id, status, body_json, body_digest, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(kind, object_id) DO UPDATE SET
                parent_id = excluded.parent_id,
                status = excluded.status,
                body_json = excluded.body_json,
                body_digest = excluded.body_digest,
                updated_at = excluded.updated_at
            """,
            (
                kind,
                object_id,
                parent_id,
                status,
                value.model_dump_json(),
                content_digest(value),
                utc_now().isoformat(),
            ),
        )

    def _insert_object(
        self,
        connection: sqlite3.Connection,
        kind: str,
        object_id: str,
        parent_id: str | None,
        status: str,
        value: BaseModel,
    ) -> None:
        try:
            connection.execute(
                """
                INSERT INTO tw_objects
                    (kind, object_id, parent_id, status, body_json, body_digest, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    kind,
                    object_id,
                    parent_id,
                    status,
                    value.model_dump_json(),
                    content_digest(value),
                    utc_now().isoformat(),
                ),
            )
        except sqlite3.IntegrityError as error:
            raise StateConflict(f"{kind} already exists for {object_id}") from error

    def _append_event(
        self,
        connection: sqlite3.Connection,
        run_id: str,
        kind: str,
        payload: dict[str, Any],
    ) -> EventRecord:
        sequence = connection.execute(
            "SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence FROM tw_events WHERE run_id = ?",
            (run_id,),
        ).fetchone()["sequence"]
        event = EventRecord(run_id=run_id, sequence=sequence, kind=kind, payload=payload)
        connection.execute(
            "INSERT INTO tw_events (run_id, sequence, kind, payload_json, created_at) VALUES (?, ?, ?, ?, ?)",
            (
                event.run_id,
                event.sequence,
                event.kind,
                json.dumps(event.payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")),
                event.created_at.isoformat(),
            ),
        )
        return event

    def _prepare_action(self, connection: sqlite3.Connection, action: ActionRecord) -> bool:
        conflict = connection.execute(
            "SELECT body_json FROM tw_actions WHERE action_id = ? "
            "OR (run_id = ? AND tool_call_id = ?) OR idempotency_key = ?",
            (action.action_id, action.run_id, action.tool_call_id, action.idempotency_key),
        ).fetchone()
        if conflict is not None:
            existing = ActionRecord.model_validate_json(conflict["body_json"])
            if existing.model_copy(update={"status": action.status, "result_digest": action.result_digest}) == action:
                return False
            raise StateConflict(f"conflicting action replay for {action.action_id}")
        connection.execute(
            """
            INSERT INTO tw_actions
                (action_id, run_id, tool_call_id, args_digest, idempotency_key, status, body_json)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                action.action_id,
                action.run_id,
                action.tool_call_id,
                action.args_digest,
                action.idempotency_key,
                action.status.value,
                action.model_dump_json(),
            ),
        )
        return True

    def _reserve_child_budget(
        self,
        connection: sqlite3.Connection,
        parent_loop_id: str,
        child_loop_id: str,
        limit: BudgetLimit,
    ) -> None:
        row = connection.execute(
            "SELECT limit_json, usage_json, reserved_json FROM tw_budgets WHERE loop_id = ?",
            (parent_loop_id,),
        ).fetchone()
        if row is None:
            raise StateConflict(f"missing parent budget {parent_loop_id}")
        parent_limit = BudgetLimit.model_validate_json(row["limit_json"])
        parent_usage = BudgetUsage.model_validate_json(row["usage_json"])
        parent_reserved = BudgetUsage.model_validate_json(row["reserved_json"])
        child_reserved = BudgetUsage(**limit.model_dump())
        next_reserved = _add(parent_reserved, child_reserved)
        if not _within_limit(_add(parent_usage, next_reserved), parent_limit):
            raise BudgetExceeded(f"child budget exceeds parent budget for {parent_loop_id}")
        try:
            connection.execute(
                "INSERT INTO tw_budgets (loop_id, parent_loop_id, limit_json, usage_json, reserved_json) "
                "VALUES (?, ?, ?, ?, ?)",
                (
                    child_loop_id,
                    parent_loop_id,
                    limit.model_dump_json(),
                    _zero_usage().model_dump_json(),
                    _zero_usage().model_dump_json(),
                ),
            )
        except sqlite3.IntegrityError as error:
            raise StateConflict(f"budget already exists for {child_loop_id}") from error
        connection.execute(
            "UPDATE tw_budgets SET reserved_json = ? WHERE loop_id = ?",
            (next_reserved.model_dump_json(), parent_loop_id),
        )

    def _charge_budget(self, connection: sqlite3.Connection, loop_id: str, delta: BudgetUsage) -> BudgetUsage:
        row = connection.execute(
            "SELECT limit_json, usage_json, reserved_json FROM tw_budgets WHERE loop_id = ?",
            (loop_id,),
        ).fetchone()
        if row is None:
            raise StateConflict(f"missing budget {loop_id}")
        limit = BudgetLimit.model_validate_json(row["limit_json"])
        usage = BudgetUsage.model_validate_json(row["usage_json"])
        reserved = BudgetUsage.model_validate_json(row["reserved_json"])
        charged = _add(usage, delta)
        if not _within_limit(_add(charged, reserved), limit):
            raise BudgetExceeded(f"budget exceeded for {loop_id}")
        connection.execute(
            "UPDATE tw_budgets SET usage_json = ? WHERE loop_id = ?",
            (charged.model_dump_json(), loop_id),
        )
        return charged

    def _reserve_exploration_usage(
        self,
        connection: sqlite3.Connection,
        brief_id: str,
        delta: ExplorationUsage,
    ) -> ExplorationUsage:
        brief_row = connection.execute(
            "SELECT body_json FROM tw_objects WHERE kind = 'exploration_brief' AND object_id = ?",
            (brief_id,),
        ).fetchone()
        usage_row = connection.execute(
            "SELECT usage_json FROM tw_exploration_usage WHERE brief_id = ?", (brief_id,)
        ).fetchone()
        if brief_row is None or usage_row is None:
            raise StateConflict(f"missing exploration brief {brief_id}")
        brief = ExplorationBrief.model_validate_json(brief_row["body_json"])
        usage = ExplorationUsage.model_validate_json(usage_row["usage_json"])
        reserved = ExplorationUsage(
            **{field: getattr(usage, field) + getattr(delta, field) for field in ExplorationUsage.model_fields}
        )
        limits = {
            "searches": brief.max_searches,
            "fetches": brief.max_fetches,
            "admitted_tokens": brief.max_tokens,
            "cost_microunits": brief.max_cost_microunits,
        }
        if any(getattr(reserved, field) > limit for field, limit in limits.items()):
            raise BudgetExceeded(f"exploration budget exceeded for {brief_id}")
        connection.execute(
            "UPDATE tw_exploration_usage SET usage_json = ? WHERE brief_id = ?",
            (reserved.model_dump_json(), brief_id),
        )
        return reserved
