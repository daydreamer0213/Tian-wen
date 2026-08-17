from __future__ import annotations

import json
import secrets
import sqlite3
from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest
from pydantic_ai.messages import UserPromptPart
from pydantic_ai.models.test import TestModel

from tianwen.alpha import (
    AlphaTrialError,
    AlphaTrialRunner,
    AlphaTrialState,
    TrialConfirmation,
    TrialManifest,
    TrialResult,
    TrialUsage,
)
from tianwen.alpha_comparison import (
    AlphaComparisonError,
    PairedArmProjection,
    PairedComparisonAggregate,
    PairedComparisonManifest,
    PairedComparisonResult,
    PairRole,
    aggregate_pair_results,
    compare_pair,
    prepare_pair_authority,
)
from tianwen.alpha_docker import DockerPreflight, VerifierResult
from tianwen.domain import (
    ArtifactStatus,
    ArtifactVersion,
    BudgetLimit,
    EvalRun,
    PromotionRecord,
    content_digest,
)


class _Model(TestModel):
    def __init__(self, role: str, request_order: list[str]) -> None:
        super().__init__(custom_output_text="completed", call_tools=[])
        self.role = role
        self.request_order = request_order
        self.request_count = 0
        self.prompts: list[str] = []

    async def request(self, messages: list[Any], *args: Any, **kwargs: Any) -> Any:
        self.request_order.append(self.role)
        self.request_count += 1
        self.prompts.append(
            next(
                part.content
                for message in messages
                for part in message.parts
                if isinstance(part, UserPromptPart) and isinstance(part.content, str)
            )
        )
        return await super().request(messages, *args, **kwargs)


class _ProviderOne:
    name = "test"
    base_url = "https://provider.invalid/v1"

    def model_profile(self, model_name: str) -> dict[str, Any]:
        del model_name
        return {}


class _ProviderTwo:
    name = "test"
    base_url = "https://provider.invalid/v1"

    def model_profile(self, model_name: str) -> dict[str, Any]:
        del model_name
        return {}


class _ConfiguredProviderModel(_Model):
    def __init__(self, role: str, request_order: list[str], provider: Any) -> None:
        super().__init__(role, request_order)
        self._configured_provider = provider

    @property
    def provider(self) -> Any:
        return self._configured_provider


class _OtherModel(_Model):
    pass


class _Docker:
    def __init__(self, config_marker: str = "default") -> None:
        self.config_marker = config_marker
        self.final_calls: list[str] = []

    def preflight(self) -> DockerPreflight:
        return DockerPreflight(
            docker_version="fake",
            engine_id_digest="sha256:engine",
            operating_system="linux",
            architecture="amd64",
            image_reference="python@sha256:manifest",
            image_digest="sha256:manifest",
            data_location="D:/DevData/fake-docker",
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
            "output_limit_bytes": 32_768,
            "log_driver": "local",
            "log_options": ("max-size=32768", "max-file=1"),
            "mounts": ("/workspace", f"/checks/{script}"),
            "working_dir": "/workspace",
            "environment": ("HOME=/tmp", "TMPDIR=/tmp", "PYTHONDONTWRITEBYTECODE=1"),
            "argv": ("python", "-I", f"/checks/{script}", "/workspace", self.config_marker),
        }

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
        return VerifierResult(
            verdict="met",
            passed_checks=("final",),
            failed_checks=(),
            failure_categories=(),
            summary="ok",
        )

    async def run(self, action_id: str, check_id: str) -> dict[str, str]:
        return {"action_id": action_id, "check_id": check_id}


def _budget() -> BudgetLimit:
    return BudgetLimit(model_requests=4, tool_calls=8, tokens=10_000, wall_seconds=300, action_effects=8)


def _data_root(role: str) -> Path:
    root = Path("D:/DevData/alpha-b-task-2-tests") / f"{role}-{secrets.token_hex(6)}"
    root.mkdir(parents=True)
    return root


def _runner(
    role: str,
    request_order: list[str] | None = None,
    *,
    model: _Model | None = None,
    docker: _Docker | None = None,
) -> tuple[AlphaTrialRunner, _Model, _Docker]:
    root = Path(__file__).parents[2] / "alpha"
    model = model or _Model(role, request_order if request_order is not None else [])
    docker = docker or _Docker()
    runner = AlphaTrialRunner(
        task_root=root / "tasks",
        image_lock_path=root / "environment" / "image.lock",
        data_root=_data_root(role),
        model=model,
        docker_factory=lambda *_args: docker,
        allowed_drive="D:",
    )
    return runner, model, docker


def _candidate(
    parent_version_id: str,
    active_content: str,
    marker: str = "Alpha-B Candidate behavior marker.",
) -> ArtifactVersion:
    content = active_content + f"\n\n{marker}\n"
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


def _prepared_pair(
    *,
    task_id: str = "A1",
    champion_model: _Model | None = None,
    challenger_model: _Model | None = None,
    champion_docker: _Docker | None = None,
    challenger_docker: _Docker | None = None,
) -> tuple[Any, ...]:
    request_order: list[str] = []
    champion_runner, champion_model, champion_docker = _runner(
        "champion", request_order, model=champion_model, docker=champion_docker
    )
    champion = champion_runner.prepare(task_id, budget=_budget())
    challenger_runner, challenger_model, challenger_docker = _runner(
        "challenger", request_order, model=challenger_model, docker=challenger_docker
    )
    challenger = challenger_runner.prepare(
        task_id,
        budget=_budget(),
        artifact_version=_candidate(
            champion.champion_version_id,
            champion._app.artifact(champion.champion_version_id).content,
        ),
    )
    return (
        champion_runner,
        champion_model,
        champion_docker,
        champion,
        challenger_runner,
        challenger_model,
        challenger_docker,
        challenger,
    )


async def _persist_completed_first_a5_round(runner: AlphaTrialRunner, prepared: Any) -> None:
    """Run and persist round 1 as an interrupted A5 trial would leave it."""
    store = prepared._app.store
    confirmation = _confirmation(prepared)
    store.put_immutable_object(
        "alpha_trial_confirmation", prepared.preview.trial_id, None, "confirmed", confirmation
    )
    goal = prepared._app.create_goal(
        objective=prepared.preview.objective,
        criteria=prepared.preview.acceptance,
        workspace=prepared.paths.workspace,
        authorization=prepared.preview.authorizations,
        budget=prepared.preview.budget,
    )
    manifest = runner._manifest(prepared, goal, confirmation)
    manifest_digest = content_digest(manifest)
    store.put_immutable_object(
        "alpha_trial_manifest", prepared.preview.trial_id, goal.goal_id, "active", manifest
    )
    prepared.paths.trial_manifest_json.write_bytes(manifest.model_dump_json().encode("utf-8"))
    state = store.get_object("alpha_trial_state", prepared.preview.trial_id, AlphaTrialState)
    runner._put_state(
        store,
        state.model_copy(
            update={"stage": "running", "trial_manifest_digest": manifest_digest, "goal_id": goal.goal_id}
        ),
    )
    first = await runner._run_round(prepared, goal, manifest_digest, "round-1")
    state = store.get_object("alpha_trial_state", prepared.preview.trial_id, AlphaTrialState)
    runner._put_state(store, state.model_copy(update={"completed_round_ids": ("round-1",)}))
    assert first.status.value == "completed"


def _confirmation(prepared: Any) -> TrialConfirmation:
    return TrialConfirmation(
        trial_id=prepared.preview.trial_id,
        preview_digest=content_digest(prepared.preview),
        confirmed_via="local_tty",
    )


def _delete_store_object(database: Path, kind: str, object_id: str) -> None:
    with sqlite3.connect(database) as connection:
        connection.execute(
            "DELETE FROM tw_objects WHERE kind = ? AND object_id = ?",
            (kind, object_id),
        )


def _stale_active_pointer(database: Path, artifact_id: str, version_id: str) -> None:
    with sqlite3.connect(database) as connection:
        row = connection.execute(
            "SELECT body_json FROM tw_objects WHERE kind = 'active_pointer' AND object_id = ?",
            (artifact_id,),
        ).fetchone()
        assert row is not None
        payload = json.loads(row[0])
        payload["current_version_id"] = version_id
        connection.execute(
            "UPDATE tw_objects SET body_json = ? WHERE kind = 'active_pointer' AND object_id = ?",
            (json.dumps(payload, separators=(",", ":")), artifact_id),
        )


def test_prepare_pair_authority_binds_equal_conditions_isolation_roles_and_order() -> None:
    champion_runner, champion_model, _, champion, challenger_runner, challenger_model, _, challenger = (
        _prepared_pair()
    )

    authority = prepare_pair_authority(
        champion_runner,
        champion,
        challenger_runner,
        challenger,
        repeat_index=1,
        execution_order=("champion", "challenger"),
    )
    replay = prepare_pair_authority(
        champion_runner,
        champion,
        challenger_runner,
        challenger,
        repeat_index=1,
        execution_order=("champion", "challenger"),
    )
    with pytest.raises(AlphaComparisonError, match="conflict"):
        prepare_pair_authority(
            champion_runner,
            champion,
            challenger_runner,
            challenger,
            repeat_index=2,
            execution_order=("challenger", "champion"),
        )
    reverse_pair = _prepared_pair()
    reverse = prepare_pair_authority(
        reverse_pair[0],
        reverse_pair[3],
        reverse_pair[4],
        reverse_pair[7],
        repeat_index=2,
        execution_order=("challenger", "champion"),
    )

    assert authority.pair_id != reverse.pair_id
    assert replay == authority
    assert authority.common_condition_digest == content_digest(authority.common_condition)
    assert authority.execution_order == ("champion", "challenger")
    assert authority.champion.role == "champion"
    assert authority.challenger.role == "challenger"
    assert authority.champion.trial_id != authority.challenger.trial_id
    assert authority.champion.workspace_identity != authority.challenger.workspace_identity
    assert authority.champion.store_identity != authority.challenger.store_identity
    assert authority.champion.store_identity == content_digest(
        str(champion._app.store.database.resolve())
    )
    assert authority.challenger.store_identity == content_digest(
        str(challenger._app.store.database.resolve())
    )
    assert authority.champion.skill_digest != authority.challenger.skill_digest
    assert champion._app.store.list_objects("alpha_pair_authority", PairedComparisonManifest) == [
        authority
    ]
    assert challenger._app.store.list_objects("alpha_pair_authority", PairedComparisonManifest) == [
        authority
    ]
    assert champion_model.request_count == challenger_model.request_count == 0


@pytest.mark.anyio
async def test_prepare_pair_authority_requires_fresh_trial_state_and_rejects_post_execution_creation() -> None:
    (
        champion_runner,
        champion_model,
        _,
        champion,
        challenger_runner,
        challenger_model,
        _,
        challenger,
    ) = _prepared_pair()
    result = await champion_runner.execute(champion, _confirmation(champion))
    request_count = champion_model.request_count

    with pytest.raises(AlphaComparisonError, match="prepared"):
        prepare_pair_authority(
            champion_runner,
            champion,
            challenger_runner,
            challenger,
            repeat_index=1,
            execution_order=("champion", "challenger"),
        )

    assert result.trial_id == champion.preview.trial_id
    assert champion_model.request_count == request_count
    assert challenger_model.request_count == 0


def test_prepare_pair_rejects_invalid_roles_and_stale_active_pointer_before_requests() -> None:
    (
        champion_runner,
        champion_model,
        _,
        champion,
        challenger_runner,
        challenger_model,
        _,
        challenger,
    ) = _prepared_pair()

    with pytest.raises(AlphaComparisonError, match="Champion|ACTIVE|role"):
        prepare_pair_authority(
            challenger_runner,
            challenger,
            champion_runner,
            champion,
            repeat_index=1,
            execution_order=("champion", "challenger"),
        )

    first_runner, first_model, _ = _runner("candidate-one")
    first_active = first_runner.prepare("A1", budget=_budget())
    first_candidate = first_runner.prepare(
        "A1",
        budget=_budget(),
        artifact_version=_candidate(
            first_active.champion_version_id,
            first_active._app.artifact(first_active.champion_version_id).content,
            "candidate one",
        ),
    )
    second_runner, second_model, _ = _runner("candidate-two")
    second_active = second_runner.prepare("A1", budget=_budget())
    second_candidate = second_runner.prepare(
        "A1",
        budget=_budget(),
        artifact_version=_candidate(
            second_active.champion_version_id,
            second_active._app.artifact(second_active.champion_version_id).content,
            "candidate two",
        ),
    )
    with pytest.raises(AlphaComparisonError, match="Champion|ACTIVE|role"):
        prepare_pair_authority(
            first_runner,
            first_candidate,
            second_runner,
            second_candidate,
            repeat_index=1,
            execution_order=("champion", "challenger"),
        )

    unrelated = _candidate(
        "sha256:unrelated",
        first_active._app.artifact(first_active.champion_version_id).content,
        "unrelated candidate",
    )
    with pytest.raises(AlphaTrialError, match="parent"):
        first_runner.prepare("A1", budget=_budget(), artifact_version=unrelated)

    _stale_active_pointer(
        champion._app.store.database,
        "repo-task",
        challenger.champion_version_id,
    )
    with pytest.raises(AlphaComparisonError, match="active|ACTIVE|pointer"):
        prepare_pair_authority(
            champion_runner,
            champion,
            challenger_runner,
            challenger,
            repeat_index=1,
            execution_order=("champion", "challenger"),
        )

    assert champion_model.request_count == challenger_model.request_count == 0
    assert first_model.request_count == second_model.request_count == 0


@pytest.mark.parametrize("different", ("model", "provider", "docker"))
def test_prepare_pair_rejects_real_runner_or_executor_identity_changes_before_requests(
    different: str,
) -> None:
    champion_model = _Model("champion", [])
    challenger_model = _Model("challenger", [])
    champion_docker = _Docker("same")
    challenger_docker = _Docker("same")
    if different == "model":
        challenger_model = _OtherModel("challenger", [])
    elif different == "provider":
        champion_model = _ConfiguredProviderModel("champion", [], _ProviderOne())
        challenger_model = _ConfiguredProviderModel("challenger", [], _ProviderTwo())
    else:
        challenger_docker = _Docker("different")
    (
        champion_runner,
        champion_model,
        _,
        champion,
        challenger_runner,
        challenger_model,
        _,
        challenger,
    ) = _prepared_pair(
        champion_model=champion_model,
        challenger_model=challenger_model,
        champion_docker=champion_docker,
        challenger_docker=challenger_docker,
    )

    with pytest.raises(AlphaComparisonError, match="common conditions"):
        prepare_pair_authority(
            champion_runner,
            champion,
            challenger_runner,
            challenger,
            repeat_index=1,
            execution_order=("champion", "challenger"),
        )

    assert champion_model.request_count == challenger_model.request_count == 0


@pytest.mark.anyio
@pytest.mark.parametrize("different", ("model", "provider"))
async def test_execute_rejects_post_authority_runner_identity_drift_before_requests(
    different: str,
) -> None:
    if different == "provider":
        champion_model: _Model = _ConfiguredProviderModel("champion", [], _ProviderOne())
        challenger_model: _Model = _ConfiguredProviderModel("challenger", [], _ProviderOne())
    else:
        champion_model = _Model("champion", [])
        challenger_model = _Model("challenger", [])
    pair = _prepared_pair(champion_model=champion_model, challenger_model=challenger_model)
    champion_runner, champion, challenger_runner, challenger = pair[0], pair[3], pair[4], pair[7]
    prepare_pair_authority(
        champion_runner,
        champion,
        challenger_runner,
        challenger,
        repeat_index=1,
        execution_order=("champion", "challenger"),
    )
    changed_model: _Model = (
        _OtherModel("challenger", [])
        if different == "model"
        else _ConfiguredProviderModel("challenger", [], _ProviderTwo())
    )
    challenger_runner.model = changed_model

    with pytest.raises(AlphaTrialError, match="model|provider"):
        await challenger_runner.execute(challenger, _confirmation(challenger))

    assert champion_model.request_count == challenger_model.request_count == changed_model.request_count == 0


@pytest.mark.anyio
@pytest.mark.parametrize("different", ("model", "provider"))
async def test_paired_a5_resume_rejects_replacement_runner_identity_before_round_two_request(
    different: str,
) -> None:
    """Break caught: a paired recovery must retain the original runner identity for round 2."""
    if different == "provider":
        champion_model: _Model = _ConfiguredProviderModel("champion", [], _ProviderOne())
        challenger_model: _Model = _ConfiguredProviderModel("challenger", [], _ProviderOne())
    else:
        champion_model = _Model("champion", [])
        challenger_model = _Model("challenger", [])
    pair = _prepared_pair(
        task_id="A5", champion_model=champion_model, challenger_model=challenger_model
    )
    champion_runner, champion, challenger_runner, challenger = pair[0], pair[3], pair[4], pair[7]
    prepare_pair_authority(
        champion_runner,
        champion,
        challenger_runner,
        challenger,
        repeat_index=1,
        execution_order=("champion", "challenger"),
    )
    await _persist_completed_first_a5_round(champion_runner, champion)
    replacement: _Model = (
        _OtherModel("replacement", [])
        if different == "model"
        else _ConfiguredProviderModel("replacement", [], _ProviderTwo())
    )
    recovered = AlphaTrialRunner(
        task_root=champion_runner.task_root,
        image_lock_path=champion_runner.image_lock_path,
        data_root=champion.paths.data_root,
        model=replacement,
        docker_factory=champion_runner.docker_factory,
        allowed_drive="D:",
    )

    with pytest.raises(AlphaTrialError, match="pair|identity|model|provider"):
        await recovered.resume(champion.preview.trial_id)

    assert champion_model.request_count > 0
    assert replacement.request_count == 0


@pytest.mark.parametrize(
    "field,changed",
    [
        ("model_settings_digest", "sha256:different-settings"),
        ("budget", _budget().model_copy(update={"tokens": 9_999})),
        ("task_id", "A2"),
        ("baseline_tree_digest", "sha256:different-baseline"),
        ("runtime_policy_digest", "sha256:different-policy"),
        ("tool_contract_digest", "sha256:different-tools"),
        ("image_manifest_digest", "sha256:different-image"),
        ("named_checks_digest", "sha256:different-checks"),
        ("verifier_digest", "sha256:different-verifier"),
    ],
)
def test_prepare_pair_rejects_each_unfair_common_condition_before_requests(
    monkeypatch: pytest.MonkeyPatch, field: str, changed: Any
) -> None:
    champion_runner, champion_model, _, champion, challenger_runner, challenger_model, _, challenger = (
        _prepared_pair()
    )
    original = challenger_runner.condition_snapshot
    monkeypatch.setattr(
        challenger_runner,
        "condition_snapshot",
        lambda prepared: original(prepared).model_copy(update={field: changed}),
    )

    with pytest.raises(AlphaComparisonError, match="common conditions"):
        prepare_pair_authority(
            champion_runner,
            champion,
            challenger_runner,
            challenger,
            repeat_index=1,
            execution_order=("champion", "challenger"),
        )

    assert champion_model.request_count == challenger_model.request_count == 0


def test_prepare_pair_rejects_same_workspace_same_behavior_and_invalid_order_before_requests() -> None:
    champion_runner, champion_model, _, champion, challenger_runner, challenger_model, _, challenger = (
        _prepared_pair()
    )

    with pytest.raises(AlphaComparisonError, match="workspace"):
        prepare_pair_authority(
            champion_runner,
            champion,
            challenger_runner,
            replace(challenger, paths=champion.paths),
            repeat_index=1,
            execution_order=("champion", "challenger"),
        )

    same_runner, same_model, _ = _runner("same-behavior")
    same = same_runner.prepare("A1", budget=_budget())
    with pytest.raises(AlphaComparisonError, match="Candidate"):
        prepare_pair_authority(
            champion_runner,
            champion,
            same_runner,
            same,
            repeat_index=1,
            execution_order=("champion", "challenger"),
        )

    for repeat_index, order in ((0, ("champion", "challenger")), (1, ("champion", "champion"))):
        with pytest.raises(AlphaComparisonError):
            prepare_pair_authority(
                champion_runner,
                champion,
                challenger_runner,
                challenger,
                repeat_index=repeat_index,
                execution_order=order,
            )

    assert champion_model.request_count == challenger_model.request_count == same_model.request_count == 0


def test_prepare_pair_rejects_shared_durable_store_before_requests() -> None:
    champion_runner, champion_model, _, champion, challenger_runner, challenger_model, _, challenger = (
        _prepared_pair()
    )
    shared_context = replace(challenger, _app=champion._app)

    with pytest.raises(AlphaComparisonError, match="store"):
        prepare_pair_authority(
            champion_runner,
            champion,
            challenger_runner,
            shared_context,
            repeat_index=1,
            execution_order=("champion", "challenger"),
        )

    assert champion_model.request_count == challenger_model.request_count == 0


async def _execute_pair(
    *,
    repeat_index: int = 1,
    execution_order: tuple[PairRole, PairRole] = ("champion", "challenger"),
) -> tuple[Any, ...]:
    (
        champion_runner,
        champion_model,
        champion_docker,
        champion,
        challenger_runner,
        challenger_model,
        challenger_docker,
        challenger,
    ) = _prepared_pair()
    authority = prepare_pair_authority(
        champion_runner,
        champion,
        challenger_runner,
        challenger,
        repeat_index=repeat_index,
        execution_order=execution_order,
    )
    prepared = {"champion": champion, "challenger": challenger}
    runners = {"champion": champion_runner, "challenger": challenger_runner}
    results: dict[str, TrialResult] = {}
    for role in authority.execution_order:
        results[role] = await runners[role].execute(prepared[role], _confirmation(prepared[role]))
    manifests = {
        role: runners[role].store.get_object("alpha_trial_manifest", prepared[role].preview.trial_id, TrialManifest)
        for role in authority.execution_order
    }
    return (
        authority,
        champion_runner,
        champion_model,
        champion_docker,
        challenger_runner,
        challenger_model,
        challenger_docker,
        manifests,
        results,
    )


@pytest.mark.anyio
async def test_compare_pair_passes_only_complete_bound_arms_with_independent_execution() -> None:
    (
        authority,
        champion_runner,
        champion_model,
        champion_docker,
        challenger_runner,
        challenger_model,
        challenger_docker,
        manifests,
        results,
    ) = await _execute_pair()

    comparison = compare_pair(
        authority,
        champion_manifest=manifests["champion"],
        champion_result=results["champion"],
        challenger_manifest=manifests["challenger"],
        challenger_result=results["challenger"],
    )

    assert comparison.status == "PASS", (
        comparison.reason_codes,
        results["champion"].execution_status,
        results["champion"].run_stop_reasons,
        results["challenger"].execution_status,
        results["challenger"].run_stop_reasons,
    )
    assert comparison.comparison == "tie"
    assert comparison.champion is not None and comparison.challenger is not None
    assert comparison.champion.user_interruptions == comparison.challenger.user_interruptions == 0
    assert comparison.champion.usage == results["champion"].usage
    assert comparison.challenger.usage == results["challenger"].usage
    assert results["champion"].goal_id != results["challenger"].goal_id
    assert champion_runner.store.database != challenger_runner.store.database
    assert comparison.champion.store_identity == authority.champion.store_identity
    assert comparison.challenger.store_identity == authority.challenger.store_identity
    assert results["champion"].workspace_path != results["challenger"].workspace_path
    assert champion_model.request_count == challenger_model.request_count == 1
    assert champion_model.prompts and challenger_model.prompts
    assert champion_model.prompts[0] != challenger_model.prompts[0]
    assert len(champion_docker.final_calls) == len(challenger_docker.final_calls) == 1
    assert champion_runner.store.list_objects("eval_run", EvalRun) == []
    assert challenger_runner.store.list_objects("eval_run", EvalRun) == []
    assert champion_runner.store.list_objects("promotion", PromotionRecord) == []
    assert challenger_runner.store.list_objects("promotion", PromotionRecord) == []
    assert champion_runner.app.active_version("repo-task") == authority.champion.skill_version_id
    assert challenger_runner.app.active_version("repo-task") != authority.challenger.skill_version_id
    champion_repo_tasks = [
        item
        for item in champion_runner.store.list_objects("artifact", ArtifactVersion)
        if item.artifact_id == "repo-task"
    ]
    challenger_repo_tasks = [
        item
        for item in challenger_runner.store.list_objects("artifact", ArtifactVersion)
        if item.artifact_id == "repo-task"
    ]
    assert [item for item in champion_repo_tasks if item.status is ArtifactStatus.CANDIDATE] == []
    assert [item.version_id for item in challenger_repo_tasks if item.status is ArtifactStatus.CANDIDATE] == [
        authority.challenger.skill_version_id
    ]
    assert [
        item
        for item in (*champion_repo_tasks, *challenger_repo_tasks)
        if item.status is ArtifactStatus.SHADOW
    ] == []


@pytest.mark.anyio
async def test_compare_pair_rejects_syntactically_valid_result_content_tampering() -> None:
    authority, _, _, _, _, _, _, manifests, results = await _execute_pair()
    cases = (
        results["champion"].model_copy(update={"verdict": "not_met"}),
        results["champion"].model_copy(update={"boundary_status": "violated"}),
        results["champion"].model_copy(
            update={
                "usage": results["champion"].usage.model_copy(
                    update={"tokens": results["champion"].usage.tokens + 1}
                )
            }
        ),
        results["champion"].model_copy(update={"failure_categories": ("tampered",)}),
    )

    for tampered in cases:
        comparison = compare_pair(
            authority,
            champion_manifest=manifests["champion"],
            champion_result=tampered,
            challenger_manifest=manifests["challenger"],
            challenger_result=results["challenger"],
        )
        assert comparison.status == "FAIL"
        assert comparison.comparison is None
        assert comparison.champion is None
        assert comparison.challenger is not None


@pytest.mark.anyio
async def test_compare_pair_requires_durable_state_and_receipts_but_preserves_valid_other_arm() -> None:
    authority, champion_runner, _, _, challenger_runner, _, _, manifests, results = await _execute_pair()
    _delete_store_object(
        challenger_runner.store.database,
        "alpha_trial_result",
        authority.challenger.trial_id,
    )

    comparison = compare_pair(
        authority,
        champion_manifest=manifests["champion"],
        champion_result=results["champion"],
        challenger_manifest=manifests["challenger"],
        challenger_result=results["challenger"],
    )

    assert comparison.status == "INCONCLUSIVE"
    assert comparison.comparison is None
    assert comparison.champion is not None
    assert comparison.challenger is None
    assert "challenger_durable_result_missing" in comparison.reason_codes
    assert champion_runner.store.database != challenger_runner.store.database


@pytest.mark.anyio
async def test_compare_pair_fails_known_binding_or_isolation_tampering_without_comparison() -> None:
    authority, _, _, _, _, _, _, manifests, results = await _execute_pair()
    cases = (
        {
            "champion_result": results["champion"].model_copy(
                update={"trial_manifest_digest": "sha256:wrong"}
            )
        },
        {
            "challenger_manifest": manifests["challenger"].model_copy(
                update={"champion_digest": authority.champion.skill_digest}
            )
        },
        {
            "challenger_manifest": manifests["challenger"].model_copy(
                update={"workspace_identity": manifests["champion"].workspace_identity}
            )
        },
        {
            "challenger_result": results["challenger"].model_copy(
                update={"workspace_path": results["champion"].workspace_path}
            )
        },
    )
    for updates in cases:
        arguments = {
            "champion_manifest": manifests["champion"],
            "champion_result": results["champion"],
            "challenger_manifest": manifests["challenger"],
            "challenger_result": results["challenger"],
            **updates,
        }
        comparison = compare_pair(authority, **arguments)
        assert comparison.status == "FAIL"
        assert comparison.comparison is None

    tampered_authority = authority.model_copy(
        update={
            "challenger": authority.challenger.model_copy(
                update={"store_identity": authority.champion.store_identity}
            )
        }
    )
    comparison = compare_pair(
        tampered_authority,
        champion_manifest=manifests["champion"],
        champion_result=results["champion"],
        challenger_manifest=manifests["challenger"],
        challenger_result=results["challenger"],
    )
    assert comparison.status == "FAIL"
    assert comparison.comparison is None
    assert comparison.reason_codes == ("pair_authority_invalid",)


@pytest.mark.anyio
async def test_compare_pair_keeps_malformed_manifest_inconclusive_without_raising() -> None:
    authority, _, _, _, _, _, _, manifests, results = await _execute_pair()
    malformed = manifests["challenger"].model_dump(mode="json")
    del malformed["task_id"]

    comparison = compare_pair(
        authority,
        champion_manifest=manifests["champion"],
        champion_result=results["champion"],
        challenger_manifest=malformed,  # type: ignore[arg-type]
        challenger_result=results["challenger"],
    )

    assert comparison.status == "INCONCLUSIVE"
    assert comparison.comparison is None
    assert comparison.reason_codes == ("challenger_manifest_malformed",)


@pytest.mark.anyio
async def test_compare_pair_keeps_malformed_result_inconclusive_without_raising() -> None:
    authority, _, _, _, _, _, _, manifests, results = await _execute_pair()
    malformed = results["challenger"].model_dump(mode="json")
    malformed["verification_status"] = "corrupt"

    comparison = compare_pair(
        authority,
        champion_manifest=manifests["champion"],
        champion_result=results["champion"],
        challenger_manifest=manifests["challenger"],
        challenger_result=malformed,  # type: ignore[arg-type]
    )

    assert comparison.status == "INCONCLUSIVE"
    assert comparison.comparison is None
    assert comparison.reason_codes == ("challenger_result_malformed",)

    tampered_authority = authority.model_copy(
        update={
            "challenger": authority.challenger.model_copy(
                update={"store_identity": authority.champion.store_identity}
            )
        }
    )
    precedence = compare_pair(
        tampered_authority,
        champion_manifest=manifests["champion"],
        champion_result=results["champion"],
        challenger_manifest=manifests["challenger"],
        challenger_result=malformed,  # type: ignore[arg-type]
    )
    assert precedence.status == "FAIL"
    assert precedence.comparison is None
    assert precedence.reason_codes == ("pair_authority_invalid",)


@pytest.mark.anyio
async def test_compare_pair_preserves_only_the_independently_valid_arm_for_partial_receipts() -> None:
    authority, _, _, _, _, _, _, manifests, results = await _execute_pair()
    malformed_manifest = manifests["challenger"].model_dump(mode="json")
    del malformed_manifest["task_id"]
    malformed_result = results["challenger"].model_dump(mode="json")
    malformed_result["verification_status"] = "corrupt"
    cases = (
        {"challenger_manifest": None},
        {"challenger_result": None},
        {"challenger_manifest": malformed_manifest},
        {"challenger_result": malformed_result},
    )

    for updates in cases:
        arguments = {
            "champion_manifest": manifests["champion"],
            "champion_result": results["champion"],
            "challenger_manifest": manifests["challenger"],
            "challenger_result": results["challenger"],
            **updates,
        }
        comparison = compare_pair(authority, **arguments)
        assert comparison.status == "INCONCLUSIVE"
        assert comparison.comparison is None
        assert comparison.champion is not None
        assert comparison.challenger is None


@pytest.mark.anyio
async def test_compare_pair_rejects_valid_but_non_durable_uncertain_result_copies() -> None:
    authority, _, _, _, _, _, _, manifests, results = await _execute_pair()
    cases = (
        {"challenger_result": results["challenger"].model_copy(update={"execution_status": "failed"})},
        {
            "challenger_result": results["challenger"].model_copy(
                update={"verification_status": "unavailable", "verdict": "inconclusive"}
            )
        },
        {
            "challenger_result": results["challenger"].model_copy(
                update={"verification_status": "invalid", "verdict": "inconclusive"}
            )
        },
        {"challenger_result": results["challenger"].model_copy(update={"verdict": "inconclusive"})},
        {"challenger_result": results["challenger"].model_copy(update={"boundary_status": "unknown"})},
    )
    for updates in cases:
        arguments = {
            "champion_manifest": manifests["champion"],
            "champion_result": results["champion"],
            "challenger_manifest": manifests["challenger"],
            "challenger_result": results["challenger"],
            **updates,
        }
        comparison = compare_pair(authority, **arguments)
        assert comparison.status == "FAIL", comparison.reason_codes
        assert comparison.comparison is None
        assert comparison.challenger is None


def _arm(
    role: str,
    suffix: str,
    usage: TrialUsage,
) -> PairedArmProjection:
    return PairedArmProjection(
        role=role,
        trial_id=f"trial-{role}-{suffix}",
        manifest_digest=f"sha256:manifest-{role}-{suffix}",
        result_digest=f"sha256:result-{role}-{suffix}",
        goal_id=f"goal-{role}-{suffix}",
        store_identity=f"sha256:store-{role}-{suffix}",
        skill_version_id=f"skill-{role}",
        skill_digest=f"sha256:skill-{role}",
        verdict="met",
        failure_categories=(),
        execution_status="completed",
        verification_status="completed",
        boundary_status="passed",
        usage=usage,
        user_interruptions=0,
    )


def _pair_result(
    pair_id: str,
    repeat_index: int,
    *,
    status: str = "PASS",
    comparison: str | None = "tie",
    champion_usage: TrialUsage | None = None,
    challenger_usage: TrialUsage | None = None,
) -> PairedComparisonResult:
    champion = _arm(
        "champion",
        str(repeat_index),
        champion_usage or TrialUsage(
            model_requests=1,
            tokens=10,
            tool_calls=2,
            action_effects=3,
            wall_seconds=4,
        ),
    )
    challenger = _arm(
        "challenger",
        str(repeat_index),
        challenger_usage or TrialUsage(
            model_requests=2,
            tokens=20,
            tool_calls=3,
            action_effects=4,
            wall_seconds=5,
        ),
    )
    if status == "PASS" and comparison == "champion_better":
        challenger = challenger.model_copy(update={"verdict": "not_met"})
    elif status == "PASS" and comparison == "challenger_better":
        champion = champion.model_copy(update={"verdict": "not_met"})
    return PairedComparisonResult(
        pair_id=pair_id,
        repeat_index=repeat_index,
        status=status,
        reason_codes=() if status == "PASS" else (status.lower(),),
        comparison=comparison if status == "PASS" else None,
        champion=champion,
        challenger=challenger,
    )


def test_aggregate_repeated_ab_ba_pairs_preserves_order_totals_and_exact_replay() -> None:
    ab = _pair_result("pair-ab", 1)
    ba = _pair_result(
        "pair-ba",
        2,
        comparison="challenger_better",
        champion_usage=TrialUsage(
            model_requests=3,
            tokens=30,
            tool_calls=4,
            action_effects=5,
            wall_seconds=6,
        ),
        challenger_usage=TrialUsage(
            model_requests=4,
            tokens=40,
            tool_calls=5,
            action_effects=6,
            wall_seconds=7,
        ),
    )

    aggregate = aggregate_pair_results((ab, ba))
    replay = aggregate_pair_results((ab, ba))

    assert aggregate == replay
    assert aggregate.status == "PASS"
    assert aggregate.pair_ids == ("pair-ab", "pair-ba")
    assert aggregate.pair_results == (ab, ba)
    assert aggregate.comparison_counts == {
        "champion_better": 0,
        "challenger_better": 1,
        "tie": 1,
    }
    assert aggregate.champion_usage == TrialUsage(
        model_requests=4,
        tokens=40,
        tool_calls=6,
        action_effects=8,
        wall_seconds=10,
    )
    assert aggregate.challenger_usage == TrialUsage(
        model_requests=6,
        tokens=60,
        tool_calls=8,
        action_effects=10,
        wall_seconds=12,
    )
    assert aggregate.champion_user_interruptions == 0
    assert aggregate.challenger_user_interruptions == 0


def test_aggregate_deserialization_recomputes_nested_results_and_every_derived_field() -> None:
    aggregate = aggregate_pair_results((_pair_result("pair-1", 1), _pair_result("pair-2", 2)))
    payloads: list[dict[str, Any]] = []
    for mutation in (
        ("status", "FAIL"),
        ("pair_ids", ["pair-2", "pair-1"]),
        ("comparison_counts", {"champion_better": 2, "challenger_better": 0, "tie": 0}),
        ("champion_usage", {**aggregate.champion_usage.model_dump(mode="json"), "tokens": 999}),
        ("champion_user_interruptions", 1),
        ("aggregate_id", "sha256:tampered"),
    ):
        payload = aggregate.model_dump(mode="json")
        payload[mutation[0]] = mutation[1]
        payloads.append(payload)
    changed_result = aggregate.model_dump(mode="json")
    changed_result["pair_results"][0]["status"] = "FAIL"
    changed_result["pair_results"][0]["reason_codes"] = ["tampered"]
    changed_result["pair_results"][0]["comparison"] = None
    payloads.append(changed_result)

    for payload in payloads:
        with pytest.raises(ValueError):
            PairedComparisonAggregate.model_validate(payload)


def test_aggregate_marks_role_totals_unknown_when_any_repeat_is_missing_that_arm() -> None:
    complete = _pair_result("pair-1", 1)
    missing_challenger = _pair_result("pair-2", 2).model_copy(
        update={
            "status": "INCONCLUSIVE",
            "reason_codes": ("challenger_result_missing",),
            "comparison": None,
            "challenger": None,
        }
    )

    aggregate = aggregate_pair_results((complete, missing_challenger))

    assert aggregate.status == "INCONCLUSIVE"
    assert aggregate.champion_usage == TrialUsage(
        model_requests=2,
        tokens=20,
        tool_calls=4,
        action_effects=6,
        wall_seconds=8,
    )
    assert aggregate.champion_user_interruptions == 0
    assert aggregate.challenger_usage is None
    assert aggregate.challenger_user_interruptions is None


@pytest.mark.anyio
async def test_aggregate_executes_two_complete_fake_pairs_in_frozen_ab_ba_order() -> None:
    ab = await _execute_pair(
        repeat_index=1,
        execution_order=("champion", "challenger"),
    )
    ba = await _execute_pair(
        repeat_index=2,
        execution_order=("challenger", "champion"),
    )
    executions = (ab, ba)
    comparisons = tuple(
        compare_pair(
            executed[0],
            champion_manifest=executed[7]["champion"],
            champion_result=executed[8]["champion"],
            challenger_manifest=executed[7]["challenger"],
            challenger_result=executed[8]["challenger"],
        )
        for executed in executions
    )

    aggregate = aggregate_pair_results(comparisons)

    assert tuple(executed[0].execution_order for executed in executions) == (
        ("champion", "challenger"),
        ("challenger", "champion"),
    )
    assert ab[2].request_order == ["champion", "challenger"]
    assert ba[2].request_order == ["challenger", "champion"]
    assert tuple(result.status for result in comparisons) == ("PASS", "PASS")
    assert aggregate == aggregate_pair_results(comparisons)
    assert aggregate.pair_ids == tuple(result.pair_id for result in comparisons)
    assert len(
        {
            leg.trial_id
            for executed in executions
            for leg in (executed[0].champion, executed[0].challenger)
        }
    ) == 4
    assert len(
        {
            leg.workspace_identity
            for executed in executions
            for leg in (executed[0].champion, executed[0].challenger)
        }
    ) == 4
    assert len(
        {
            leg.store_identity
            for executed in executions
            for leg in (executed[0].champion, executed[0].challenger)
        }
    ) == 4
    assert len(
        {
            result.goal_id
            for executed in executions
            for result in executed[8].values()
        }
    ) == 4
    assert len(
        {
            prompt
            for executed in executions
            for model in (executed[2], executed[5])
            for prompt in model.prompts
        }
    ) == 4


@pytest.mark.parametrize(
    "statuses,expected",
    [
        (("PASS", "PASS"), "PASS"),
        (("PASS", "INCONCLUSIVE"), "INCONCLUSIVE"),
        (("INCONCLUSIVE", "FAIL"), "FAIL"),
    ],
)
def test_aggregate_status_precedence_is_fail_then_inconclusive_then_pass(
    statuses: tuple[str, str], expected: str
) -> None:
    results = tuple(
        _pair_result(f"pair-{index}", index, status=status)
        for index, status in enumerate(statuses, start=1)
    )

    assert aggregate_pair_results(results).status == expected


@pytest.mark.parametrize(
    "results",
    [
        (),
        (_pair_result("pair-2", 2),),
        (_pair_result("pair-1", 1), _pair_result("pair-3", 3)),
        (_pair_result("pair-1", 1), _pair_result("pair-2", 1)),
        (_pair_result("pair-same", 1), _pair_result("pair-same", 2)),
    ],
)
def test_aggregate_rejects_missing_noncontiguous_or_duplicate_repeats(
    results: tuple[PairedComparisonResult, ...],
) -> None:
    with pytest.raises(AlphaComparisonError):
        aggregate_pair_results(results)


def test_aggregate_single_outcome_stays_descriptive_without_promotion_authority() -> None:
    aggregate = aggregate_pair_results(
        (_pair_result("pair-1", 1, comparison="challenger_better"),)
    )

    assert aggregate.comparison_counts["challenger_better"] == 1
    assert aggregate.status == "PASS"
    assert "stable_improvement" not in type(aggregate).model_fields
    assert "promotion_authority" not in type(aggregate).model_fields
