from __future__ import annotations

import json
import secrets
from pathlib import Path
from typing import Any

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from pydantic_ai.models.test import TestModel

from tianwen.alpha_docker import DockerPreflight, VerifierResult
from tianwen.alpha_tasks import freeze_task_bundle
from tianwen.domain import BudgetLimit, GoalContract, RunRecord, content_digest
from tianwen.store import StateConflict


class _Model(TestModel):
    def __init__(self, *, fail: bool = False) -> None:
        super().__init__(custom_output_text="completed", call_tools=[])
        self.request_count = 0
        self.prompts: list[str] = []
        self.fail = fail

    async def request(self, messages: list[Any], *args: Any, **kwargs: Any) -> Any:
        self.request_count += 1
        self.prompts.append(str(messages))
        if self.fail:
            raise RuntimeError("provider unavailable")
        return await super().request(messages, *args, **kwargs)


class _Docker:
    def __init__(self, *, final: VerifierResult | None = None) -> None:
        self.final = final or VerifierResult(
            verdict="met", passed_checks=("final",), failed_checks=(), failure_categories=(), summary="ok"
        )
        self.final_calls: list[str] = []

    def preflight(self) -> DockerPreflight:
        return DockerPreflight(
            docker_version="fake",
            engine_id_digest="sha256:engine",
            operating_system="linux",
            architecture="amd64",
            image_reference="python@sha256:manifest",
            image_digest="sha256:manifest",
            data_location="D:/docker",
            free_bytes=1_000_000,
            normalized_config_digest="sha256:config",
        )

    async def run_seed_preflight(self) -> VerifierResult:
        return VerifierResult(
            verdict="not_met",
            passed_checks=(),
            failed_checks=("final",),
            failure_categories=("correctness",),
            summary="seed",
        )

    async def run_final(self, action_id: str) -> VerifierResult:
        self.final_calls.append(action_id)
        return self.final

    async def run(self, action_id: str, check_id: str) -> dict[str, str]:
        return {"action_id": action_id, "check_id": check_id}


def _budget(model_requests: int = 4) -> BudgetLimit:
    return BudgetLimit(model_requests=model_requests, tool_calls=8, tokens=10_000, wall_seconds=300, action_effects=8)


def _data_root() -> Path:
    root = Path("D:/DevData/alpha-task6-tests") / secrets.token_hex(4)
    root.mkdir(parents=True)
    return root


def _bundle(root: Path, task_id: str) -> Path:
    task = root / task_id
    for relative, text in {
        "seed/module.py": "VALUE = 1\n",
        "instruction.md": "Update module.py while preserving the public behavior.",
        "checks/public.py": "print('ok')\n",
        "verifier/verify.py": "print('ok')\n",
        "reference/solution.patch": "",
    }.items():
        path = task / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    rounds: list[dict[str, Any]] = [{"round_id": "round-1", "public_check_ids": ["public"]}]
    sources: list[dict[str, Any]] = []
    if task_id == "A5":
        feedback = "Use casefold and preserve satisfied round-1 behavior; (none) may regress."
        (task / "feedback").mkdir()
        (task / "feedback" / "round-2.md").write_text(feedback, encoding="utf-8")
        rounds.append(
            {
                "round_id": "round-2",
                "public_check_ids": ["public"],
                "follow_up_feedback_digest": content_digest(feedback.encode()),
            }
        )
    if task_id == "A3":
        source = "https://docs.python.org/3/library/urllib.parse.html"
        (task / "sources").mkdir()
        search = json.dumps([{"title": "urllib.parse", "href": source, "body": "urlencode doseq sequence"}])
        fetched = f"{source}\nurlencode doseq sequence-valued query parameters are encoded as separate parameters."
        (task / "sources" / "search.json").write_text(search, encoding="utf-8")
        (task / "sources" / "fetch.md").write_text(fetched, encoding="utf-8")
        sources = [
            {
                "url": source,
                "title": "urllib.parse",
                "retrieved_date": "2026-08-13",
                "search_results_path": "sources/search.json",
                "fetched_content_path": "sources/fetch.md",
                "content_digest": content_digest(fetched.encode()),
                "search_results_digest": content_digest(search.encode()),
            }
        ]
    lock = root / "image.lock"
    lock.write_text(
        json.dumps(
            {
                "schema_version": "tianwen.alpha_image.v1",
                "reference": "python:3.12",
                "immutable_reference": "python@sha256:manifest",
                "platform": "linux/amd64",
                "manifest_digest": "sha256:manifest",
                "platform_digest": "sha256:platform",
            }
        ),
        encoding="utf-8",
    )
    payload = {
        "schema_version": "tianwen.alpha_task.v1",
        "task_id": task_id,
        "task_version": "1.0.0",
        "title": f"Alpha {task_id}",
        "rounds": rounds,
        "public_acceptance": ["public behavior passes"],
        "named_checks": [
            {
                "check_id": "public",
                "script": "public.py",
                "argv": ["python", "-I", "/checks/public.py", "/workspace"],
                "timeout_seconds": 15,
                "output_limit_bytes": 1024,
            }
        ],
        "final_verifier": {
            "verifier_id": "final",
            "argv": ["python", "-I", "/checks/verify.py", "/workspace"],
            "timeout_seconds": 15,
            "output_limit_bytes": 1024,
        },
        "limits": {
            "max_seed_bytes": 4096,
            "max_changed_files": 1,
            "max_changed_bytes": 4096,
            "max_trial_bytes": 4 * 1024 * 1024,
            "min_free_bytes": 0,
            "memory_bytes": 268435456,
            "cpus": 1.0,
            "pids": 64,
            "tmpfs_bytes": 1048576,
        },
        "allowed_write_patterns": ["module.py"],
        "protected_patterns": [".git/**"],
        "sources": sources,
    }
    (task / "task.json").write_text(json.dumps(payload), encoding="utf-8")
    freeze_task_bundle(task, lock)
    return root


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
def runner(tmp_path: Path) -> Any:
    from tianwen.alpha import AlphaTrialRunner

    root = _bundle(tmp_path / "tasks", "A1")
    model = _Model()
    docker = _Docker()
    return AlphaTrialRunner(
        task_root=root,
        image_lock_path=root / "image.lock",
        data_root=_data_root(),
        model=model,
        public_evaluator_key=Ed25519PrivateKey.generate().public_key(),
        docker_factory=lambda *_args: docker,
        allowed_drive="D:",
    )


def _confirmation(prepared: Any) -> Any:
    from tianwen.alpha import TrialConfirmation

    return TrialConfirmation(
        trial_id=prepared.preview.trial_id, preview_digest=content_digest(prepared.preview), confirmed_via="local_tty"
    )


def test_prepare_does_not_create_goal_or_call_model(runner: Any) -> None:
    """Break caught: moving Goal/model work before confirmation spends authority or money."""
    prepared = runner.prepare("A1", budget=_budget())

    assert prepared.preview.task_id == "A1"
    assert prepared.seed_verifier.verdict == "not_met"
    assert runner.model.request_count == 0
    assert runner.store.list_objects("goal", GoalContract) == []


@pytest.mark.anyio
async def test_confirmation_must_match_exact_preview_digest(runner: Any) -> None:
    from tianwen.alpha import AlphaTrialError, TrialConfirmation

    prepared = runner.prepare("A1", budget=_budget())
    forged = TrialConfirmation(
        trial_id=prepared.preview.trial_id, preview_digest="sha256:wrong", confirmed_via="local_tty"
    )

    with pytest.raises(AlphaTrialError, match="preview"):
        await runner.execute(prepared, forged)

    assert runner.model.request_count == 0
    assert runner.store.list_objects("goal", GoalContract) == []


@pytest.mark.anyio
async def test_a5_uses_one_goal_two_runs_one_workspace_and_shared_budget(tmp_path: Path) -> None:
    from tianwen.alpha import AlphaTrialRunner

    root = _bundle(tmp_path / "tasks", "A5")
    model, docker = _Model(), _Docker()
    runner = AlphaTrialRunner(
        task_root=root,
        image_lock_path=root / "image.lock",
        data_root=_data_root(),
        model=model,
        public_evaluator_key=Ed25519PrivateKey.generate().public_key(),
        docker_factory=lambda *_args: docker,
        allowed_drive="D:",
    )
    prepared = runner.prepare("A5", budget=_budget())
    result = await runner.execute(prepared, _confirmation(prepared))

    runs = [runner.store.get_object("run", run_id, RunRecord) for run_id in result.run_ids]
    assert len(runs) == 2
    assert (
        len(
            {
                runner.store.get_object("task", run.task_id, type(runner.app.goal_task(result.goal_id))).loop_id
                for run in runs
            }
        )
        == 1
    )
    assert [run.manifest.round_id for run in runs] == ["round-1", "round-2"]
    assert all(run.manifest.trial_id == result.trial_id for run in runs)
    assert result.workspace_path == str(prepared.paths.workspace)
    assert result.usage.model_requests == 2
    assert "casefold" not in model.prompts[0]
    assert "(none)" not in model.prompts[0]
    assert (
        content_digest("Use casefold and preserve satisfied round-1 behavior; (none) may regress.")
        not in model.prompts[0]
    )


@pytest.mark.anyio
async def test_a3_records_frozen_source_before_execution_model_request(tmp_path: Path) -> None:
    from tianwen.alpha import AlphaTrialRunner

    root = _bundle(tmp_path / "tasks", "A3")
    model, docker = _Model(), _Docker()
    runner = AlphaTrialRunner(
        task_root=root,
        image_lock_path=root / "image.lock",
        data_root=_data_root(),
        model=model,
        public_evaluator_key=Ed25519PrivateKey.generate().public_key(),
        docker_factory=lambda *_args: docker,
        allowed_drive="D:",
    )
    prepared = runner.prepare("A3", budget=_budget())
    result = await runner.execute(prepared, _confirmation(prepared))

    assert result.exploration_run_ids
    packet = runner.app.goal_evidence_packet(result.goal_id)
    assert packet["sources"][0]["locator"].startswith("https://docs.python.org/")
    assert "UNTRUSTED_SOURCE_DATA" in packet["evidence"][0]["untrusted_data"]
    first_model_event = next(
        event for event in runner.store.list_events(result.run_ids[0]) if event.kind == "run_started"
    )
    assert runner.exploration_finished_at <= first_model_event.created_at


@pytest.mark.anyio
async def test_provider_failure_still_settles_final_verification(tmp_path: Path) -> None:
    from tianwen.alpha import AlphaTrialRunner

    root = _bundle(tmp_path / "tasks", "A1")
    docker = _Docker()
    runner = AlphaTrialRunner(
        task_root=root,
        image_lock_path=root / "image.lock",
        data_root=_data_root(),
        model=_Model(fail=True),
        public_evaluator_key=Ed25519PrivateKey.generate().public_key(),
        docker_factory=lambda *_args: docker,
        allowed_drive="D:",
    )
    prepared = runner.prepare("A1", budget=_budget())
    result = await runner.execute(prepared, _confirmation(prepared))

    assert result.execution_status == "failed"
    assert result.verification_status == "completed"
    assert docker.final_calls
    assert "trial-result.json" not in {item.path for item in result.artifacts}
    assert await runner.resume(result.trial_id) == result
    recovered = AlphaTrialRunner(
        task_root=root,
        image_lock_path=root / "image.lock",
        data_root=prepared.paths.data_root,
        model=_Model(),
        docker_factory=lambda *_args: docker,
        allowed_drive="D:",
    )
    assert await recovered.resume(result.trial_id) == result


def test_conflicting_immutable_result_is_rejected(runner: Any) -> None:
    from tianwen.alpha import TrialResult

    prepared = runner.prepare("A1", budget=_budget())
    first = TrialResult.model_construct(trial_id=prepared.preview.trial_id)
    runner.store.put_immutable_object("alpha_trial_result", prepared.preview.trial_id, None, "finished", first)
    with pytest.raises(StateConflict):
        runner.store.put_immutable_object(
            "alpha_trial_result",
            prepared.preview.trial_id,
            None,
            "finished",
            TrialResult.model_construct(trial_id=prepared.preview.trial_id, verdict="met"),
        )
