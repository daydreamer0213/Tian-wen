from __future__ import annotations

import asyncio
import json
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from enum import Enum
from typing import Any

from pydantic_ai import ApprovalRequired, RunContext, SkipToolExecution
from pydantic_ai.capabilities import AbstractCapability, WrapToolExecuteHandler
from pydantic_ai.messages import ToolCallPart
from pydantic_ai.tools import ToolDefinition

from tianwen.domain import ActionRecord, ActionStatus, BudgetUsage, ExplorationUsage, content_digest
from tianwen.store import StateConflict, StateStore


class EffectClass(str, Enum):  # noqa: UP042
    READ_ONLY = "read_only"
    REVERSIBLE_WORKSPACE_WRITE = "reversible_workspace_write"
    EXTERNAL_READ_ONLY = "external_read_only"
    EXTERNAL_OR_IRREVERSIBLE = "external_or_irreversible"
    FORBIDDEN = "forbidden"


class PolicyDecision(str, Enum):  # noqa: UP042
    ALLOW = "allow"
    NOTIFY = "notify"
    ASK = "ask"
    DENY = "deny"


@dataclass(frozen=True)
class ActionContext:
    action: ActionRecord
    decision: PolicyDecision


@dataclass(frozen=True)
class ActionReservation:
    loop_id: str
    budget_delta: BudgetUsage
    brief_id: str
    exploration_delta: ExplorationUsage


class ActionApprovalRequired(RuntimeError):
    def __init__(self, action_id: str) -> None:
        self.action_id = action_id
        super().__init__(f"action approval required: {action_id}")


def decide_action(effect_class: EffectClass, authorized: bool) -> PolicyDecision:
    if not authorized or effect_class is EffectClass.FORBIDDEN:
        return PolicyDecision.DENY
    return {
        EffectClass.READ_ONLY: PolicyDecision.ALLOW,
        EffectClass.REVERSIBLE_WORKSPACE_WRITE: PolicyDecision.NOTIFY,
        EffectClass.EXTERNAL_READ_ONLY: PolicyDecision.NOTIFY,
        EffectClass.EXTERNAL_OR_IRREVERSIBLE: PolicyDecision.ASK,
    }[effect_class]


def _action_identity(
    run_id: str, tool_call_id: str, tool_name: str, args_digest: str
) -> str:
    return f"{run_id}:{tool_call_id}:{tool_name}:{args_digest}"


def _proposal(
    store: StateStore,
    run_id: str,
    tool_call_id: str,
    tool_name: str,
    args: dict[str, Any],
    effect_class: EffectClass,
) -> ActionRecord:
    args_json = json.dumps(args, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    args_digest = content_digest(args_json)
    identity = _action_identity(run_id, tool_call_id, tool_name, args_digest)
    action_id = f"action:{content_digest(identity)}"
    proposal = ActionRecord(
        action_id=action_id,
        run_id=run_id,
        tool_call_id=tool_call_id,
        tool_name=tool_name,
        args_json=args_json,
        args_digest=args_digest,
        effect_class=effect_class.value,
        idempotency_key=identity,
        status=ActionStatus.PROPOSED,
    )
    try:
        existing = store.get_action(action_id)
    except StateConflict as error:
        if str(error) != f"missing action {action_id}":
            raise
        return proposal
    return proposal.model_copy(update={"created_at": existing.created_at})


def freeze_action(
    store: StateStore,
    run_id: str,
    tool_call_id: str,
    tool_name: str,
    args: dict[str, Any],
    effect_class: EffectClass,
) -> ActionRecord:
    proposal = _proposal(store, run_id, tool_call_id, tool_name, args, effect_class)
    store.prepare_action(proposal)
    return store.get_action(proposal.action_id)


def _prepare(
    store: StateStore,
    proposal: ActionRecord,
    reservation: ActionReservation | None,
) -> ActionRecord:
    if reservation is None:
        store.prepare_action(proposal)
    else:
        store.prepare_action_with_reservation(
            proposal,
            reservation.loop_id,
            reservation.budget_delta,
            reservation.brief_id,
            reservation.exploration_delta,
        )
    return store.get_action(proposal.action_id)


def _transition(
    store: StateStore,
    action: ActionRecord,
    expected: set[ActionStatus],
    target: ActionStatus,
    result_digest: str | None = None,
) -> ActionRecord:
    if action.status is target:
        return action
    return store.transition_action(action.action_id, expected, target, result_digest)


def _result_digest(result: Any) -> str:
    return content_digest(json.dumps(result, ensure_ascii=False, sort_keys=True, default=repr))


async def execute_action(
    store: StateStore,
    run_id: str,
    tool_call_id: str,
    tool_name: str,
    args: dict[str, Any],
    effect_class: EffectClass,
    authorized: bool,
    handler: Callable[[dict[str, Any]], Awaitable[Any]],
    reservation: ActionReservation | None = None,
) -> tuple[ActionRecord, Any]:
    proposal = _proposal(store, run_id, tool_call_id, tool_name, args, effect_class)
    decision = decide_action(effect_class, authorized)
    action = _prepare(store, proposal, None if decision is PolicyDecision.DENY else reservation)
    if decision is PolicyDecision.DENY:
        return _transition(
            store,
            action,
            {ActionStatus.PROPOSED, ActionStatus.WAITING_APPROVAL, ActionStatus.APPROVED},
            ActionStatus.DENIED,
        ), None
    if decision is PolicyDecision.ASK:
        _transition(
            store,
            action,
            {ActionStatus.PROPOSED},
            ActionStatus.WAITING_APPROVAL,
        )
        raise ActionApprovalRequired(action.action_id)
    if action.status is ActionStatus.SUCCEEDED:
        return action, None
    action = _transition(
        store,
        action,
        {ActionStatus.PROPOSED, ActionStatus.APPROVED},
        ActionStatus.RUNNING,
    )
    try:
        result = await handler(args)
    except (asyncio.CancelledError, TimeoutError):
        _transition(store, action, {ActionStatus.RUNNING}, ActionStatus.UNKNOWN)
        raise
    except Exception:
        _transition(store, action, {ActionStatus.RUNNING}, ActionStatus.FAILED)
        raise
    return _transition(
        store,
        action,
        {ActionStatus.RUNNING},
        ActionStatus.SUCCEEDED,
        _result_digest(result),
    ), result


@dataclass
class ActionGatewayCapability(AbstractCapability[object]):
    store: StateStore
    tianwen_run_id: str
    classify: Callable[[str, dict[str, Any]], EffectClass]
    authorized: Callable[[str, dict[str, Any]], bool]

    def _context(self, call: ToolCallPart, tool_def: ToolDefinition, args: dict[str, Any]) -> ActionContext:
        effect_class = self.classify(tool_def.name, args)
        action = freeze_action(
            self.store,
            self.tianwen_run_id,
            call.tool_call_id,
            tool_def.name,
            args,
            effect_class,
        )
        return ActionContext(action, decide_action(effect_class, self.authorized(tool_def.name, args)))

    async def before_tool_execute(
        self,
        ctx: RunContext[object],
        *,
        call: ToolCallPart,
        tool_def: ToolDefinition,
        args: dict[str, Any],
    ) -> dict[str, Any]:
        action_context = self._context(call, tool_def, args)
        action = action_context.action
        if action_context.decision is PolicyDecision.DENY:
            _transition(
                self.store,
                action,
                {ActionStatus.PROPOSED, ActionStatus.WAITING_APPROVAL, ActionStatus.APPROVED},
                ActionStatus.DENIED,
            )
            raise SkipToolExecution(
                {"status": "denied", "action_id": action.action_id, "reason": "policy"}
            )
        if action_context.decision is PolicyDecision.ASK:
            if not ctx.tool_call_approved:
                _transition(
                    self.store,
                    action,
                    {ActionStatus.PROPOSED},
                    ActionStatus.WAITING_APPROVAL,
                )
                raise ApprovalRequired(metadata={"action_id": action.action_id})
            _transition(
                self.store,
                action,
                {ActionStatus.WAITING_APPROVAL, ActionStatus.PROPOSED},
                ActionStatus.APPROVED,
            )
        return args

    async def wrap_tool_execute(
        self,
        ctx: RunContext[object],
        *,
        call: ToolCallPart,
        tool_def: ToolDefinition,
        args: dict[str, Any],
        handler: WrapToolExecuteHandler,
    ) -> Any:
        del ctx
        action = self._context(call, tool_def, args).action
        if action.status is ActionStatus.SUCCEEDED:
            return None
        action = _transition(
            self.store,
            action,
            {ActionStatus.PROPOSED, ActionStatus.APPROVED},
            ActionStatus.RUNNING,
        )
        try:
            result = await handler(args)
        except (asyncio.CancelledError, TimeoutError):
            _transition(self.store, action, {ActionStatus.RUNNING}, ActionStatus.UNKNOWN)
            raise
        except Exception:
            _transition(self.store, action, {ActionStatus.RUNNING}, ActionStatus.FAILED)
            raise
        _transition(
            self.store,
            action,
            {ActionStatus.RUNNING},
            ActionStatus.SUCCEEDED,
            _result_digest(result),
        )
        return result
