from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.hazmat.primitives.serialization import load_pem_public_key
from pydantic import ValidationError
from pydantic_ai.models.test import TestModel

from tianwen.app import AppError, TianwenApp, TianwenConfig
from tianwen.domain import BudgetLimit, EvalProtocol, ExplorationBrief, ExplorationStopReason, TaskRecord
from tianwen.evaluation import EvaluationError
from tianwen.store import StateConflict


def _protocol() -> EvalProtocol:
    return EvalProtocol(
        protocol_id="local-v1",
        task_set_digest="sha256:local",
        evaluator_digest="sha256:external",
        harness_digest="sha256:harness",
        tool_digest="sha256:gateway",
        budget_digest="sha256:budget",
        environment_digest="sha256:environment",
        model_digest="sha256:model",
    )


def _app(args: argparse.Namespace) -> TianwenApp:
    key_path = os.environ.get("TIANWEN_EVALUATOR_PUBLIC_KEY")
    if not key_path:
        raise AppError("TIANWEN_EVALUATOR_PUBLIC_KEY must name an Ed25519 public PEM file")
    try:
        key = load_pem_public_key(Path(key_path).read_bytes())
    except (OSError, ValueError) as error:
        raise AppError("TIANWEN_EVALUATOR_PUBLIC_KEY must name a readable Ed25519 public PEM file") from error
    if not isinstance(key, Ed25519PublicKey):
        raise AppError("TIANWEN_EVALUATOR_PUBLIC_KEY must name an Ed25519 public PEM file")
    return TianwenApp(
        TianwenConfig(
            data_dir=Path(args.data_dir),
            workspace=Path(args.workspace).resolve(),
            model=TestModel(custom_output_text="deterministic local demo", call_tools=[]),
            public_evaluator_key=key,
            approved_protocol=_protocol(),
            recorded_search_path=Path(args.recorded_search) if getattr(args, "recorded_search", None) else None,
            recorded_fetch_path=Path(args.recorded_fetch) if getattr(args, "recorded_fetch", None) else None,
        )
    )


def _budget(args: argparse.Namespace) -> BudgetLimit:
    return BudgetLimit(model_requests=args.model_requests, tool_calls=args.tool_calls, tokens=args.max_tokens)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="tianwen", description="Tian-wen bounded local continual-learning slice")
    parser.add_argument("--data-dir", default=str(Path.cwd() / ".tianwen"))
    parser.add_argument("--workspace", default=str(Path.cwd()))
    sub = parser.add_subparsers(dest="command", required=True)
    goal = sub.add_parser("goal-create", help="create a human-confirmed root goal")
    goal.add_argument("--objective", required=True)
    goal.add_argument("--criterion", action="append", required=True)
    goal.add_argument("--authorization", action="append", default=["workspace_read", "workspace_write"])
    goal.add_argument("--model-requests", type=int, default=2)
    goal.add_argument("--tool-calls", type=int, default=20)
    goal.add_argument("--max-tokens", type=int, default=2000)
    explore = sub.add_parser("explore", help="run bounded local exploration")
    explore.add_argument("--goal", required=True)
    explore.add_argument("--task", required=True)
    explore.add_argument("--question", required=True)
    explore.add_argument("--domain", action="append", default=[])
    explore.add_argument("--live-web", action="store_true")
    explore.add_argument("--recorded-search")
    explore.add_argument("--recorded-fetch")
    run = sub.add_parser("run", help="run the active frozen repository skill")
    run.add_argument("--goal", required=True)
    run.add_argument("--request", required=True)
    status = sub.add_parser("status", help="show safe, compact state")
    status.add_argument("--goal", required=True)
    approve = sub.add_parser("approve", help="resume a runtime approval checkpoint")
    approve.add_argument("--checkpoint", required=True)
    approve.add_argument("--approve", action="append", default=[], metavar="ACTION_ID")
    approve.add_argument("--deny", action="append", default=[], metavar="ACTION_ID")
    learn = sub.add_parser("learn", help="process at most one queued learning signal")
    learn.add_argument("--loop", required=True)
    request = sub.add_parser("eval-request", help="write an external evaluator request")
    request.add_argument("--candidate", required=True)
    imported = sub.add_parser("eval-import", help="verify and import an external evaluator receipt")
    imported.add_argument("--receipt", required=True)
    promote = sub.add_parser("promote", help="request and confirm a human-gated promotion")
    promote.add_argument("--candidate", required=True)
    rollback = sub.add_parser("rollback", help="roll back the active immutable pointer")
    rollback.add_argument("--artifact", default="repo-task")
    rollback.add_argument("--approved-by", required=True)
    rollback.add_argument("--reason", required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        app = _app(args)
        if args.command == "goal-create":
            if not sys.stdin.isatty():
                raise AppError("goal creation requires an interactive TTY confirmation")
            confirmed = input(f"Create goal for: {args.objective}\nType yes to continue: ")
            if confirmed.strip().casefold() != "yes":
                raise AppError("goal creation was not confirmed")
            goal = app.create_goal(
                objective=args.objective,
                criteria=tuple(args.criterion),
                workspace=Path(args.workspace),
                authorization=tuple(args.authorization),
                budget=_budget(args),
            )
            print(goal.goal_id)
        elif args.command == "explore":
            if args.live_web and not args.domain:
                raise AppError("--live-web requires at least one --domain")
            task = app.goal_task(args.goal)
            if args.task != "root":
                task = app.store.get_object("task", args.task, TaskRecord)
            brief = ExplorationBrief(
                brief_id=f"cli:{args.goal}:{args.question}",
                task_id=task.task_id,
                question=args.question,
                decision_use="choose the next bounded action",
                known_evidence_ids=(),
                unknowns=(args.question,),
                allowed_local_roots=(".",),
                allowed_source_classes=("official_documentation",),
                allowed_domains=tuple(args.domain),
                max_searches=1,
                max_fetches=1,
                max_tokens=200,
                max_cost_microunits=10,
                wall_seconds=300,
                expected_outputs=("source-backed answer",),
                sufficiency_criteria=("evidence",),
                stop_conditions=(ExplorationStopReason.SUFFICIENT, ExplorationStopReason.INSUFFICIENT_EVIDENCE),
            )
            if args.live_web:
                print("live web budget: searches=1 fetches=1")
            print(app.explore(args.goal, brief, live=args.live_web).model_dump_json())
        elif args.command == "run":
            print(app.run_repo_task(args.goal, Path(args.workspace), args.request))
        elif args.command == "status":
            print(app.status(args.goal).model_dump_json())
        elif args.command == "approve":
            if not sys.stdin.isatty():
                raise AppError("approval requires an interactive TTY")
            approved = set(args.approve)
            denied = set(args.deny)
            if len(approved) != len(args.approve) or len(denied) != len(args.deny) or approved & denied:
                raise AppError("each pending action needs one unambiguous decision")
            approvals = {action_id: True for action_id in approved} | {action_id: False for action_id in denied}
            if not approvals:
                for action_id, tool_name, effect_class in app.pending_approval(args.checkpoint):
                    answer = input(f"Approve {action_id} ({tool_name}, {effect_class})? [y/n]: ").strip().casefold()
                    if answer not in {"y", "yes", "n", "no"}:
                        raise AppError("approval answer must be yes or no")
                    approvals[action_id] = answer in {"y", "yes"}
            print(app.resume_approval(args.checkpoint, approvals))
        elif args.command == "learn":
            print(app.process_learning(args.loop) or "no queued high-value signal")
        elif args.command == "eval-request":
            request = app.create_eval_request(args.candidate)
            print(
                json.dumps(
                    {"request_id": request.request_id, "request_path": str(app.eval_request_path(request.request_id))}
                )
            )
        elif args.command == "eval-import":
            print(app.import_eval_receipt(Path(args.receipt)).model_dump_json())
        elif args.command == "promote":
            if not sys.stdin.isatty():
                raise AppError("promotion requires an interactive TTY")
            request_id, challenge = app.request_promotion(args.candidate)
            print(f"Challenge: {challenge}")
            typed = input("Retype challenge: ")
            approved_by = input("Approver name: ")
            print(app.confirm_promotion(request_id, approved_by, typed).model_dump_json())
        elif args.command == "rollback":
            print(app.rollback(args.artifact, args.approved_by, args.reason).model_dump_json())
        return 0
    except (AppError, StateConflict, EvaluationError, ValidationError, ValueError, OSError) as error:
        print(f"tianwen: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
