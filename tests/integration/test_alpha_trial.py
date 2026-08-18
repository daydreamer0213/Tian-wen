from __future__ import annotations

import asyncio
import json
import secrets
import sqlite3
from pathlib import Path
from typing import Any

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from pydantic_ai.messages import UserPromptPart
from pydantic_ai.models.test import TestModel

from tianwen.alpha_docker import DockerExecutionError, DockerPreflight, VerifierResult
from tianwen.alpha_tasks import freeze_task_bundle
from tianwen.domain import ActionStatus, BudgetLimit, GoalContract, RunRecord, RunStatus, content_digest
from tianwen.gateway import EffectClass, freeze_action, proposal_action_id
from tianwen.store import StateConflict


class _Model(TestModel):
    def __init__(self, *, fail: bool = False, output: str = "completed") -> None:
        super().__init__(custom_output_text=output, call_tools=[])
        self.request_count = 0
        self.prompts: list[str] = []
        self.request_payloads: list[dict[str, Any]] = []
        self.fail = fail

    async def request(self, messages: list[Any], *args: Any, **kwargs: Any) -> Any:
        self.request_count += 1
        self.prompts.append(str(messages))
        self.request_payloads.append(
            json.loads(
                next(
                    part.content
                    for message in messages
                    for part in message.parts
                    if isinstance(part, UserPromptPart) and isinstance(part.content, str)
                )
            )
        )
        if self.fail:
            raise RuntimeError("provider unavailable")
        return await super().request(messages, *args, **kwargs)


class _Docker:
    def __init__(self, *, final: VerifierResult | None = None, config_marker: str = "default") -> None:
        self.final = final or VerifierResult(
            verdict="met", passed_checks=("final",), failed_checks=(), failure_categories=(), summary="ok"
        )
        self.config_marker = config_marker
        self.final_calls: list[str] = []
        self.check_calls: list[tuple[str, str]] = []
        self.preflight_calls = 0
        self.seed_preflight_calls = 0

    def preflight(self) -> DockerPreflight:
        self.preflight_calls += 1
        return DockerPreflight(
            docker_version="fake",
            engine_id_digest="sha256:engine",
            operating_system="linux",
            architecture="amd64",
            image_reference="python@sha256:manifest",
            image_digest="sha256:manifest",
            data_location="D:/docker",
            free_bytes=1_000_000,
            normalized_config_digest=content_digest(self._normalized_config("public")),
        )

    def _normalized_config(self, check_id: str, *, final: bool = False) -> dict[str, Any]:
        script = "verify.py" if final else f"{check_id}.py"
        return {
            "image_manifest_digest": "sha256:manifest",
            "image_platform_digest": "sha256:platform",
            "platform": "linux/amd64",
            "network": "none",
            "read_only": True,
            "user": "65532:65532",
            "cap_drop": ("ALL",),
            "security_opt": ("no-new-privileges",),
            "cpus": 1,
            "memory_bytes": 268_435_456,
            "pids": 64,
            "tmpfs_bytes": 67_108_864,
            "output_limit_bytes": 1024,
            "log_driver": "local",
            "log_options": ("max-size=1024", "max-file=1"),
            "mounts": ("/workspace", f"/checks/{script}"),
            "working_dir": "/workspace",
            "environment": ("HOME=/tmp", "TMPDIR=/tmp", "PYTHONDONTWRITEBYTECODE=1"),
            "argv": ("python", "-I", f"/checks/{script}", "/workspace", self.config_marker),
        }

    async def run_seed_preflight(self) -> VerifierResult:
        self.seed_preflight_calls += 1
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
        self.check_calls.append((action_id, check_id))
        return {"action_id": action_id, "check_id": check_id}


def _effect_counts(docker: _Docker) -> tuple[int, int, int, int]:
    return docker.preflight_calls, docker.seed_preflight_calls, len(docker.check_calls), len(docker.final_calls)


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
    named_checks: list[dict[str, Any]] = [
        {
            "check_id": "public",
            "script": "public.py",
            "argv": ["python", "-I", "/checks/public.py", "/workspace"],
            "timeout_seconds": 15,
            "output_limit_bytes": 1024,
        }
    ]
    sources: list[dict[str, Any]] = []
    if task_id == "A5":
        feedback = "Use casefold and preserve satisfied round-1 behavior; (none) may regress."
        (task / "feedback").mkdir()
        (task / "feedback" / "round-2.md").write_text(feedback, encoding="utf-8")
        rounds.append(
            {
                "round_id": "round-2",
                "public_check_ids": ["round-2-public"],
                "follow_up_feedback_digest": content_digest(feedback.encode()),
            }
        )
        (task / "checks" / "round-2.py").write_text("print('ok')\n", encoding="utf-8")
        named_checks.append(
            {
                "check_id": "round-2-public",
                "script": "round-2.py",
                "argv": ["python", "-I", "/checks/round-2.py", "/workspace"],
                "timeout_seconds": 15,
                "output_limit_bytes": 1024,
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
        "named_checks": named_checks,
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


def test_approved_goal_budget_confirmation_binds_the_exact_preview(runner: Any) -> None:
    from tianwen.alpha import TrialConfirmation

    prepared = runner.prepare("A1", budget=_budget())
    confirmation = TrialConfirmation(
        trial_id=prepared.preview.trial_id,
        preview_digest=content_digest(prepared.preview),
        confirmed_via="approved_goal_budget",
    )

    assert confirmation.trial_id == prepared.preview.trial_id
    assert confirmation.preview_digest == content_digest(prepared.preview)


def _runner(root: Path, model: _Model, docker: _Docker, data_root: Path | None = None) -> Any:
    from tianwen.alpha import AlphaTrialRunner

    return AlphaTrialRunner(
        task_root=root,
        image_lock_path=root / "image.lock",
        data_root=data_root or _data_root(),
        model=model,
        docker_factory=lambda *_args: docker,
        allowed_drive="D:",
    )


def _repo_task_candidate(parent_version_id: str, content: str = "candidate repo-task behavior") -> Any:
    from tianwen.domain import ArtifactStatus, ArtifactVersion

    digest = content_digest(content)
    return ArtifactVersion(
        artifact_id="repo-task",
        artifact_type="repo_task_skill",
        version_id=digest,
        parent_version_id=parent_version_id,
        content_digest=digest,
        content=content,
        evidence_ids=(),
        status=ArtifactStatus.CANDIDATE,
    )


def _persist_running_trial(runner: Any, prepared: Any, *, round_id: str = "round-1") -> tuple[Any, Any, Any]:
    """Persist a completed first round exactly as recovery would observe it."""
    from tianwen.alpha import AlphaTrialState
    from tianwen.domain import RunManifest

    confirmation = _confirmation(prepared)
    runner.store.put_immutable_object(
        "alpha_trial_confirmation", prepared.preview.trial_id, None, "confirmed", confirmation
    )
    goal = runner.app.create_goal(
        objective=prepared.preview.objective,
        criteria=prepared.preview.acceptance,
        workspace=prepared.paths.workspace,
        authorization=prepared.preview.authorizations,
        budget=prepared.preview.budget,
    )
    manifest = runner._manifest(prepared, goal, confirmation)
    runner.store.put_immutable_object(
        "alpha_trial_manifest", prepared.preview.trial_id, goal.goal_id, "active", manifest
    )
    prepared.paths.trial_manifest_json.write_bytes(manifest.model_dump_json().encode("utf-8"))
    run_id = f"alpha:{prepared.preview.trial_id}:{round_id}"
    round_authority = manifest.runtime_policy_snapshot["rounds"][round_id]
    round_tools = manifest.tool_contract_snapshot["rounds"][round_id]
    run = RunRecord(
        run_id=run_id,
        task_id=runner.app.goal_task(goal.goal_id).task_id,
        status=RunStatus.COMPLETED,
        manifest=RunManifest(
            workflow_version="tianwen-alpha-v1",
            schema_version="2",
            pydantic_ai_version="2.18.0",
            harness_version="0.13.0",
            model_id=prepared.preview.model_id,
            prompt_digest=round_authority["prompt_digest"],
            skill_versions={"repo_task": manifest.champion_version_id},
            skill_digests={"repo_task": manifest.champion_digest},
            policy_digest=round_authority["policy_digest"],
            tool_contract_digest=round_tools["tool_contract_digest"],
            goal_contract_digest=manifest.goal_contract_digest,
            workspace_digest=content_digest(str(prepared.paths.workspace.resolve())),
            trial_id=prepared.preview.trial_id,
            round_id=round_id,
            trial_manifest_digest=content_digest(manifest),
        ),
    )
    runner.store.put_object("run", run_id, run.task_id, "completed", run)
    state = runner.store.get_object("alpha_trial_state", prepared.preview.trial_id, AlphaTrialState)
    runner.store.put_object(
        "alpha_trial_state",
        state.trial_id,
        None,
        "running",
        state.model_copy(
            update={
                "stage": "running",
                "trial_manifest_digest": content_digest(manifest),
                "goal_id": goal.goal_id,
                "run_ids": (run_id,),
                "completed_round_ids": (round_id,),
            }
        ),
    )
    return goal, manifest, run


def test_prepare_binds_explicit_artifact_without_changing_active_pointer(tmp_path: Path) -> None:
    root, docker = _bundle(tmp_path / "tasks", "A1"), _Docker()
    runner = _runner(root, _Model(), docker)
    default = runner.prepare("A1", budget=_budget())
    candidate = _repo_task_candidate(default.champion_version_id)

    prepared = runner.prepare("A1", budget=_budget(), artifact_version=candidate)

    assert prepared.champion_version_id == candidate.version_id
    assert prepared.champion_digest == candidate.content_digest
    assert prepared.preview.champion_version_id == candidate.version_id
    assert prepared.preview.champion_digest == candidate.content_digest
    assert prepared._app.artifact(candidate.version_id) == candidate
    assert prepared._app.active_version("repo-task") == default.champion_version_id
    skill = prepared._app.materialize_skill(candidate.version_id) / "repo-task" / "SKILL.md"
    assert skill.read_text(encoding="utf-8") == candidate.content
    assert runner.model.request_count == 0


@pytest.mark.parametrize(
    "updates,match",
    [
        ({"artifact_id": "other"}, "artifact id"),
        ({"artifact_type": "other"}, "artifact type"),
        ({"content_digest": "sha256:wrong"}, "content digest"),
        ({"status": "shadow"}, "status"),
        ({"parent_version_id": "sha256:wrong"}, "parent"),
    ],
)
def test_prepare_rejects_invalid_explicit_artifact_before_model_request(
    tmp_path: Path, updates: dict[str, Any], match: str
) -> None:
    from tianwen.alpha import AlphaTrialError

    root, docker = _bundle(tmp_path / match.replace(" ", "-") / "tasks", "A1"), _Docker()
    model = _Model()
    runner = _runner(root, model, docker)
    default = runner.prepare("A1", budget=_budget())
    candidate = _repo_task_candidate(default.champion_version_id).model_copy(update=updates)

    with pytest.raises(AlphaTrialError, match=match):
        runner.prepare("A1", budget=_budget(), artifact_version=candidate)

    assert model.request_count == 0


def test_prepare_rejects_conflicting_explicit_artifact_replay(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from tianwen.store import StateStore

    root, docker = _bundle(tmp_path / "tasks", "A1"), _Docker()
    model = _Model()
    runner = _runner(root, model, docker)
    default = runner.prepare("A1", budget=_budget())
    candidate = _repo_task_candidate(default.champion_version_id)
    original = StateStore.put_immutable_object

    def conflict_once(
        store: StateStore, kind: str, object_id: str, parent_id: str | None, status: str, value: Any
    ) -> None:
        if kind == "artifact" and object_id == candidate.version_id:
            monkeypatch.setattr(StateStore, "put_immutable_object", original)
            conflicting = candidate.model_copy(update={"evidence_ids": ("different",)})
            original(store, kind, object_id, parent_id, status, conflicting)
        original(store, kind, object_id, parent_id, status, value)

    monkeypatch.setattr(StateStore, "put_immutable_object", conflict_once)

    with pytest.raises(StateConflict, match="conflicting immutable artifact replay"):
        runner.prepare("A1", budget=_budget(), artifact_version=candidate)

    assert model.request_count == 0


def test_condition_snapshot_is_stable_across_explicit_artifacts_and_isolated_trials(tmp_path: Path) -> None:
    root = _bundle(tmp_path / "tasks", "A1")
    champion_runner = _runner(root, _Model(), _Docker())
    champion = champion_runner.prepare("A1", budget=_budget())
    candidate = _repo_task_candidate(champion.champion_version_id)
    challenger_runner = _runner(root, _Model(), _Docker())
    challenger = challenger_runner.prepare("A1", budget=_budget(), artifact_version=candidate)

    champion_snapshot = champion_runner.condition_snapshot(champion)
    challenger_snapshot = challenger_runner.condition_snapshot(challenger)

    assert champion_snapshot == challenger_snapshot
    assert champion.preview.trial_id != challenger.preview.trial_id
    assert champion.paths.workspace.resolve() != challenger.paths.workspace.resolve()
    assert champion.champion_digest != challenger.champion_digest
    assert champion_snapshot.task_id == "A1"
    assert champion_snapshot.task_version == champion.preview.task_version
    assert champion_snapshot.task_bundle_digest == champion.preview.task_bundle_digest
    assert champion_snapshot.model_input_digest == champion._bundle.model_input_digest
    assert champion_snapshot.round_order == ("round-1",)
    assert champion_snapshot.objective == champion.preview.objective
    assert champion_snapshot.acceptance == champion.preview.acceptance
    assert champion_snapshot.rounds == champion.preview.rounds
    assert champion_snapshot.authorizations == champion.preview.authorizations
    assert champion_snapshot.budget == _budget()
    assert champion_snapshot.model_id == champion.preview.model_id
    assert champion_snapshot.provider_name == champion.preview.provider_name
    assert champion_snapshot.pydantic_ai_version
    assert champion_snapshot.harness_version
    assert champion_snapshot.image_manifest_digest == champion._bundle.image_lock.manifest_digest
    assert champion_snapshot.image_platform_digest == champion._bundle.image_lock.platform_digest
    assert champion_snapshot.container_config_snapshot
    assert champion_snapshot.named_checks_snapshot
    assert champion_snapshot.verifier_snapshot
    assert champion_snapshot.baseline_tree_digest == champion.baseline.digest
    assert set(champion_snapshot.runtime_policy_snapshot["rounds"]) == {"round-1"}
    assert set(champion_snapshot.tool_contract_snapshot["rounds"]) == {"round-1"}

    def keys(value: Any) -> set[str]:
        if isinstance(value, dict):
            return set(value) | set().union(*(keys(item) for item in value.values()))
        if isinstance(value, (list, tuple)):
            return set().union(*(keys(item) for item in value))
        return set()

    snapshot_keys = keys(champion_snapshot.model_dump(mode="json"))
    assert not snapshot_keys & {
        "trial_id",
        "goal_id",
        "goal_contract_digest",
        "confirmation_digest",
        "prompt",
        "prompt_digest",
        "workspace",
        "workspace_digest",
        "workspace_identity",
        "skill_dir",
        "champion_version_id",
        "champion_digest",
    }


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
    from tianwen.alpha import AlphaTrialRunner, TrialManifest

    root = Path(__file__).parents[2] / "alpha"
    model, docker = _Model(), _Docker()
    runner = AlphaTrialRunner(
        task_root=root / "tasks",
        image_lock_path=root / "environment" / "image.lock",
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
    goal = runner.store.get_object("goal", result.goal_id, GoalContract)
    manifest = runner.store.get_object("alpha_trial_manifest", result.trial_id, TrialManifest)
    assert goal.budget == prepared.preview.budget == manifest.budget
    assert all(run.manifest.goal_contract_digest == content_digest(goal) for run in runs)
    assert all(run.manifest.workspace_digest == content_digest(str(prepared.paths.workspace.resolve())) for run in runs)
    assert all(run.manifest.skill_versions["repo_task"] == manifest.champion_version_id for run in runs)
    assert all(run.manifest.skill_digests["repo_task"] == manifest.champion_digest for run in runs)
    assert all(run.manifest.trial_manifest_digest == content_digest(manifest) for run in runs)
    authorities = manifest.runtime_policy_snapshot["rounds"]
    assert authorities["round-1"]["policy"]["public_check_ids"] == ["round-1"]
    assert authorities["round-2"]["policy"]["public_check_ids"] == ["round-2"]
    task_dir = root / "tasks" / "A5"
    instruction = (task_dir / "instruction.md").read_text(encoding="utf-8")
    feedback = (task_dir / "feedback" / "round-2.md").read_text(encoding="utf-8")
    assert model.request_payloads[0]["instruction"] == instruction
    assert model.request_payloads[0]["feedback"] is None
    assert model.request_payloads[1]["instruction"] == instruction
    assert model.request_payloads[1]["feedback"] == feedback
    for value in (feedback, "casefold", "(none)"):
        assert value not in json.dumps(
            {
                "prompt": model.request_payloads[0],
                "policy": authorities["round-1"],
                "tools": manifest.tool_contract_snapshot["rounds"]["round-1"],
                "evidence": runner.app.goal_evidence_packet(goal.goal_id),
                "errors": [run.status_reason for run in runs],
            },
            ensure_ascii=False,
            default=str,
        )
    assert "casefold" in model.request_payloads[1]["feedback"]
    assert "(none)" in model.request_payloads[1]["feedback"]


@pytest.mark.anyio
async def test_a5_manifest_freezes_each_round_prompt_policy_and_tool_authority(tmp_path: Path) -> None:
    """Break caught: round-2 authority must be frozen separately without leaking feedback into round 1."""
    from tianwen.alpha import TrialManifest
    from tianwen.alpha_runtime import alpha_runtime_manifest_digests

    root, docker = _bundle(tmp_path / "tasks", "A5"), _Docker()
    runner = _runner(root, _Model(), docker)
    prepared = runner.prepare("A5", budget=_budget())
    result = await runner.execute(prepared, _confirmation(prepared))

    manifest = runner.store.get_object("alpha_trial_manifest", result.trial_id, TrialManifest)
    authorities = manifest.runtime_policy_snapshot["rounds"]
    tools = manifest.tool_contract_snapshot["rounds"]
    assert set(authorities) == {"round-1", "round-2"}
    assert set(tools) == {"round-1", "round-2"}
    assert authorities["round-1"]["prompt"]["feedback"] is None
    assert authorities["round-2"]["prompt"]["feedback"] == (
        "Use casefold and preserve satisfied round-1 behavior; (none) may regress."
    )
    assert authorities["round-1"]["policy"]["public_check_ids"] == ["public"]
    assert authorities["round-2"]["policy"]["public_check_ids"] == ["round-2-public"]
    assert authorities["round-1"]["policy_digest"] != authorities["round-2"]["policy_digest"]
    assert authorities["round-1"]["prompt_digest"] != authorities["round-2"]["prompt_digest"]
    assert manifest.runtime_policy_digest == content_digest(manifest.runtime_policy_snapshot)
    assert manifest.tool_contract_digest == content_digest(manifest.tool_contract_snapshot)
    with pytest.raises(ValueError, match="task round set"):
        TrialManifest.model_validate(
            manifest.model_dump(mode="json")
            | {
                "runtime_policy_snapshot": {
                    **manifest.runtime_policy_snapshot,
                    "rounds": {"round-1": authorities["round-1"]},
                },
                "runtime_policy_digest": content_digest(
                    {**manifest.runtime_policy_snapshot, "rounds": {"round-1": authorities["round-1"]}}
                ),
                "tool_contract_snapshot": {
                    **manifest.tool_contract_snapshot,
                    "rounds": {"round-1": tools["round-1"]},
                },
                "tool_contract_digest": content_digest(
                    {**manifest.tool_contract_snapshot, "rounds": {"round-1": tools["round-1"]}}
                ),
            }
        )
    runs = {
        run.manifest.round_id: run
        for run in (runner.store.get_object("run", run_id, RunRecord) for run_id in result.run_ids)
    }
    assert runs["round-1"].manifest.policy_digest == authorities["round-1"]["policy_digest"]
    assert runs["round-2"].manifest.tool_contract_digest == tools["round-2"]["tool_contract_digest"]

    tampered = manifest.model_copy(
        update={
            "runtime_policy_snapshot": {
                **manifest.runtime_policy_snapshot,
                "rounds": {
                    **authorities,
                    "round-2": {**authorities["round-2"], "policy_digest": "sha256:tampered"},
                },
            }
        }
    )
    prepared.paths.trial_manifest_json.write_bytes(tampered.model_dump_json().encode("utf-8"))
    config = runner._runtime_config(prepared, tampered, "round-2", runs["round-2"].manifest.trial_manifest_digest)
    with pytest.raises(Exception, match="trial manifest"):
        runner._runtime(prepared, config)._validate_manifest(runs["round-2"])
    assert alpha_runtime_manifest_digests(config)["policy_digest"] != "sha256:tampered"


@pytest.mark.anyio
async def test_a5_recovery_revalidates_tampered_round_two_authority_before_model(tmp_path: Path) -> None:
    """Break caught: recovery must revalidate round-2 authority before any replacement model request."""
    root, docker = _bundle(tmp_path / "tasks", "A5"), _Docker()
    runner = _runner(root, _Model(), docker)
    prepared = runner.prepare("A5", budget=_budget())
    goal, manifest, _first = _persist_running_trial(runner, prepared)
    authorities = manifest.runtime_policy_snapshot["rounds"]
    tampered = manifest.model_copy(
        update={
            "runtime_policy_snapshot": {
                **manifest.runtime_policy_snapshot,
                "rounds": {
                    **authorities,
                    "round-2": {**authorities["round-2"], "policy_digest": "sha256:tampered"},
                },
            }
        }
    )
    forged_json = tampered.model_dump_json()
    with sqlite3.connect(runner.store.database) as connection:
        connection.execute(
            "UPDATE tw_objects SET body_json = ? WHERE kind = ? AND object_id = ?",
            (forged_json, "alpha_trial_manifest", prepared.preview.trial_id),
        )
    prepared.paths.trial_manifest_json.write_text(forged_json, encoding="utf-8")
    recovered_model = _Model()
    recovered = _runner(root, recovered_model, docker, prepared.paths.data_root)

    from tianwen.alpha import AlphaTrialError

    with pytest.raises(AlphaTrialError, match="trial manifest"):
        await recovered.resume(prepared.preview.trial_id)

    assert recovered_model.request_count == 0
    assert docker.check_calls == []
    assert docker.final_calls == []


@pytest.mark.anyio
async def test_a5_recovery_rejects_self_consistent_manifest_missing_bundle_round_before_effects(tmp_path: Path) -> None:
    """Break caught: matching forged stores cannot drop a frozen bundle round."""
    from tianwen.alpha import AlphaTrialError, AlphaTrialState

    root, docker = _bundle(tmp_path / "tasks", "A5"), _Docker()
    runner = _runner(root, _Model(), docker)
    prepared = runner.prepare("A5", budget=_budget())
    _goal, manifest, first = _persist_running_trial(runner, prepared)
    kept_round = "round-1"
    forged_policy = {
        **manifest.runtime_policy_snapshot,
        "rounds": {kept_round: manifest.runtime_policy_snapshot["rounds"][kept_round]},
    }
    forged_tools = {
        **manifest.tool_contract_snapshot,
        "rounds": {kept_round: manifest.tool_contract_snapshot["rounds"][kept_round]},
    }
    forged = manifest.model_copy(
        update={
            "runtime_policy_snapshot": forged_policy,
            "runtime_policy_digest": content_digest(forged_policy),
            "tool_contract_snapshot": forged_tools,
            "tool_contract_digest": content_digest(forged_tools),
            "round_order_digest": content_digest(json.dumps([kept_round])),
        }
    )
    forged_json = forged.model_dump_json()
    with sqlite3.connect(runner.store.database) as connection:
        connection.execute(
            "UPDATE tw_objects SET body_json = ? WHERE kind = ? AND object_id = ?",
            (forged_json, "alpha_trial_manifest", prepared.preview.trial_id),
        )
    prepared.paths.trial_manifest_json.write_text(forged_json, encoding="utf-8")
    state = runner.store.get_object("alpha_trial_state", prepared.preview.trial_id, AlphaTrialState)
    runner.store.put_object(
        "alpha_trial_state",
        state.trial_id,
        None,
        "running",
        state.model_copy(update={"trial_manifest_digest": content_digest(forged)}),
    )
    recovered_model = _Model()
    recovered = _runner(root, recovered_model, docker, prepared.paths.data_root)
    before_actions = len(runner.store.list_actions(first.run_id))
    before_runs = runner.store.list_objects("run", RunRecord)
    before_effects = _effect_counts(docker)

    with pytest.raises(AlphaTrialError, match="trial manifest"):
        await recovered.resume(prepared.preview.trial_id)

    assert recovered_model.request_count == 0
    assert len(recovered.store.list_actions(first.run_id)) == before_actions
    assert recovered.store.list_objects("run", RunRecord) == before_runs
    assert _effect_counts(docker) == before_effects


@pytest.mark.anyio
async def test_a3_records_frozen_source_before_execution_model_request(tmp_path: Path) -> None:
    from tianwen.alpha import AlphaTrialRunner, TrialManifest
    from tianwen.domain import EvidenceRecord, SourceRecord

    root = Path(__file__).parents[2] / "alpha" / "tasks"
    model, docker = _Model(), _Docker()
    runner = AlphaTrialRunner(
        task_root=root,
        image_lock_path=root.parent / "environment" / "image.lock",
        data_root=_data_root(),
        model=model,
        public_evaluator_key=Ed25519PrivateKey.generate().public_key(),
        docker_factory=lambda *_args: docker,
        allowed_drive="D:",
    )
    prepared = runner.prepare("A3", budget=_budget())
    result = await runner.execute(prepared, _confirmation(prepared))

    assert result.exploration_run_ids
    exploration_run_id = result.exploration_run_ids[0]
    source = next(
        item for item in runner.store.list_objects("source", SourceRecord) if item.run_id == exploration_run_id
    )
    evidence = next(
        item for item in runner.store.list_objects("evidence", EvidenceRecord) if item.run_id == exploration_run_id
    )
    assert source.locator == "https://docs.python.org/3/library/urllib.parse.html"
    assert evidence.action_id == source.action_id
    assert evidence.provenance_ids == (source.source_id,)
    packet = runner.app.goal_evidence_packet(result.goal_id)
    assert packet["sources"][0]["locator"].startswith("https://docs.python.org/")
    assert "UNTRUSTED_SOURCE_DATA" in packet["evidence"][0]["untrusted_data"]
    prompt = model.prompts[0]
    escaped_envelope = repr(json.dumps(packet["evidence"][0]["untrusted_data"])[1:-1])[1:-1]
    assert escaped_envelope in prompt
    assert "https://docs.python.org/3/library/urllib.parse.html" in prompt
    assert "<UNTRUSTED_SOURCE_DATA source_id=" in prompt
    assert "</UNTRUSTED_SOURCE_DATA>" in prompt
    assert "doseq=True emits a separate key=value pair for every item" in prompt
    for relative in ("checks/public.py", "verifier/verify.py", "reference/solution.patch"):
        assert (root / "A3" / relative).read_text(encoding="utf-8") not in prompt
    manifest = runner.store.get_object("alpha_trial_manifest", result.trial_id, TrialManifest)
    tools = manifest.tool_contract_snapshot["rounds"]["round-1"]["tool_contract"]["tools"]
    assert "web_search" not in tools
    assert "web_fetch" not in tools
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


@pytest.mark.anyio
async def test_cancellation_settles_before_reraising(tmp_path: Path) -> None:
    """Break caught: cancellation must freeze final evidence before it reaches the caller."""

    class _CancelledModel(_Model):
        async def request(self, *args: Any, **kwargs: Any) -> Any:
            raise asyncio.CancelledError()

    root, docker = _bundle(tmp_path / "tasks", "A1"), _Docker()
    runner = _runner(root, _CancelledModel(), docker)
    prepared = runner.prepare("A1", budget=_budget())

    with pytest.raises(asyncio.CancelledError):
        await runner.execute(prepared, _confirmation(prepared))

    from tianwen.alpha import TrialResult

    result = runner.store.get_object("alpha_trial_result", prepared.preview.trial_id, TrialResult)
    assert result.execution_status == "stopped"
    assert docker.final_calls


@pytest.mark.anyio
async def test_deadline_before_goal_creation_has_no_side_effect(tmp_path: Path) -> None:
    """Break caught: a prepared trial must reject expiry before creating a Goal."""
    from tianwen.alpha import AlphaTrialError, AlphaTrialState

    root, docker = _bundle(tmp_path / "tasks", "A1"), _Docker()
    runner = _runner(root, _Model(), docker)
    prepared = runner.prepare("A1", budget=_budget())
    state = runner.store.get_object("alpha_trial_state", prepared.preview.trial_id, AlphaTrialState)
    runner.store.put_object(
        "alpha_trial_state",
        state.trial_id,
        None,
        "prepared",
        state.model_copy(update={"wall_deadline": state.started_at}),
    )

    with pytest.raises(AlphaTrialError, match="deadline"):
        await runner.execute(prepared, _confirmation(prepared))

    assert runner.store.list_objects("goal", GoalContract) == []
    assert runner.model.request_count == 0
    assert docker.final_calls == []


@pytest.mark.anyio
async def test_budget_stop_before_first_run_still_settles(tmp_path: Path) -> None:
    """Break caught: controller-level budget exhaustion still requires a final immutable Result."""
    from tianwen.store import BudgetExceeded

    root, docker = _bundle(tmp_path / "tasks", "A1"), _Docker()
    runner = _runner(root, _Model(), docker)
    prepared = runner.prepare("A1", budget=_budget())

    async def exhausted(*_args: Any, **_kwargs: Any) -> Any:
        raise BudgetExceeded("budget exhausted")

    runner._run_round = exhausted
    result = await runner.execute(prepared, _confirmation(prepared))

    assert result.execution_status == "stopped"
    assert result.run_ids == ()
    assert docker.final_calls


@pytest.mark.anyio
async def test_settlement_exports_actions_events_and_final_log(tmp_path: Path) -> None:
    """Break caught: a trial result must enumerate bounded audit exports, not only source artifacts."""
    root, docker = _bundle(tmp_path / "tasks", "A1"), _Docker()
    runner = _runner(root, _Model(), docker)
    prepared = runner.prepare("A1", budget=_budget())
    result = await runner.execute(prepared, _confirmation(prepared))

    paths = {artifact.path for artifact in result.artifacts}
    assert any(path.startswith("exports/actions-") for path in paths)
    assert any(path.startswith("exports/events-") for path in paths)
    assert "logs/public-checks.json" in paths
    assert "logs/final-verify.json" in paths
    assert docker.final_calls[0] in result.action_ids


@pytest.mark.anyio
async def test_audit_artifacts_redact_credentials_and_host_paths(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Break caught: audit exports must not persist credential values or raw trial paths."""
    secret = "task6-audit-secret"
    root, docker = _bundle(tmp_path / "tasks", "A1"), _Docker()
    class _SecretWritingModel(_Model):
        target: Path | None = None

        async def request(self, *args: Any, **kwargs: Any) -> Any:
            assert self.target is not None
            (self.target / "module.py").write_text(secret, encoding="utf-8")
            return await super().request(*args, **kwargs)

    model = _SecretWritingModel()
    runner = _runner(root, model, docker)
    prepared = runner.prepare("A1", budget=_budget())
    model.target = prepared.paths.workspace
    model.custom_output_text = f"{secret} at {prepared.paths.workspace}"
    monkeypatch.setenv("TASK6_AUDIT_TOKEN", secret)

    result = await runner.execute(prepared, _confirmation(prepared))

    persisted = "\n".join(
        (prepared.paths.trial_dir / artifact.path).read_text(encoding="utf-8")
        for artifact in result.artifacts
        if artifact.path.startswith(("exports/", "logs/", "outputs/"))
    )
    assert secret not in persisted
    assert str(prepared.paths.workspace) not in persisted


@pytest.mark.anyio
async def test_workspace_boundary_violation_is_recorded_at_settlement(tmp_path: Path) -> None:
    """Break caught: a protected/out-of-scope final tree must not be reported as passed."""

    class _MutatingModel(_Model):
        target: Path | None = None

        async def request(self, *args: Any, **kwargs: Any) -> Any:
            assert self.target is not None
            (self.target / "outside.txt").write_text("outside", encoding="utf-8")
            return await super().request(*args, **kwargs)

    root, docker = _bundle(tmp_path / "tasks", "A1"), _Docker()
    model = _MutatingModel()
    runner = _runner(root, model, docker)
    prepared = runner.prepare("A1", budget=_budget())
    model.target = prepared.paths.workspace

    result = await runner.execute(prepared, _confirmation(prepared))

    assert result.boundary_status == "violated"
    assert "workspace_boundary" in result.failure_categories


@pytest.mark.anyio
async def test_execute_revalidates_seed_preflight_and_manifest_authority(tmp_path: Path) -> None:
    """Break caught: stale prepared authority must fail before Goal/model creation."""
    from tianwen.alpha import AlphaTrialError

    root, docker = _bundle(tmp_path / "tasks", "A1"), _Docker()
    runner = _runner(root, _Model(), docker)
    prepared = runner.prepare("A1", budget=_budget())
    (prepared.paths.workspace / "module.py").write_text("tampered", encoding="utf-8")

    with pytest.raises(AlphaTrialError, match="seed"):
        await runner.execute(prepared, _confirmation(prepared))

    assert docker.preflight_calls == 2
    assert runner.store.list_objects("goal", GoalContract) == []


@pytest.mark.anyio
async def test_resume_confirmed_prepared_trial_fails_closed_before_effects(tmp_path: Path) -> None:
    """Break caught: a confirmed trial without a manifest cannot resume into Docker effects."""
    from tianwen.alpha import AlphaTrialError, AlphaTrialRunner

    root, docker = _bundle(tmp_path / "tasks", "A1"), _Docker()
    runner = _runner(root, _Model(), docker)
    prepared = runner.prepare("A1", budget=_budget())
    recovered = AlphaTrialRunner(
        task_root=root,
        image_lock_path=root / "image.lock",
        data_root=prepared.paths.data_root,
        model=_Model(),
        docker_factory=lambda *_args: docker,
        allowed_drive="D:",
    )

    with pytest.raises(AlphaTrialError, match="confirmation"):
        await recovered.resume(prepared.preview.trial_id)

    runner.store.put_immutable_object(
        "alpha_trial_confirmation",
        prepared.preview.trial_id,
        None,
        "confirmed",
        _confirmation(prepared),
    )
    before_effects = _effect_counts(docker)
    with pytest.raises(AlphaTrialError, match="manifest"):
        await recovered.resume(prepared.preview.trial_id)

    assert recovered.model.request_count == 0
    assert recovered.store.list_objects("goal", GoalContract) == []
    assert recovered.store.list_objects("run", RunRecord) == []
    with sqlite3.connect(recovered.store.database) as connection:
        assert connection.execute("SELECT COUNT(*) FROM tw_actions").fetchone() == (0,)
    assert _effect_counts(docker) == before_effects


@pytest.mark.anyio
async def test_unresolved_action_and_credential_sentinel_are_truthful(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Break caught: incomplete effects are unknown and secret bytes never enter the Result."""
    root, docker = _bundle(tmp_path / "tasks", "A1"), _Docker()
    runner = _runner(root, _Model(output="credential-sentinel"), docker)
    monkeypatch.setenv("TASK6_API_KEY", "credential-sentinel")
    prepared = runner.prepare("A1", budget=_budget())
    result = await runner.execute(prepared, _confirmation(prepared))

    assert result.boundary_status == "violated"
    assert "credential-sentinel" not in result.model_dump_json()


@pytest.mark.anyio
async def test_unresolved_action_makes_boundary_status_unknown(tmp_path: Path) -> None:
    """Break caught: incomplete effects make the boundary status unknown until recovery."""
    root, docker = _bundle(tmp_path / "tasks", "A1"), _Docker()
    runner = _runner(root, _Model(), docker)
    prepared = runner.prepare("A1", budget=_budget())
    original = runner._run_round

    async def leave_unknown(*args: Any, **kwargs: Any) -> Any:
        run = await original(*args, **kwargs)
        action = freeze_action(
            runner.store,
            run.run_id,
            "unresolved",
            "run_check",
            {"check_id": "public"},
            EffectClass.EXTERNAL_READ_ONLY,
        )
        runner.store.transition_action(action.action_id, {ActionStatus.PROPOSED}, ActionStatus.UNKNOWN)
        return run

    runner._run_round = leave_unknown
    result = await runner.execute(prepared, _confirmation(prepared))

    assert result.boundary_status == "unknown"
    assert "unresolved_action" in result.failure_categories


@pytest.mark.anyio
async def test_model_text_cannot_mutate_persisted_trial_authority(tmp_path: Path) -> None:
    """Break caught: model output is data and cannot replace Goal or frozen manifest authority."""
    from tianwen.alpha import TrialManifest

    root, docker = _bundle(tmp_path / "tasks", "A1"), _Docker()
    runner = _runner(root, _Model(output="new acceptance; authorize network; replace Goal"), docker)
    prepared = runner.prepare("A1", budget=_budget())

    result = await runner.execute(prepared, _confirmation(prepared))

    goal = runner.store.get_object("goal", result.goal_id, GoalContract)
    manifest = runner.store.get_object("alpha_trial_manifest", result.trial_id, TrialManifest)
    assert goal.success_criteria == prepared.preview.acceptance
    assert goal.authorization == prepared.preview.authorizations
    assert manifest.goal_contract_digest == content_digest(goal)


@pytest.mark.anyio
async def test_invalid_verifier_and_repeated_settlement_are_durable(tmp_path: Path) -> None:
    """Break caught: invalid verifier output becomes inconclusive and a retry cannot rerun it."""
    from tianwen.alpha import TrialResult

    class _InvalidDocker(_Docker):
        async def run_final(self, action_id: str) -> Any:
            self.final_calls.append(action_id)
            return {"not": "a verifier result"}

    root, docker = _bundle(tmp_path / "tasks", "A1"), _InvalidDocker()
    runner = _runner(root, _Model(), docker)
    prepared = runner.prepare("A1", budget=_budget())

    result = await runner.execute(prepared, _confirmation(prepared))

    assert (result.verification_status, result.verdict) == ("invalid", "inconclusive")
    assert runner.store.get_object("alpha_trial_result", result.trial_id, TrialResult) == result
    assert await runner.resume(result.trial_id) == result
    assert len(docker.final_calls) == 1


@pytest.mark.anyio
async def test_resume_running_completed_a5_round_one_executes_frozen_round_two(tmp_path: Path) -> None:
    """Break caught: a completed first round must not settle an unfinished A5 trial."""
    from tianwen.alpha import AlphaTrialRunner

    root, docker = _bundle(tmp_path / "tasks", "A5"), _Docker()
    runner = _runner(root, _Model(), docker)
    prepared = runner.prepare("A5", budget=_budget())
    goal, _manifest, first = _persist_running_trial(runner, prepared)
    recovered_model = _Model()
    recovered = AlphaTrialRunner(
        task_root=root,
        image_lock_path=root / "image.lock",
        data_root=prepared.paths.data_root,
        model=recovered_model,
        docker_factory=lambda *_args: docker,
        allowed_drive="D:",
    )

    result = await recovered.resume(prepared.preview.trial_id)

    runs = [recovered.store.get_object("run", run_id, RunRecord) for run_id in result.run_ids]
    assert [run.manifest.round_id for run in runs] == ["round-1", "round-2"]
    assert result.goal_id == goal.goal_id
    assert first.task_id == runs[1].task_id
    assert recovered_model.request_count == 1


@pytest.mark.anyio
async def test_resume_boundary_uses_original_baseline_not_modified_workspace(tmp_path: Path) -> None:
    """Break caught: recovery must retain the pre-interruption baseline for settlement checks."""
    from tianwen.alpha import AlphaTrialRunner

    root, docker = _bundle(tmp_path / "tasks", "A1"), _Docker()
    runner = _runner(root, _Model(), docker)
    prepared = runner.prepare("A1", budget=_budget())
    _persist_running_trial(runner, prepared)
    (prepared.paths.workspace / "outside.txt").write_text("interrupted write", encoding="utf-8")
    recovered = AlphaTrialRunner(
        task_root=root,
        image_lock_path=root / "image.lock",
        data_root=prepared.paths.data_root,
        model=_Model(),
        docker_factory=lambda *_args: docker,
        allowed_drive="D:",
    )

    result = await recovered.resume(prepared.preview.trial_id)

    assert result.boundary_status == "violated"
    assert "workspace_boundary" in result.failure_categories


@pytest.mark.anyio
async def test_final_verify_audit_artifact_exists_for_invalid_and_unavailable_results(tmp_path: Path) -> None:
    """Break caught: every final verification outcome needs a sanitized bounded audit record."""

    class _InvalidDocker(_Docker):
        async def run_final(self, action_id: str) -> Any:
            self.final_calls.append(action_id)
            return {"invalid": "result"}

    class _UnavailableDocker(_Docker):
        async def run_final(self, action_id: str) -> VerifierResult:
            self.final_calls.append(action_id)
            raise DockerExecutionError("D:/private-host-path secret")

    for docker, expected in ((_InvalidDocker(), "invalid"), (_UnavailableDocker(), "unavailable")):
        root = _bundle(tmp_path / expected / "tasks", "A1")
        runner = _runner(root, _Model(), docker)
        prepared = runner.prepare("A1", budget=_budget())

        result = await runner.execute(prepared, _confirmation(prepared))

        raw = (prepared.paths.trial_dir / "logs" / "final-verify.json").read_text(encoding="utf-8")
        assert result.verification_status == expected
        assert "logs/final-verify.json" in {artifact.path for artifact in result.artifacts}
        assert expected in raw
        assert "private-host-path" not in raw


@pytest.mark.anyio
async def test_resume_settling_with_unreconciled_final_action_is_boundary_unknown(tmp_path: Path) -> None:
    """Break caught: an unreconciled final verifier is an unknown boundary effect."""
    from tianwen.alpha import AlphaTrialRunner, AlphaTrialState

    class _UnreconciledDocker(_Docker):
        async def reconcile(self, _action_id: str) -> None:
            return None

    root, docker = _bundle(tmp_path / "tasks", "A1"), _UnreconciledDocker()
    runner = _runner(root, _Model(), docker)
    prepared = runner.prepare("A1", budget=_budget())
    confirmation = _confirmation(prepared)
    runner.store.put_immutable_object(
        "alpha_trial_confirmation", prepared.preview.trial_id, None, "confirmed", confirmation
    )
    goal = runner.app.create_goal(
        objective=prepared.preview.objective,
        criteria=prepared.preview.acceptance,
        workspace=prepared.paths.workspace,
        authorization=prepared.preview.authorizations,
        budget=prepared.preview.budget,
    )
    manifest = runner._manifest(prepared, goal, confirmation)
    runner.store.put_immutable_object(
        "alpha_trial_manifest", prepared.preview.trial_id, goal.goal_id, "active", manifest
    )
    prepared.paths.trial_manifest_json.write_bytes(manifest.model_dump_json().encode("utf-8"))
    final_run_id = f"alpha:{prepared.preview.trial_id}:settlement"
    action_id = proposal_action_id(
        final_run_id,
        f"alpha-final-{prepared.preview.trial_id}",
        "final_verify",
        {"verifier_id": "final", "verifier_digest": prepared._bundle.task.final_verifier.digest},
    )
    action = freeze_action(
        runner.store,
        final_run_id,
        f"alpha-final-{prepared.preview.trial_id}",
        "final_verify",
        {"verifier_id": "final", "verifier_digest": prepared._bundle.task.final_verifier.digest},
        EffectClass.EXTERNAL_READ_ONLY,
    )
    assert action.action_id == action_id
    runner.store.transition_action(action_id, {ActionStatus.PROPOSED}, ActionStatus.UNKNOWN)
    state = runner.store.get_object("alpha_trial_state", prepared.preview.trial_id, AlphaTrialState)
    runner.store.put_object(
        "alpha_trial_state",
        state.trial_id,
        None,
        "settling",
        state.model_copy(
            update={"stage": "settling", "trial_manifest_digest": content_digest(manifest), "goal_id": goal.goal_id}
        ),
    )
    recovered = AlphaTrialRunner(
        task_root=root,
        image_lock_path=root / "image.lock",
        data_root=prepared.paths.data_root,
        model=_Model(),
        docker_factory=lambda *_args: docker,
        allowed_drive="D:",
    )

    result = await recovered.resume(prepared.preview.trial_id)

    assert result.boundary_status == "unknown"
    assert "unresolved_action" in result.failure_categories
    assert result.trial_manifest_digest == content_digest(manifest)


@pytest.mark.anyio
async def test_resume_settling_reconciles_unknown_final_action_without_rerun(tmp_path: Path) -> None:
    """Break caught: an interrupted final verifier is reconciled, never executed a second time."""

    class _InterruptedFinalDocker(_Docker):
        def __init__(self) -> None:
            super().__init__()
            self.reconcile_calls: list[str] = []

        async def run_final(self, action_id: str) -> VerifierResult:
            self.final_calls.append(action_id)
            raise asyncio.CancelledError()

        async def reconcile(self, action_id: str) -> VerifierResult:
            self.reconcile_calls.append(action_id)
            return self.final

    root, docker = _bundle(tmp_path / "tasks", "A1"), _InterruptedFinalDocker()
    runner = _runner(root, _Model(), docker)
    prepared = runner.prepare("A1", budget=_budget())

    with pytest.raises(asyncio.CancelledError):
        await runner.execute(prepared, _confirmation(prepared))

    result = await runner.resume(prepared.preview.trial_id)

    assert result.verification_status == "completed"
    assert docker.reconcile_calls == docker.final_calls
    assert len(docker.final_calls) == 1


@pytest.mark.anyio
async def test_manifest_mirror_tamper_prevents_first_model_request(tmp_path: Path) -> None:
    """Break caught: SQLite authority and canonical manifest mirror must agree before Alpha Run."""
    from tianwen.alpha import AlphaTrialError

    root, docker = _bundle(tmp_path / "tasks", "A1"), _Docker()
    runner = _runner(root, _Model(), docker)
    prepared = runner.prepare("A1", budget=_budget())
    original = runner._manifest

    def tampered(*args: Any, **kwargs: Any) -> Any:
        manifest = original(*args, **kwargs)
        prepared.paths.trial_manifest_json.write_text("{}", encoding="utf-8")
        return manifest

    runner._manifest = tampered
    with pytest.raises(AlphaTrialError, match="manifest"):
        await runner.execute(prepared, _confirmation(prepared))

    assert runner.model.request_count == 0


@pytest.mark.anyio
async def test_resume_rejects_self_consistent_empty_manifest_authorities_before_effects(tmp_path: Path) -> None:
    """Break caught: matching forged SQLite and JSON manifests could start a replacement Alpha Run."""
    from tianwen.alpha import AlphaTrialError, AlphaTrialState

    root, docker = _bundle(tmp_path / "tasks", "A1"), _Docker()
    runner = _runner(root, _Model(), docker)
    prepared = runner.prepare("A1", budget=_budget())
    goal, manifest, _first = _persist_running_trial(runner, prepared)
    forged = manifest.model_dump(mode="json")
    forged.update(
        {
            "runtime_policy_snapshot": {},
            "runtime_policy_digest": content_digest({}),
            "tool_contract_snapshot": {},
            "tool_contract_digest": content_digest({}),
        }
    )
    forged_json = json.dumps(forged, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    with sqlite3.connect(runner.store.database) as connection:
        connection.execute(
            "UPDATE tw_objects SET body_json = ? WHERE kind = ? AND object_id = ?",
            (forged_json, "alpha_trial_manifest", prepared.preview.trial_id),
        )
    prepared.paths.trial_manifest_json.write_text(forged_json, encoding="utf-8")
    state = runner.store.get_object("alpha_trial_state", prepared.preview.trial_id, AlphaTrialState)
    runner.store.put_object(
        "alpha_trial_state", state.trial_id, None, "running", state.model_copy(update={"stage": "running"})
    )
    recovered_model = _Model()
    recovered = _runner(root, recovered_model, docker, prepared.paths.data_root)
    before_actions = len(runner.store.list_actions(_first.run_id))
    before_checks = len(docker.check_calls)

    with pytest.raises(AlphaTrialError, match="trial manifest"):
        await recovered.resume(prepared.preview.trial_id)

    assert recovered_model.request_count == 0
    assert len(recovered.store.list_actions(_first.run_id)) == before_actions
    assert len(docker.check_calls) == before_checks
    assert docker.final_calls == []


@pytest.mark.anyio
async def test_resume_running_and_settling_recover_without_new_goal(tmp_path: Path) -> None:
    """Break caught: durable running/settling stages must continue exact effects without a new Goal."""
    from tianwen.alpha import AlphaTrialState

    root, docker = _bundle(tmp_path / "tasks", "A1"), _Docker()
    runner = _runner(root, _Model(), docker)
    prepared = runner.prepare("A1", budget=_budget())
    result = await runner.execute(prepared, _confirmation(prepared))
    state = runner.store.get_object("alpha_trial_state", result.trial_id, AlphaTrialState)
    runner.store.put_object(
        "alpha_trial_state",
        result.trial_id,
        None,
        "settling",
        state.model_copy(update={"stage": "settling", "result_digest": None}),
    )

    recovered = await runner.resume(result.trial_id)

    assert recovered == result
    assert len(runner.store.list_objects("goal", GoalContract)) == 1


@pytest.mark.anyio
async def test_resume_running_recovers_the_persisted_incomplete_run(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Break caught: a Run must be durable before it can be interrupted and recovered."""
    from tianwen.alpha import AlphaTrialRunner, AlphaTrialState
    from tianwen.alpha_runtime import AlphaRuntime
    from tianwen.domain import RunManifest

    root, docker = _bundle(tmp_path / "tasks", "A1"), _Docker()
    runner = _runner(root, _Model(), docker)
    prepared = runner.prepare("A1", budget=_budget())
    confirmation = _confirmation(prepared)
    runner.store.put_immutable_object(
        "alpha_trial_confirmation", prepared.preview.trial_id, None, "confirmed", confirmation
    )
    goal = runner.app.create_goal(
        objective=prepared.preview.objective,
        criteria=prepared.preview.acceptance,
        workspace=prepared.paths.workspace,
        authorization=prepared.preview.authorizations,
        budget=prepared.preview.budget,
    )
    manifest = runner._manifest(prepared, goal, confirmation)
    runner.store.put_immutable_object(
        "alpha_trial_manifest", prepared.preview.trial_id, goal.goal_id, "active", manifest
    )
    prepared.paths.trial_manifest_json.write_bytes(manifest.model_dump_json().encode("utf-8"))
    run_id = f"alpha:{prepared.preview.trial_id}:round-1"
    run = RunRecord(
        run_id=run_id,
        task_id=runner.app.goal_task(goal.goal_id).task_id,
        status=RunStatus.RUNNING,
        manifest=RunManifest(
            workflow_version="tianwen-alpha-v1",
            schema_version="2",
            pydantic_ai_version="2.18.0",
            harness_version="0.13.0",
            model_id=prepared.preview.model_id,
            prompt_digest=content_digest("interrupted"),
            skill_versions={"repo_task": manifest.champion_version_id},
            skill_digests={"repo_task": manifest.champion_digest},
            policy_digest=manifest.runtime_policy_digest,
            tool_contract_digest=manifest.tool_contract_digest,
            goal_contract_digest=manifest.goal_contract_digest,
            workspace_digest=content_digest(str(prepared.paths.workspace.resolve())),
            trial_id=prepared.preview.trial_id,
            round_id="round-1",
            trial_manifest_digest=content_digest(manifest),
        ),
    )
    runner.store.put_object("run", run_id, run.task_id, "running", run)
    state = runner.store.get_object("alpha_trial_state", prepared.preview.trial_id, AlphaTrialState)
    runner.store.put_object(
        "alpha_trial_state",
        state.trial_id,
        None,
        "running",
        state.model_copy(
            update={
                "stage": "running",
                "trial_manifest_digest": content_digest(manifest),
                "goal_id": goal.goal_id,
                "run_ids": (run_id,),
            }
        ),
    )
    recovered_runs: list[str] = []

    async def recover(runtime: Any, interrupted: RunRecord) -> Any:
        recovered_runs.append(interrupted.run_id)
        runner.store.put_object(
            "run", run_id, run.task_id, "completed", interrupted.model_copy(update={"status": RunStatus.COMPLETED})
        )
        return None

    monkeypatch.setattr(AlphaRuntime, "recover", recover)
    recovered = AlphaTrialRunner(
        task_root=root,
        image_lock_path=root / "image.lock",
        data_root=prepared.paths.data_root,
        model=_Model(),
        docker_factory=lambda *_args: docker,
        allowed_drive="D:",
    )

    result = await recovered.resume(prepared.preview.trial_id)

    assert recovered_runs == [run_id]
    assert result.run_ids == (run_id,)


@pytest.mark.anyio
async def test_resume_unknown_action_never_restarts_the_same_round_effect(tmp_path: Path) -> None:
    """Break caught: an unreconciled effect must stop truthfully, never make a replacement model/check Action."""

    class _UnknownDocker(_Docker):
        async def reconcile(self, _action_id: str) -> None:
            return None

    from tianwen.alpha import AlphaTrialState

    root, docker = _bundle(tmp_path / "tasks", "A1"), _UnknownDocker()
    runner = _runner(root, _Model(), docker)
    prepared = runner.prepare("A1", budget=_budget())
    goal, manifest, persisted = _persist_running_trial(runner, prepared)
    unknown = freeze_action(
        runner.store,
        persisted.run_id,
        "interrupted-check",
        "run_check",
        {"check_id": "public"},
        EffectClass.EXTERNAL_READ_ONLY,
    )
    runner.store.transition_action(unknown.action_id, {ActionStatus.PROPOSED}, ActionStatus.UNKNOWN)
    waiting = persisted.model_copy(update={"status": RunStatus.WAITING, "status_reason": "unknown_action"})
    runner.store.put_object("run", waiting.run_id, waiting.task_id, "waiting", waiting)
    state = runner.store.get_object("alpha_trial_state", prepared.preview.trial_id, AlphaTrialState)
    runner.store.put_object(
        "alpha_trial_state", state.trial_id, None, "running", state.model_copy(update={"stage": "running"})
    )
    recovered_model = _Model()
    recovered = _runner(root, recovered_model, docker, prepared.paths.data_root)
    before_actions = len(runner.store.list_actions(persisted.run_id))
    before_checks = len(docker.check_calls)

    result = await recovered.resume(prepared.preview.trial_id)

    assert recovered_model.request_count == 0
    assert len(recovered.store.list_actions(persisted.run_id)) == before_actions
    assert len(docker.check_calls) == before_checks
    assert docker.final_calls == []
    assert result.execution_status == "stopped"
    assert result.boundary_status == "unknown"
    assert result.run_ids == (persisted.run_id,)
    assert recovered.store.get_object("run", persisted.run_id, RunRecord).status is RunStatus.WAITING


@pytest.mark.anyio
async def test_confirmed_pre_manifest_resume_with_existing_goal_fails_closed(tmp_path: Path) -> None:
    """Break caught: an existing Goal cannot authorize no-manifest recovery effects."""
    from tianwen.alpha import AlphaTrialError, AlphaTrialRunner

    root, docker = _bundle(tmp_path / "tasks", "A1"), _Docker()
    runner = _runner(root, _Model(), docker)
    prepared = runner.prepare("A1", budget=_budget())
    confirmation = _confirmation(prepared)
    runner.store.put_immutable_object(
        "alpha_trial_confirmation", prepared.preview.trial_id, None, "confirmed", confirmation
    )
    goal = runner.app.create_goal(
        objective=prepared.preview.objective,
        criteria=prepared.preview.acceptance,
        workspace=prepared.paths.workspace,
        authorization=prepared.preview.authorizations,
        budget=prepared.preview.budget,
    )
    recovered = AlphaTrialRunner(
        task_root=root,
        image_lock_path=root / "image.lock",
        data_root=prepared.paths.data_root,
        model=_Model(),
        docker_factory=lambda *_args: docker,
        allowed_drive="D:",
    )

    before_effects = _effect_counts(docker)
    with pytest.raises(AlphaTrialError, match="manifest"):
        await recovered.resume(prepared.preview.trial_id)

    assert recovered.model.request_count == 0
    assert recovered.store.list_objects("goal", GoalContract) == [goal]
    assert recovered.store.list_objects("run", RunRecord) == []
    assert _effect_counts(docker) == before_effects
