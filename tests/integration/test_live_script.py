from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

from tianwen.domain import ActionStatus, ExplorationStopReason, PromotionRecord


def _live_script():
    path = Path(__file__).parents[2] / "scripts" / "run_live_vertical_slice.py"
    spec = importlib.util.spec_from_file_location("live_vertical_slice", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _public_key(path: Path) -> Path:
    key = Ed25519PrivateKey.generate().public_key()
    path.write_bytes(key.public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo))
    return path


class _RecordingApp:
    def __init__(self) -> None:
        self.calls: list[str] = []
        self.first_run = 0
        self.request = SimpleNamespace(
            request_id="request-1",
            champion_snapshot="champion.snapshot",
            challenger_snapshot="challenger.snapshot",
            challenge="challenge-1",
            receipt_path="receipt.json",
        )
        failed_a = SimpleNamespace(
            action_id="action-1", tool_name="run_command", args_digest="sha256:same", status=ActionStatus.FAILED
        )
        failed_b = SimpleNamespace(
            action_id="action-2", tool_name="run_command", args_digest="sha256:same", status=ActionStatus.FAILED
        )
        self.store = SimpleNamespace(list_actions=lambda run_id: (failed_a, failed_b))

    def create_goal(self, **kwargs):
        self.calls.append(f"create_goal:{kwargs.get('kind', SimpleNamespace(value='user')).value}")
        return SimpleNamespace(goal_id=f"goal-{len([call for call in self.calls if call.startswith('create_goal')])}")

    def goal_task(self, goal_id):
        self.calls.append(f"goal_task:{goal_id}")
        return SimpleNamespace(task_id=f"task-{goal_id}")

    def explore(self, goal_id, brief, *, live=False):
        self.calls.append(f"explore:{goal_id}:{live}")
        return SimpleNamespace(
            stop_reason=ExplorationStopReason.SUFFICIENT,
            evidence_ids=("evidence-1",),
            remaining_unknowns=(),
        )

    def run_repo_task(self, goal_id, workspace, request):
        self.first_run += 1
        self.calls.append(f"run:{goal_id}:{request}")
        return "finished"

    def last_run(self, goal_id):
        self.calls.append(f"last_run:{goal_id}")
        return SimpleNamespace(run_id=f"run-{goal_id}")

    def pending_approval(self, checkpoint_id):
        raise AssertionError("the controlled fake run has no pending approval")

    def resume_approval(self, checkpoint_id, approvals):
        raise AssertionError("the controlled fake run has no pending approval")

    def execution_evidence(self, run_id):
        self.calls.append(f"execution_evidence:{run_id}")
        return (
            SimpleNamespace(evidence_id="evidence-1", evidence_type="execution_test", action_id="action-1"),
            SimpleNamespace(evidence_id="evidence-2", evidence_type="execution_test", action_id="action-2"),
        )

    def meta_loop(self, goal_id):
        self.calls.append(f"meta_loop:{goal_id}")
        return SimpleNamespace(loop_id=f"meta-{goal_id}")

    def record_learning_signal_on_loop(self, loop_id, **kwargs):
        self.calls.append(f"signal:{loop_id}:{kwargs['category']}")
        return "signal-1"

    def process_learning(self, loop_id):
        self.calls.append(f"process_learning:{loop_id}")
        return "ticket-1"

    def create_learning_case(self, ticket_id):
        self.calls.append(f"case:{ticket_id}")
        return SimpleNamespace(case_id="case-1")

    def record_learning_attribution(self, case_id, **kwargs):
        self.calls.append(f"attribution:{case_id}")
        return SimpleNamespace(attribution_id="attribution-1")

    def accept_protocol_fixture_lesson(self, case_id, evidence_ids, **kwargs):
        self.calls.append(f"lesson:{case_id}")
        return SimpleNamespace(lesson_id="lesson-1")

    def create_protocol_fixture_candidate(self, ticket_id, lesson_id):
        self.calls.append(f"candidate:{ticket_id}:{lesson_id}")
        return SimpleNamespace(
            version_id="sha256:candidate",
            content_digest="sha256:candidate",
            content="Stop and replan instead of repeating an identical failed verification command.",
        )

    def run_public_candidate_comparison(self, candidate_id, cases, *, execute):
        self.calls.append(f"public_comparison:{candidate_id}")
        challenger = SimpleNamespace(
            version_id=candidate_id,
            content="Stop and replan instead of repeating an identical failed verification command.",
        )
        outcome = execute(challenger, cases[0])
        assert outcome.passed and outcome.quality == 1
        return SimpleNamespace(
            eval_run_id="public-eval-1",
            hard_gate_passed=True,
            metrics={"quality_delta": 1.0, "safety_delta": 0.0, "over_refusal_delta": 0.0},
        )

    def create_eval_request(self, candidate_id):
        self.calls.append(f"eval_request:{candidate_id}")
        return self.request

    def evaluate_candidate(self, candidate_id):
        self.calls.append(f"eval_import:{candidate_id}")
        return SimpleNamespace(eval_run_id="eval-1", hard_gate_passed=True, metrics={"quality_delta": 1.0})

    def request_promotion(self, candidate_id):
        self.calls.append(f"promotion_request:{candidate_id}")
        return "promotion-1", "type-this"

    def confirm_promotion(self, request_id, approved_by, typed):
        self.calls.append(f"promotion_confirm:{request_id}:{approved_by}:{typed}")
        return PromotionRecord(
            promotion_id="promotion-1",
            artifact_id="repo-task",
            from_version_id="sha256:old",
            to_version_id="sha256:candidate",
            eval_run_id="eval-1",
            approval_receipt_id="approval-1",
            approved_by=approved_by,
            reason="controlled test",
        )

    def record_capability(self, version_id, **kwargs):
        self.calls.append(f"capability:{version_id}:{kwargs['outcome']}")
        return SimpleNamespace()


def _args(tmp_path: Path, *extra: str) -> list[str]:
    return [
        "--workspace",
        str(tmp_path),
        "--data-dir",
        str(tmp_path / "state"),
        "--max-tokens",
        "200",
        *extra,
    ]


def test_live_script_executes_controlled_chain_and_imports_receipt(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """Break caught: replacing orchestration with status output skips governed experimental evidence."""
    script = _live_script()
    app = _RecordingApp()
    app.request.receipt_path = str(tmp_path / "receipt.json")
    key = _public_key(tmp_path / "evaluator-public.pem")
    monkeypatch.setenv("TIANWEN_MODEL", "test-model")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("TIANWEN_EVALUATOR_PUBLIC_KEY", str(key))
    monkeypatch.setenv(
        "TIANWEN_EVALUATOR_COMMAND_JSON",
        json.dumps(
            [
                sys.executable,
                "-c",
                "from pathlib import Path; Path(__import__('sys').argv[5]).write_text('receipt')",
                "{champion_snapshot}",
                "{challenger_snapshot}",
                "{protocol_manifest}",
                "{challenge}",
                "{receipt_path}",
            ]
        ),
    )
    monkeypatch.setattr(script, "_make_app", lambda args, key: app)
    monkeypatch.setattr(script, "_validate_workspace", lambda workspace: None)
    monkeypatch.setattr(script.sys.stdin, "isatty", lambda: True)
    monkeypatch.setattr("builtins.input", lambda prompt: "type-this" if "challenge" in prompt else "alice")

    assert script.main(_args(tmp_path, "--interactive-promotion")) == 0

    output = capsys.readouterr().out
    assert "Goal ID: goal-1" in output
    assert "Run IDs: run-goal-1, run-goal-2" in output
    assert "Candidate digest: sha256:candidate" in output
    assert "EvalRun ID: eval-1" in output
    assert "Public EvalRun ID: public-eval-1" in output
    assert "Final label: supported" in output
    assert "Rollback command:" in output
    assert app.calls == [
        "create_goal:user",
        "goal_task:goal-1",
        "explore:goal-1:False",
        "run:goal-1:Implement the bounded repository task after exploration.",
        "last_run:goal-1",
        "execution_evidence:run-goal-1",
        "meta_loop:goal-1",
        "signal:meta-goal-1:repeated_failed_verification",
        "process_learning:meta-goal-1",
        "case:ticket-1",
        "attribution:case-1",
        "lesson:case-1",
        "candidate:ticket-1:lesson-1",
        "public_comparison:sha256:candidate",
        "eval_request:sha256:candidate",
        "eval_import:sha256:candidate",
        "promotion_request:sha256:candidate",
        "promotion_confirm:promotion-1:alice:type-this",
        "create_goal:user",
        "run:goal-2:Run a different follow-up task after the human-approved promotion.",
        "last_run:goal-2",
        "execution_evidence:run-goal-2",
        "execution_evidence:run-goal-2",
        "capability:sha256:candidate:succeeded",
    ]


@pytest.mark.parametrize(
    "credential_name",
    ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "DEEPSEEK_API_KEY"],
)
def test_live_script_without_evaluator_stops_at_eval_request(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    credential_name: str,
) -> None:
    """Break caught: a valid provider credential can be rejected before its model is constructed."""
    script = _live_script()
    app = _RecordingApp()
    key = _public_key(tmp_path / "evaluator-public.pem")
    monkeypatch.setenv("TIANWEN_MODEL", "test-model")
    for name in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "DEEPSEEK_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv(credential_name, "test-key")
    monkeypatch.setenv("TIANWEN_EVALUATOR_PUBLIC_KEY", str(key))
    monkeypatch.delenv("TIANWEN_EVALUATOR_COMMAND_JSON", raising=False)
    monkeypatch.setattr(script, "_make_app", lambda args, key: app)
    monkeypatch.setattr(script, "_validate_workspace", lambda workspace: None)

    assert script.main(_args(tmp_path)) == 0

    output = capsys.readouterr().out
    assert "EvalRequest ID: request-1" in output
    assert "Receipt path: receipt.json" in output
    assert "EvalRun ID: pending (request-1)" in output
    assert "Final label: inconclusive" in output
    assert "Rollback: unavailable until promotion" in output
    assert "eval_import" not in " ".join(app.calls)
    assert "promotion_request" not in " ".join(app.calls)


def test_live_script_rejects_non_exact_evaluator_template_placeholder(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Break caught: formatting syntax could turn an approved bundle placeholder into a different argument."""
    script = _live_script()
    monkeypatch.setenv("TIANWEN_EVALUATOR_COMMAND_JSON", json.dumps(["tool", "{challenge!r}"]))

    with pytest.raises(script.LiveExperimentError, match="unsupported placeholder"):
        script._evaluator_command(_RecordingApp().request)


@pytest.mark.parametrize(
    "command",
    [
        ["tool", "{champion_snapshot}"],
        [
            "tool",
            "{champion_snapshot}",
            "{champion_snapshot}",
            "{challenger_snapshot}",
            "{protocol_manifest}",
            "{challenge}",
            "{receipt_path}",
        ],
        [
            "tool",
            "{champion_snapshot}",
            "{challenger_snapshot}",
            "{protocol_manifest}",
            "{challenge}",
            "{receipt_path}",
            "{unknown}",
        ],
        ["tool", "{champion_snapshot", "{challenger_snapshot}", "{protocol_manifest}", "{challenge}", "{receipt_path}"],
    ],
)
def test_live_script_requires_exactly_one_of_each_evaluator_placeholder(
    monkeypatch: pytest.MonkeyPatch, command: list[str]
) -> None:
    script = _live_script()
    monkeypatch.setenv("TIANWEN_EVALUATOR_COMMAND_JSON", json.dumps(command))

    with pytest.raises(script.LiveExperimentError, match="exactly once|unsupported placeholder"):
        script._evaluator_command(_RecordingApp().request)


def test_live_script_keeps_static_legacy_evaluator_command_usable(monkeypatch: pytest.MonkeyPatch) -> None:
    script = _live_script()
    monkeypatch.delenv("TIANWEN_EVALUATOR_COMMAND_JSON", raising=False)
    monkeypatch.setenv("TIANWEN_EVALUATOR_COMMAND", "tool --static")

    assert script._evaluator_command(_RecordingApp().request) == ["tool", "--static"]


def test_live_script_stops_after_public_eval_gate_failure(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    script = _live_script()
    app = _RecordingApp()
    app.run_public_candidate_comparison = lambda candidate_id, cases, execute: SimpleNamespace(
        eval_run_id="public-eval-refuted",
        hard_gate_passed=False,
        metrics={"safety_delta": -1.0, "overrefusal": 1.0},
    )
    key = _public_key(tmp_path / "evaluator-public.pem")
    monkeypatch.setenv("TIANWEN_MODEL", "test-model")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("TIANWEN_EVALUATOR_PUBLIC_KEY", str(key))
    monkeypatch.setattr(script, "_make_app", lambda args, key: app)
    monkeypatch.setattr(script, "_validate_workspace", lambda workspace: None)

    assert script.main(_args(tmp_path)) == 0

    output = capsys.readouterr().out
    assert "Public EvalRun ID: public-eval-refuted (refuted)" in output
    assert "Final label: refuted" in output
    assert "eval_request" not in " ".join(app.calls)
    assert "eval_import" not in " ".join(app.calls)
    assert "promotion_request" not in " ".join(app.calls)


def test_cli_learn_accepts_goal_or_loop_and_resolves_goal_to_meta_loop(monkeypatch: pytest.MonkeyPatch) -> None:
    from tianwen.cli import build_parser, main

    app = _RecordingApp()
    monkeypatch.setattr("tianwen.cli._app", lambda args: app)

    parsed = build_parser().parse_args(["learn", "--goal", "goal-1"])
    assert parsed.goal == "goal-1"
    assert parsed.loop is None
    assert main(["learn", "--goal", "goal-1"]) == 0
    assert app.calls[-2:] == ["meta_loop:goal-1", "process_learning:meta-goal-1"]

    app.calls.clear()
    assert main(["learn", "--loop", "loop-1"]) == 0
    assert app.calls == ["process_learning:loop-1"]

    with pytest.raises(SystemExit):
        build_parser().parse_args(["learn"])


def test_live_script_parser_and_worktree_validation_are_real(tmp_path: Path) -> None:
    """Break caught: an ordinary checkout or dirty disposable worktree could be used for a live mutation."""
    script = _live_script()
    parser = script.build_parser()
    parsed = parser.parse_args(_args(tmp_path, "--objective", "objective", "--criterion", "criterion"))
    assert parsed.live_web is False
    assert parsed.objective == "objective"
    with pytest.raises(script.LiveExperimentError, match="disposable Git worktree"):
        script._validate_workspace(tmp_path)

    main_repo = tmp_path / "main"
    main_repo.mkdir()
    subprocess.run(["git", "init"], cwd=main_repo, check=True, capture_output=True)
    (main_repo / "tracked.txt").write_text("base", encoding="utf-8")
    subprocess.run(["git", "add", "tracked.txt"], cwd=main_repo, check=True, capture_output=True)
    subprocess.run(
        ["git", "-c", "user.name=test", "-c", "user.email=test@example.invalid", "commit", "-m", "base"],
        cwd=main_repo,
        check=True,
        capture_output=True,
    )
    worktree = tmp_path / "worktree"
    subprocess.run(
        ["git", "worktree", "add", "-b", "test-worktree", str(worktree)],
        cwd=main_repo,
        check=True,
        capture_output=True,
    )
    assert (worktree / ".git").is_file()
    script._validate_workspace(worktree)
    (worktree / "tracked.txt").write_text("dirty", encoding="utf-8")
    with pytest.raises(script.LiveExperimentError, match="clean"):
        script._validate_workspace(worktree)
