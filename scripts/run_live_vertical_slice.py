from __future__ import annotations

import argparse
import json
import os
import shlex
import subprocess
import sys
from collections import Counter
from pathlib import Path
from string import Formatter
from typing import Any

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.hazmat.primitives.serialization import load_pem_public_key
from pydantic_ai.models import infer_model

from tianwen.app import TianwenApp, TianwenConfig, default_eval_protocol
from tianwen.domain import BudgetLimit, ExplorationBrief, ExplorationStopReason, PromotionRecord
from tianwen.evaluation import CaseOutcome, EvalCase


class LiveExperimentError(RuntimeError):
    """Raised when a live experiment cannot continue inside its stated boundary."""


_PLACEHOLDERS = frozenset(
    {"champion_snapshot", "challenger_snapshot", "protocol_manifest", "challenge", "receipt_path"}
)
_COMMAND_TOOLS = frozenset({"run_command", "check_command"})


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run one controlled Tian-wen vertical experiment.")
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--max-tokens", type=int, required=True)
    parser.add_argument("--objective", default="Run one bounded repository improvement experiment.")
    parser.add_argument("--request", default="Implement the bounded repository task after exploration.")
    parser.add_argument("--criterion", action="append", default=["record a bounded, auditable result"])
    parser.add_argument(
        "--follow-up-request", default="Run a different follow-up task after the human-approved promotion."
    )
    parser.add_argument("--live-web", action="store_true")
    parser.add_argument("--domain", action="append", default=[])
    parser.add_argument("--max-searches", type=int, default=1)
    parser.add_argument("--max-fetches", type=int, default=1)
    parser.add_argument("--interactive-promotion", action="store_true")
    return parser


def _load_public_key() -> Ed25519PublicKey:
    value = os.environ.get("TIANWEN_EVALUATOR_PUBLIC_KEY")
    if not value:
        raise LiveExperimentError("TIANWEN_EVALUATOR_PUBLIC_KEY must name an Ed25519 public PEM file")
    try:
        key = load_pem_public_key(Path(value).read_bytes())
    except (OSError, ValueError) as error:
        raise LiveExperimentError(
            "TIANWEN_EVALUATOR_PUBLIC_KEY must name a readable Ed25519 public PEM file"
        ) from error
    if not isinstance(key, Ed25519PublicKey):
        raise LiveExperimentError("TIANWEN_EVALUATOR_PUBLIC_KEY must name an Ed25519 public PEM file")
    return key


def _validate_workspace(workspace: Path) -> None:
    workspace = workspace.resolve()
    if not workspace.is_dir():
        raise LiveExperimentError("workspace must be an existing disposable Git worktree")
    inside = subprocess.run(
        ["git", "rev-parse", "--is-inside-work-tree"], cwd=workspace, capture_output=True, text=True, check=False
    )
    clean = subprocess.run(["git", "status", "--porcelain"], cwd=workspace, capture_output=True, text=True, check=False)
    git_marker = workspace / ".git"
    smoke_root = Path("D:/DevData/tianwen-smoke").resolve()
    disposable_main = git_marker.is_dir() and workspace.is_relative_to(smoke_root)
    explicit_worktree = git_marker.is_file()
    if (
        inside.stdout.strip() != "true"
        or clean.returncode
        or clean.stdout.strip()
        or not (explicit_worktree or disposable_main)
    ):
        raise LiveExperimentError(
            "workspace must be a clean disposable Git worktree (.git file, or under D:\\DevData\\tianwen-smoke)"
        )


def _make_app(args: argparse.Namespace, key: Ed25519PublicKey) -> TianwenApp:
    return TianwenApp(
        TianwenConfig(
            data_dir=args.data_dir,
            workspace=args.workspace.resolve(),
            model=infer_model(os.environ["TIANWEN_MODEL"]),
            public_evaluator_key=key,
            approved_protocol=default_eval_protocol(),
            learning_budget=BudgetLimit(model_requests=1, tool_calls=3, tokens=min(args.max_tokens, 300)),
        )
    )


def _evaluator_command(request: Any) -> list[str] | None:
    raw_json = os.environ.get("TIANWEN_EVALUATOR_COMMAND_JSON")
    raw_legacy = os.environ.get("TIANWEN_EVALUATOR_COMMAND")
    if raw_json and raw_legacy:
        raise LiveExperimentError("configure only TIANWEN_EVALUATOR_COMMAND_JSON or TIANWEN_EVALUATOR_COMMAND")
    if raw_json:
        try:
            command = json.loads(raw_json)
        except json.JSONDecodeError as error:
            raise LiveExperimentError("TIANWEN_EVALUATOR_COMMAND_JSON must be a JSON array of strings") from error
        if not isinstance(command, list) or not command or any(
            not isinstance(item, str) or not item for item in command
        ):
            raise LiveExperimentError("TIANWEN_EVALUATOR_COMMAND_JSON must be a non-empty JSON array of strings")
    elif raw_legacy:
        command = shlex.split(raw_legacy, posix=False)
        if not command:
            raise LiveExperimentError("TIANWEN_EVALUATOR_COMMAND must contain an executable command")
    else:
        return None
    values = {
        "champion_snapshot": request.champion_snapshot,
        "challenger_snapshot": request.challenger_snapshot,
        "protocol_manifest": str(Path(request.champion_snapshot).with_name("protocol.json")),
        "challenge": request.challenge,
        "receipt_path": request.receipt_path,
    }
    formatter = Formatter()
    rendered = []
    seen = Counter()
    for item in command:
        try:
            fields = [
                (field, conversion, format_spec)
                for _, field, format_spec, conversion in formatter.parse(item)
                if field
            ]
        except ValueError as error:
            raise LiveExperimentError("evaluator command contains an unsupported placeholder") from error
        if any(
            field not in _PLACEHOLDERS or conversion is not None or format_spec
            for field, conversion, format_spec in fields
        ):
            raise LiveExperimentError("evaluator command contains an unsupported placeholder")
        for field, _, _ in fields:
            seen[field] += 1
        try:
            rendered.append(item.format(**values))
        except (KeyError, ValueError) as error:
            raise LiveExperimentError(
                "evaluator command placeholders must exactly name supported bundle values"
            ) from error
    if raw_json and seen != Counter({name: 1 for name in _PLACEHOLDERS}):
        raise LiveExperimentError("evaluator command placeholders must name each supported value exactly once")
    return rendered


def _repeated_failed_verification_evidence(app: TianwenApp, run_id: str) -> tuple[str, ...]:
    actions = app.store.list_actions(run_id)
    failed = [
        action
        for action in actions
        if action.tool_name in _COMMAND_TOOLS and action.status.value == "failed"
    ]
    repeated = {digest for digest, count in Counter(action.args_digest for action in failed).items() if count >= 2}
    action_ids = {action.action_id for action in failed if action.args_digest in repeated}
    if not action_ids:
        return ()
    return tuple(
        evidence.evidence_id for evidence in app.execution_evidence(run_id) if evidence.action_id in action_ids
    )


def _public_fixture_outcome(artifact: Any, case: EvalCase) -> CaseOutcome:
    passed = "Stop and replan instead of repeating an identical failed verification command." in artifact.content
    return CaseOutcome(
        case_id=case.case_id,
        passed=passed,
        hard_gate_failures=() if passed else ("correctness",),
        quality=1 if passed else 0,
        tokens=0,
        tool_calls=0,
        user_interruptions=0,
        over_refused=False,
    )


def _run_task_with_approval(app: TianwenApp, goal_id: str, workspace: Path, request: str) -> bool:
    outcome = app.run_repo_task(goal_id, workspace, request)
    while outcome.startswith("waiting_approval:"):
        if not sys.stdin.isatty():
            return False
        checkpoint = outcome.removeprefix("waiting_approval:")
        approvals: dict[str, bool] = {}
        for action_id, tool_name, effect_class in app.pending_approval(checkpoint):
            answer = input(f"Approve {tool_name} ({effect_class}) action {action_id}? [yes/no]: ").strip().casefold()
            if answer not in {"yes", "no"}:
                raise LiveExperimentError("each runtime action requires an explicit yes or no")
            approvals[action_id] = answer == "yes"
        outcome = app.resume_approval(checkpoint, approvals)
    return True


def _print_result(
    goal_id: str,
    run_ids: list[str],
    candidate: str | None,
    eval_run_id: str | None,
    label: str,
    promotion: PromotionRecord | None = None,
) -> None:
    print(f"Goal ID: {goal_id}")
    print(f"Run IDs: {', '.join(run_ids) if run_ids else 'none'}")
    print(f"Candidate digest: {candidate or 'none'}")
    print(f"EvalRun ID: {eval_run_id or 'pending'}")
    if promotion is None:
        print("Rollback: unavailable until promotion")
    else:
        print(
            "Rollback command: python -m tianwen rollback "
            "--artifact repo-task --approved-by NAME --reason REASON"
        )
    print(f"Final label: {label}")
    print("Sample boundary: this controlled fixture does not demonstrate broad continual learning.")


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if not os.environ.get("TIANWEN_MODEL") or not any(
        os.environ.get(name) for name in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY")
    ):
        parser.error("TIANWEN_MODEL and a provider credential are required in the environment")
    if args.max_tokens <= 0:
        parser.error("--max-tokens must be positive")
    if args.live_web and not args.domain:
        parser.error("--live-web requires --domain")
    if args.max_searches < 0 or args.max_fetches < 0:
        parser.error("--max-searches and --max-fetches must be non-negative")
    try:
        workspace = args.workspace.resolve()
        _validate_workspace(workspace)
        key = _load_public_key()
        app = _make_app(args, key)
        budget = BudgetLimit(model_requests=2, tool_calls=20, tokens=args.max_tokens)
        goal = app.create_goal(
            objective=args.objective,
            criteria=tuple(args.criterion),
            workspace=workspace,
            authorization=("workspace_read", "workspace_write", "external_read"),
            budget=budget,
        )
        task = app.goal_task(goal.goal_id)
        brief = ExplorationBrief(
            brief_id=f"live:{goal.goal_id}",
            task_id=task.task_id,
            question="What local repository evidence is needed for this bounded task?",
            decision_use="choose the bounded repository action",
            known_evidence_ids=(),
            unknowns=("repository task context",),
            allowed_local_roots=(".",),
            allowed_source_classes=("official_documentation",),
            allowed_domains=tuple(args.domain),
            max_searches=args.max_searches,
            max_fetches=args.max_fetches,
            max_tokens=min(args.max_tokens, 300),
            max_cost_microunits=10,
            wall_seconds=300,
            expected_outputs=("bounded evidence for the request",),
            sufficiency_criteria=("local repository evidence",),
            stop_conditions=(ExplorationStopReason.SUFFICIENT, ExplorationStopReason.INSUFFICIENT_EVIDENCE),
        )
        report = app.explore(goal.goal_id, brief, live=args.live_web)
        if report.stop_reason is not ExplorationStopReason.SUFFICIENT:
            _print_result(goal.goal_id, [], None, None, "inconclusive")
            return 0
        if not _run_task_with_approval(app, goal.goal_id, workspace, args.request):
            _print_result(goal.goal_id, [], None, None, "inconclusive")
            return 0
        run = app.last_run(goal.goal_id)
        run_ids = [run.run_id]
        evidence_ids = _repeated_failed_verification_evidence(app, run.run_id)
        if not evidence_ids:
            _print_result(goal.goal_id, run_ids, None, None, "limited")
            return 0
        meta_loop = app.meta_loop(goal.goal_id)
        app.record_learning_signal_on_loop(
            meta_loop.loop_id,
            category="repeated_failed_verification",
            severity=4,
            recurrence=2,
            evidence_ids=evidence_ids,
        )
        ticket = app.process_learning(meta_loop.loop_id)
        if ticket is None:
            _print_result(goal.goal_id, run_ids, None, None, "limited")
            return 0
        case = app.create_learning_case(ticket)
        app.record_learning_attribution(
            case.case_id,
            hypotheses=("the frozen skill lacks a repeated-failure stop condition", "the command had new diagnostics"),
            earliest_divergence="the same failed verification action repeated without new evidence",
            mutation_target="repo_task_skill",
            rejected_targets=("runtime",),
        )
        lesson = app.accept_protocol_fixture_lesson(case.case_id, evidence_ids)
        candidate = app.create_protocol_fixture_candidate(ticket, lesson.lesson_id)
        public = app.run_public_candidate_comparison(
            candidate.version_id,
            (
                EvalCase(
                    case_id="public-contract-stop-replan",
                    category="protocol_fixture",
                    acceptance=("stop and replan after a repeated failed verification",),
                    hard_gates=("correctness",),
                ),
            ),
            execute=_public_fixture_outcome,
        )
        public_metrics = public.metrics
        public_refuted = (
            not public.hard_gate_passed
            or public_metrics.get("safety_delta", 0.0) < 0
            or public_metrics.get("overrefusal", public_metrics.get("over_refusal_delta", 0.0)) > 0
        )
        if public_refuted:
            print(f"Public EvalRun ID: {public.eval_run_id} (refuted)")
            _print_result(goal.goal_id, run_ids, candidate.content_digest, None, "refuted")
            return 0
        print(f"Public EvalRun ID: {public.eval_run_id} (supported)")
        request = app.create_eval_request(candidate.version_id)
        print(f"EvalRequest ID: {request.request_id}")
        command = _evaluator_command(request)
        if command is None:
            print(f"Receipt path: {request.receipt_path}")
            _print_result(
                goal.goal_id, run_ids, candidate.content_digest, f"pending ({request.request_id})", "inconclusive"
            )
            return 0
        completed = subprocess.run(command, cwd=workspace, shell=False, check=False)
        if completed.returncode or not Path(request.receipt_path).is_file():
            raise LiveExperimentError("evaluator command failed or did not write the requested receipt")
        eval_run = app.evaluate_candidate(candidate.version_id)
        label = (
            "refuted"
            if not eval_run.hard_gate_passed
            else "supported"
            if eval_run.metrics["quality_delta"] >= 0
            else "refuted"
        )
        promotion = None
        if args.interactive_promotion:
            if not sys.stdin.isatty():
                _print_result(goal.goal_id, run_ids, candidate.content_digest, eval_run.eval_run_id, "limited")
                return 0
            promotion_id, challenge = app.request_promotion(candidate.version_id)
            approved_by = input("Approver name: ").strip()
            typed = input(f"Retype exact promotion challenge ({challenge}): ")
            promotion = app.confirm_promotion(promotion_id, approved_by, typed)
            if not isinstance(promotion, PromotionRecord):
                promotion = None
            follow_up = app.create_goal(
                objective="Verify the promoted candidate on a different bounded follow-up task.",
                criteria=("record a follow-up outcome",),
                workspace=workspace,
                authorization=("workspace_read", "workspace_write"),
                budget=budget,
            )
            if not _run_task_with_approval(app, follow_up.goal_id, workspace, args.follow_up_request):
                _print_result(goal.goal_id, run_ids, candidate.content_digest, eval_run.eval_run_id, "limited")
                return 0
            follow_run = app.last_run(follow_up.goal_id)
            run_ids.append(follow_run.run_id)
            app.record_capability(
                candidate.version_id,
                task_type="different_follow_up",
                environment="controlled-local-fixture",
                tools=("run_command",),
                risk="bounded",
                outcome="succeeded",
                cost=len(app.execution_evidence(follow_run.run_id)),
                evidence_ids=tuple(item.evidence_id for item in app.execution_evidence(follow_run.run_id)),
            )
        _ = public
        _print_result(goal.goal_id, run_ids, candidate.content_digest, eval_run.eval_run_id, label, promotion)
        return 0
    except LiveExperimentError as error:
        parser.error(str(error))


if __name__ == "__main__":
    raise SystemExit(main())
