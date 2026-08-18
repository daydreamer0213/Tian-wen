"""Run the one approved Alpha-C A1 natural-evidence sample.

This is deliberately an operations entry point, not a reusable controller.  It
only ever prepares A1, executes it once under the approved Goal and budget, and
may repeat it once after a qualifying verifier failure.
"""

from __future__ import annotations

import asyncio
import json
import os
import sqlite3
import subprocess
import sys
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, TextIO

from pydantic_ai.models import Model, infer_model
from pydantic_ai.models.wrapper import WrapperModel

from tianwen.alpha import AlphaTrialConditionSnapshot, AlphaTrialRunner, TrialConfirmation, TrialManifest, TrialResult
from tianwen.domain import ArtifactVersion, BudgetLimit, EvidenceRecord, GoalContract, RunRecord, content_digest
from tianwen.evaluation import ActivePointer
from tianwen.learning import LearningEngine
from tianwen.learning_intake import LearningIntake, LearningTriageReceipt, OutcomeObservation

TASK_ID = "A1"
MODEL_ID = "deepseek:deepseek-v4-pro"
PROVIDER_NAME = "deepseek"
PROVIDER_BASE_URL = "https://api.deepseek.com"
MAX_OUTPUT_TOKENS = 4096
MAX_STAGE_CNY_MICROUNITS = 20_000_000
BUDGET = BudgetLimit(model_requests=4, tool_calls=8, tokens=40_000, wall_seconds=300, action_effects=8)
ZERO_RESOURCE_LEARNING_BUDGET = BudgetLimit(
    model_requests=0, tool_calls=0, tokens=0, wall_seconds=0, child_loops=0, action_effects=0
)
STAGE_ROOT = Path("D:/DevData/tianwen-alpha-c-real-evidence")
RECOVERY_1_STAGE_ROOT = Path("D:/DevData/tianwen-alpha-c-real-evidence-recovery-1")
RECOVERY_STAGE_ROOT = Path("D:/DevData/tianwen-alpha-c-real-evidence-recovery-2")
RECOVERY_OF_TRIAL_ID = "trial-633752d776238190a9411a1cd8b7c71a"
RECOVERY_1_TRIAL_ID = "trial-81c53da1ea42cc4330854a9e4182c2e5"
LOCKED_IMAGE_REFERENCE = "python@sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7"
ORIGINAL_AUTHORITY_DIGEST = "sha256:66af629ca1e8b9ae7e1998ae0b1883952bcea9ee3afc9f7188568558f8d84192"
RECOVERY_1_AUTHORITY_DIGEST = "sha256:f7651000fb2fda294e4b45bcd23cca78bb9327df0121a1db1cf112d0bf5e13a4"
RECOVERY_1_STOP_DIGEST = "sha256:78c2cd46d4ed03eca520c5ef8e555751872fe80bfa0def90198e5f990422e78e"
PRICE_SOURCE_URL = "https://api-docs.deepseek.com/zh-cn/quick_start/pricing/"
BASE_SHA = "4638026f210c0de29262d307dd051934570d975e"
STAGE_BRANCH = "codex/tianwen-alpha-c-real-evidence"
PROJECT_ROOT = Path(__file__).resolve().parents[1]


class StageError(RuntimeError):
    """The bounded sampling stage cannot safely advance."""


@dataclass(frozen=True)
class PriceSnapshot:
    source_url: str
    model_id: str
    observed_at: datetime
    rates_cny_per_million: Mapping[str, int]

    def authority(self) -> dict[str, Any]:
        rates = dict(sorted(self.rates_cny_per_million.items()))
        return {
            "source_url": self.source_url,
            "model_id": self.model_id,
            "observed_at": self.observed_at.astimezone(UTC).isoformat(),
            "rates_cny_per_million": rates,
            "max_cny_per_million": max(rates.values()),
        }


RECORDED_PRICE_SNAPSHOT = PriceSnapshot(
    source_url=PRICE_SOURCE_URL,
    model_id=MODEL_ID,
    observed_at=datetime(2026, 8, 18, tzinfo=UTC),
    rates_cny_per_million={"maximum_published": 27},
)


@dataclass(frozen=True)
class CheckoutAudit:
    branch: str
    head: str
    main: str
    origin_main: str
    base: str
    champion_version_id: str
    champion_digest: str
    skill_digest: str
    object_counts: Mapping[str, int]

    def authority(self) -> dict[str, Any]:
        return {
            "branch": self.branch,
            "head": self.head,
            "main": self.main,
            "origin_main": self.origin_main,
            "base": self.base,
            "champion_version_id": self.champion_version_id,
            "champion_digest": self.champion_digest,
            "skill_digest": self.skill_digest,
            "object_counts": dict(sorted(self.object_counts.items())),
        }


class _OutputLimitedModel(WrapperModel):
    """Keep the approved provider request ceiling local to this one operator."""

    @property
    def settings(self) -> Any:
        values = dict(self.wrapped.settings or {})
        values["max_tokens"] = MAX_OUTPUT_TOKENS
        return values

    async def request(self, messages: Any, model_settings: Any, model_request_parameters: Any) -> Any:
        values = dict(model_settings or {})
        values["max_tokens"] = MAX_OUTPUT_TOKENS
        return await self.wrapped.request(messages, values, model_request_parameters)


@dataclass(frozen=True)
class StageDependencies:
    """Small seam for offline tests; the CLI itself supplies no mutable choices."""

    stage_root: Path = RECOVERY_STAGE_ROOT
    recovery_of_root: Path | None = STAGE_ROOT
    recovery_1_root: Path | None = RECOVERY_1_STAGE_ROOT
    environment: Mapping[str, str] | None = None
    stdout: TextIO = sys.stdout
    model_factory: Callable[[], Model] | None = None
    runner_factory: Callable[[Model, Path], AlphaTrialRunner] | None = None
    intake_factory: Callable[[Any, BudgetLimit], LearningIntake] | None = None
    price_snapshot: PriceSnapshot | None = None
    checkout_audit: Callable[[], CheckoutAudit] | None = None


def _native_model() -> Model:
    return _OutputLimitedModel(infer_model(MODEL_ID))


def _validate_price_snapshot(snapshot: PriceSnapshot) -> None:
    if snapshot.source_url != PRICE_SOURCE_URL or snapshot.model_id != MODEL_ID:
        raise StageError("price snapshot source or model does not match")
    rates = snapshot.rates_cny_per_million
    if (
        snapshot.observed_at.tzinfo is None
        or not rates
        or any(
            not isinstance(name, str)
            or not name
            or isinstance(rate, bool)
            or not isinstance(rate, int)
            or rate <= 0
            for name, rate in rates.items()
        )
    ):
        raise StageError("price snapshot rates are invalid")


def _git(*args: str) -> str:
    completed = subprocess.run(
        ["git", *args], cwd=PROJECT_ROOT, text=True, capture_output=True, check=False, shell=False
    )
    if completed.returncode:
        raise StageError(f"git audit failed: {' '.join(args)}")
    return completed.stdout.strip()


def audit_checkout_and_governance() -> CheckoutAudit:
    branch, head = _git("branch", "--show-current"), _git("rev-parse", "HEAD")
    main, origin_main = _git("rev-parse", "main"), _git("rev-parse", "origin/main")
    if (
        branch != STAGE_BRANCH
        or main != BASE_SHA
        or origin_main != BASE_SHA
        or _git("merge-base", "HEAD", BASE_SHA) != BASE_SHA
    ):
        raise StageError("checkout branch or base authority does not match")
    if _git("status", "--porcelain"):
        raise StageError("tracked checkout must be clean before preflight")
    database = PROJECT_ROOT / ".tianwen" / "tianwen.db"
    if not database.is_file():
        raise StageError("production governance database is unavailable")
    try:
        connection = sqlite3.connect(f"file:{database.as_posix()}?mode=ro", uri=True)
        rows = connection.execute("SELECT kind, object_id, status, body_json, body_digest FROM tw_objects").fetchall()
    except sqlite3.Error as error:
        raise StageError("production governance audit cannot open SQLite read-only") from error
    finally:
        try:
            connection.close()
        except UnboundLocalError:
            pass
    counts: dict[str, int] = {}
    decoded: list[tuple[str, str, str, dict[str, Any]]] = []
    for kind, object_id, status, body_json, body_digest in rows:
        body = json.loads(body_json)
        if content_digest(body) != body_digest:
            raise StageError("production governance object digest does not match")
        counts[kind] = counts.get(kind, 0) + 1
        decoded.append((kind, object_id, status, body))
    active = [
        (object_id, body) for kind, object_id, status, body in decoded if kind == "artifact" and status == "active"
    ]
    pointers = [(object_id, body) for kind, object_id, _status, body in decoded if kind == "active_pointer"]
    if len(active) != 1 or len(pointers) != 1:
        raise StageError("production governance Champion authority is not singular")
    champion = ArtifactVersion.model_validate(active[0][1])
    pointer = ActivePointer.model_validate(pointers[0][1])
    skill = (PROJECT_ROOT / "skills" / "repo-task" / "SKILL.md").read_text(encoding="utf-8")
    if (
        champion.artifact_id != "repo-task"
        or champion.version_id != pointer.current_version_id
        or champion.content != skill
        or champion.content_digest != content_digest(skill)
        or any(kind == "artifact" and status == "candidate" for kind, _id, status, _body in decoded)
        or any(
            kind in {"case", "lesson", "learning_conclusion", "alpha_trial_manifest", "alpha_trial_result"}
            for kind, *_ in decoded
        )
    ):
        raise StageError("production governance state is not the approved empty Alpha-C baseline")
    return CheckoutAudit(
        branch=branch,
        head=head,
        main=main,
        origin_main=origin_main,
        base=BASE_SHA,
        champion_version_id=champion.version_id,
        champion_digest=champion.content_digest,
        skill_digest=content_digest(skill),
        object_counts=counts,
    )


def _native_runner(model: Model, stage_root: Path) -> AlphaTrialRunner:
    return AlphaTrialRunner(
        task_root=PROJECT_ROOT / "alpha" / "tasks",
        image_lock_path=PROJECT_ROOT / "alpha" / "environment" / "image.lock",
        data_root=stage_root,
        model=model,
        allowed_drive="D:",
    )


def _receipt(root: Path, name: str, values: Mapping[str, Any]) -> Path:
    receipts = root / "receipts"
    receipts.mkdir(parents=True, exist_ok=True)
    path = receipts / name
    try:
        with path.open("x", encoding="utf-8") as handle:
            json.dump(values, handle, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
            handle.write("\n")
    except FileExistsError as error:
        raise StageError(f"receipt already exists: {path.name}") from error
    return path


def _under_devdata(path: Path) -> Path:
    root, value = Path("D:/DevData").resolve(), path.resolve()
    if value == root or not value.is_relative_to(root):
        raise StageError("stage data root must be a new child of D:\\DevData")
    return value


def _initialize_stage_root(path: Path) -> Path:
    root = _under_devdata(path)
    root.parent.mkdir(parents=True, exist_ok=True)
    try:
        root.mkdir()
    except FileExistsError as error:
        raise StageError("stage root is already initialized; a second batch is forbidden") from error
    return root


def _host_readiness() -> None:
    """Prove the fixed Docker host facts before consuming recovery-2."""
    try:
        version = subprocess.run(
            ["docker", "version", "--format", "{{json .}}"],
            stdin=subprocess.DEVNULL,
            capture_output=True,
            check=False,
            shell=False,
            timeout=10,
        )
        image = subprocess.run(
            ["docker", "image", "inspect", LOCKED_IMAGE_REFERENCE],
            stdin=subprocess.DEVNULL,
            capture_output=True,
            check=False,
            shell=False,
            timeout=10,
        )
        if version.returncode or image.returncode:
            raise ValueError
        version_payload = json.loads(version.stdout)
        observed = json.loads(image.stdout)
        if not isinstance(version_payload, dict) or not isinstance(version_payload.get("Server"), dict):
            raise ValueError
        server = version_payload["Server"]
        if isinstance(observed, list) and len(observed) == 1:
            observed = observed[0]
        repo_digests = observed.get("RepoDigests") if isinstance(observed, dict) else None
        if (
            server.get("Os") != "linux"
            or server.get("Arch") != "amd64"
            or not isinstance(observed, dict)
            or not isinstance(repo_digests, list)
            or LOCKED_IMAGE_REFERENCE not in repo_digests
        ):
            raise ValueError
    except (OSError, subprocess.TimeoutExpired, TypeError, ValueError, json.JSONDecodeError) as error:
        raise StageError("Docker readiness does not match the locked Linux/amd64 image") from error


def _validate_zero_paid_recovery(
    path: Path,
    *,
    expected_trial_id: str,
    expected_authority_digest: str,
    require_stop_receipt: bool,
    expected_stop_digest: str | None = None,
    expected_recovery_of: Mapping[str, str] | None = None,
) -> dict[str, str | None]:
    root = _under_devdata(path)
    authority_path = root / "receipts" / "stage-authority.json"
    stop_receipt_path = root / "receipts" / "stop-preflight.json"
    connection: sqlite3.Connection | None = None
    try:
        raw_authority = authority_path.read_bytes()
        if len(raw_authority) > 65_536:
            raise ValueError
        if content_digest(raw_authority) != expected_authority_digest:
            raise ValueError
        authority = json.loads(raw_authority)
        trial_roots = [item for item in (root / "runs").iterdir() if item.is_dir()]
        if (
            not isinstance(authority, dict)
            or authority.get("schema") != "tianwen.alpha_c.real_evidence.stage_authority.v1"
            or authority.get("task_id") != TASK_ID
            or authority.get("model_id") != MODEL_ID
            or authority.get("budget") != BUDGET.model_dump(mode="json")
            or authority.get("max_trials") != 2
            or authority.get("candidate_version_id") is not None
            or len(trial_roots) != 1
            or trial_roots[0].name != expected_trial_id
            or (expected_recovery_of is not None and authority.get("recovery_of") != dict(expected_recovery_of))
        ):
            raise ValueError
        database = trial_roots[0] / "state" / "tianwen.db"
        connection = sqlite3.connect(f"file:{database.resolve().as_posix()}?mode=ro", uri=True)
        connection.execute("PRAGMA query_only=ON")
        tables = {
            row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()
        }
        required = {
            "tw_objects",
            "tw_budgets",
            "tw_model_request_reservations",
            "tw_action_budget_reservations",
        }
        if not required.issubset(tables):
            raise ValueError
        baseline_kinds = {"active_pointer", "app_config", "artifact", "eval_protocol"}
        if any(row[0] not in baseline_kinds for row in connection.execute("SELECT kind FROM tw_objects")):
            raise ValueError
        if connection.execute("SELECT COUNT(*) FROM tw_budgets").fetchone()[0]:
            raise ValueError
        counted_tables = {"tw_model_request_reservations", "tw_action_budget_reservations", "tw_actions", "tw_events"}
        if any(
            connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            for table in counted_tables & tables
        ):
            raise ValueError
        if require_stop_receipt:
            raw_stop = stop_receipt_path.read_bytes()
            if len(raw_stop) > 65_536 or content_digest(raw_stop) != expected_stop_digest:
                raise ValueError
            stop = json.loads(raw_stop)
            if stop != {
                "schema": "tianwen.alpha_c.real_evidence.preflight_stop.v1",
                "stop": "preflight_failure",
                "phase": "prepare",
                "failure_class": "DockerExecutionError",
                "model_requests": 0,
                "tokens": 0,
                "conservative_charge_microunits": 0,
                "remaining_cny_microunits": MAX_STAGE_CNY_MICROUNITS,
                "case_id": None,
                "lesson_id": None,
                "candidate_version_id": None,
            }:
                raise ValueError
        elif stop_receipt_path.exists():
            raise ValueError
    except (OSError, json.JSONDecodeError, sqlite3.Error, TypeError, ValueError) as error:
        raise StageError("old stage is not an exact zero-paid recovery authority") from error
    finally:
        if connection is not None:
            connection.close()
    return {
        "authority_path": str(authority_path.resolve()),
        "authority_digest": content_digest(raw_authority),
        "trial_id": trial_roots[0].name,
        "stop_receipt_path": str(stop_receipt_path.resolve()) if require_stop_receipt else None,
        "stop_receipt_digest": content_digest(raw_stop) if require_stop_receipt else None,
    }


def _micro_cny(tokens: int, price: PriceSnapshot) -> int:
    return tokens * max(price.rates_cny_per_million.values())


def _validate_model(model: Model) -> None:
    provider = getattr(model, "provider", None)
    if (
        getattr(model, "model_id", None) != MODEL_ID
        or getattr(provider, "name", None) != PROVIDER_NAME
        or str(getattr(provider, "base_url", "")).rstrip("/") != PROVIDER_BASE_URL
    ):
        raise StageError("fixed DeepSeek provider identity does not match")
    if dict(getattr(model, "settings", None) or {}).get("max_tokens") != MAX_OUTPUT_TOKENS:
        raise StageError("fixed provider max_tokens does not match")


def _runner_authority(runner: Any) -> tuple[Any, Any]:
    if getattr(runner, "store", None) is None or getattr(runner, "app", None) is None:
        raise StageError("runner did not expose public store and app after prepare")
    return runner.store, runner.app


def _assert_zero_paid_preflight(runner: Any) -> None:
    store, _app = _runner_authority(runner)
    if store.list_objects("goal", GoalContract) or store.list_objects("run", RunRecord):
        raise StageError("prepare created a Goal or Run before bounded execution")


def _prepared_authority(runner: Any, prepared: Any) -> dict[str, Any]:
    condition = runner.condition_snapshot(prepared)
    if not isinstance(condition, AlphaTrialConditionSnapshot):
        raise StageError("runner did not return an Alpha condition snapshot")
    return {
        "trial_id": prepared.preview.trial_id,
        "condition": condition,
        "condition_digest": content_digest(condition),
        "champion_version_id": prepared.champion_version_id,
        "champion_digest": prepared.champion_digest,
        "workspace": str(prepared.paths.workspace),
        "store": str(prepared.paths.state),
    }


def _prepare(runner: Any, audit: CheckoutAudit) -> tuple[Any, dict[str, Any]]:
    prepared = runner.prepare(TASK_ID, budget=BUDGET, previous_trial_id=None)
    preview = prepared.preview
    if (
        preview.task_id != TASK_ID
        or preview.model_id != MODEL_ID
        or preview.provider_name != PROVIDER_NAME
        or preview.budget != BUDGET
    ):
        raise StageError("prepared trial diverges from the fixed stage authority")
    _assert_zero_paid_preflight(runner)
    authority = _prepared_authority(runner, prepared)
    if (authority["champion_version_id"], authority["champion_digest"]) != (
        audit.champion_version_id,
        audit.champion_digest,
    ):
        raise StageError("prepared Champion does not match production governance audit")
    return prepared, authority


def _qualifying_failure(result: TrialResult) -> bool:
    return (
        result.qualifies_as_real_model_trial
        and result.execution_status == "completed"
        and result.verification_status == "completed"
        and result.boundary_status == "passed"
        and result.verdict == "not_met"
        and bool(result.failure_categories)
    )


def _qualifying_success(result: TrialResult) -> bool:
    return (
        result.qualifies_as_real_model_trial
        and result.execution_status == "completed"
        and result.verification_status == "completed"
        and result.boundary_status == "passed"
        and result.verdict == "met"
    )


def _result_charge(result: TrialResult, price: PriceSnapshot) -> int:
    tokens = result.usage.tokens if result.qualifies_as_real_model_trial else BUDGET.tokens
    return _micro_cny(tokens, price)


def _load_result(store: Any, app: Any, result: TrialResult) -> tuple[TrialResult, dict[str, Any]]:
    durable = store.get_object("alpha_trial_result", result.trial_id, TrialResult)
    if durable != result:
        raise StageError("executed trial result does not match its durable receipt")
    manifest = store.get_object("alpha_trial_manifest", result.trial_id, TrialManifest)
    if content_digest(manifest) != result.trial_manifest_digest:
        raise StageError("trial result manifest binding does not match")
    evidence = tuple(store.get_object("evidence", evidence_id, EvidenceRecord) for evidence_id in result.evidence_ids)
    final = tuple(
        item
        for item in evidence
        if item.evidence_type == "alpha_final_verification"
        and item.purpose == "alpha_final_verification"
        and item.source_class == "docker_verifier"
        and item.scope == f"trial:{result.trial_id}"
        and item.run_id == f"alpha:{result.trial_id}:settlement"
    )
    if (_qualifying_success(durable) or _qualifying_failure(durable)) and not final:
        raise StageError("trial result lacks exact final verifier evidence")
    task = app.goal_task(result.goal_id)
    _limit, usage, _reserved = store.get_budget(task.loop_id)
    if (
        usage.model_requests != result.usage.model_requests
        or usage.tokens != result.usage.tokens
        or usage.tool_calls != result.usage.tool_calls
        or usage.action_effects != result.usage.action_effects
    ):
        raise StageError("trial result usage does not match durable budget usage")
    return durable, {
        "result_digest": content_digest(durable),
        "manifest_digest": content_digest(manifest),
        "evidence_ids": tuple(item.evidence_id for item in evidence),
        "evidence_digest": content_digest({"evidence_ids": tuple(item.evidence_id for item in evidence)}),
        "usage": usage.model_dump(mode="json"),
        "usage_digest": content_digest(usage),
    }


def _intake(store: Any, factory: Callable[[Any, BudgetLimit], LearningIntake] | None) -> LearningIntake:
    if factory is not None:
        return factory(store, ZERO_RESOURCE_LEARNING_BUDGET)
    return LearningIntake(LearningEngine(store, ZERO_RESOURCE_LEARNING_BUDGET))


def _project(intake: LearningIntake, result: TrialResult, trial_store: Any) -> OutcomeObservation:
    return intake.record_trial_outcome(result, trial_store=trial_store)


def _final_receipt(
    root: Path,
    first: TrialResult,
    *,
    stop: str,
    charged_microunits: int,
    price: PriceSnapshot,
    audit: CheckoutAudit,
    first_durable: Mapping[str, Any],
    second: TrialResult | None = None,
    second_durable: Mapping[str, Any] | None = None,
    triage: LearningTriageReceipt | None = None,
) -> dict[str, Any]:
    price_authority = price.authority()
    remaining = MAX_STAGE_CNY_MICROUNITS - charged_microunits
    values: dict[str, Any] = {
        "schema": "tianwen.alpha_c.real_evidence.stop.v1",
        "stop": stop,
        "trial_ids": [first.trial_id, *(() if second is None else (second.trial_id,))],
        "model_requests": first.usage.model_requests + (0 if second is None else second.usage.model_requests),
        "tokens": first.usage.tokens + (0 if second is None else second.usage.tokens),
        "conservative_charge_microunits": charged_microunits,
        "remaining_cny_microunits": remaining,
        "price": {**price_authority, "digest": content_digest(price_authority)},
        "checkout": audit.authority(),
        "durable": {"first": dict(first_durable), "second": None if second_durable is None else dict(second_durable)},
        "candidate_version_id": None,
        "case_id": None if triage is None else triage.case_id,
        "triage": None if triage is None else triage.disposition,
        "lesson_id": None,
    }
    _receipt(root, f"stop-{first.trial_id}.json", values)
    return values


async def run_stage(dependencies: StageDependencies | None = None) -> dict[str, Any]:
    """Prepare and automatically run the fixed approved bounded sample."""
    dependencies = dependencies or StageDependencies()
    environment = os.environ if dependencies.environment is None else dependencies.environment
    if not bool(environment.get("DEEPSEEK_API_KEY", "").strip()):
        return {"stop": "missing_credential", "model_requests": 0, "candidate_version_id": None}
    price = dependencies.price_snapshot or RECORDED_PRICE_SNAPSHOT
    _validate_price_snapshot(price)
    if dependencies.recovery_of_root is None or dependencies.recovery_1_root is None:
        raise StageError("recovery-2 requires both prior authorities")
    _host_readiness()
    recovery_of = [
        _validate_zero_paid_recovery(
            dependencies.recovery_of_root,
            expected_trial_id=RECOVERY_OF_TRIAL_ID,
            expected_authority_digest=ORIGINAL_AUTHORITY_DIGEST,
            require_stop_receipt=False,
        ),
    ]
    recovery_of.append(
        _validate_zero_paid_recovery(
            dependencies.recovery_1_root,
            expected_trial_id=RECOVERY_1_TRIAL_ID,
            expected_authority_digest=RECOVERY_1_AUTHORITY_DIGEST,
            require_stop_receipt=True,
            expected_stop_digest=RECOVERY_1_STOP_DIGEST,
            expected_recovery_of={
                "authority_path": recovery_of[0]["authority_path"],
                "authority_digest": recovery_of[0]["authority_digest"],
                "trial_id": RECOVERY_OF_TRIAL_ID,
            },
        )
    )
    audit = (dependencies.checkout_audit or audit_checkout_and_governance)()
    root = _initialize_stage_root(dependencies.stage_root)
    price_authority = price.authority()
    stage_authority = {
        "schema": "tianwen.alpha_c.real_evidence.stage_authority.v1",
        "checkout": audit.authority(),
        "price": {**price_authority, "digest": content_digest(price_authority)},
        "task_id": TASK_ID,
        "model_id": MODEL_ID,
        "budget": BUDGET.model_dump(mode="json"),
        "max_trials": 2,
        "candidate_version_id": None,
    }
    stage_authority["recovery_of"] = recovery_of
    _receipt(
        root,
        "stage-authority.json",
        stage_authority,
    )
    reserve = _micro_cny(BUDGET.tokens, price)
    if reserve * 2 > MAX_STAGE_CNY_MICROUNITS:
        raise StageError("fixed two-trial conservative charge exceeds Alpha-C budget")
    model = (dependencies.model_factory or _native_model)()
    _validate_model(model)
    runner = (dependencies.runner_factory or _native_runner)(model, root)
    try:
        first_prepared, first_authority = _prepare(runner, audit)
    except Exception as error:
        values = {
            "schema": "tianwen.alpha_c.real_evidence.preflight_stop.v1",
            "stop": "preflight_failure",
            "phase": "prepare",
            "failure_class": type(error).__name__,
            "model_requests": 0,
            "tokens": 0,
            "conservative_charge_microunits": 0,
            "remaining_cny_microunits": MAX_STAGE_CNY_MICROUNITS,
            "case_id": None,
            "lesson_id": None,
            "candidate_version_id": None,
        }
        _receipt(root, "stop-preflight.json", values)
        return values
    first_store, first_app = _runner_authority(runner)
    preflight_path = _receipt(
        root,
        f"preflight-{first_authority['trial_id']}.json",
        {
            "schema": "tianwen.alpha_c.real_evidence.preflight.v2",
            "trial_id": first_authority["trial_id"],
            "task_id": TASK_ID,
            "model_id": MODEL_ID,
            "condition_digest": first_authority["condition_digest"],
            "champion_version_id": first_authority["champion_version_id"],
            "champion_digest": first_authority["champion_digest"],
            "checkout": audit.authority(),
            "price": {**price.authority(), "digest": content_digest(price.authority())},
            "reserved_cny_microunits": reserve,
            "paid_execution_not_started": True,
        },
    )
    print(
        json.dumps(
            {
                "trial_id": first_authority["trial_id"],
                "task_id": TASK_ID,
                "model_id": MODEL_ID,
                "condition_digest": first_authority["condition_digest"],
                "champion_digest": first_authority["champion_digest"],
                "conservative_upper_bound_microunits": reserve,
                "preflight_receipt": str(preflight_path),
            },
            sort_keys=True,
        ),
        file=dependencies.stdout,
        flush=True,
    )
    confirmation = TrialConfirmation(
        trial_id=first_prepared.preview.trial_id,
        preview_digest=content_digest(first_prepared.preview),
        confirmed_via="approved_goal_budget",
    )
    first, first_durable = _load_result(first_store, first_app, await runner.execute(first_prepared, confirmation))
    first_charge = _result_charge(first, price)
    if not first.qualifies_as_real_model_trial:
        return _final_receipt(
            root,
            first,
            stop="non_real_or_operational",
            charged_microunits=first_charge,
            price=price,
            audit=audit,
            first_durable=first_durable,
        )
    intake = _intake(first_store, dependencies.intake_factory)
    if _qualifying_success(first):
        receipt = intake.triage((_project(intake, first, first_store),))
        return _final_receipt(
            root,
            first,
            stop="no_case_success",
            charged_microunits=first_charge,
            price=price,
            audit=audit,
            first_durable=first_durable,
            triage=receipt,
        )
    if not _qualifying_failure(first):
        return _final_receipt(
            root,
            first,
            stop="non_qualifying_result",
            charged_microunits=first_charge,
            price=price,
            audit=audit,
            first_durable=first_durable,
        )
    first_outcome = _project(intake, first, first_store)
    observe = intake.triage((first_outcome,))
    try:
        second_prepared, second_authority = _prepare(runner, audit)
    except Exception:
        return _final_receipt(
            root,
            first,
            stop="retry_preflight_failure",
            charged_microunits=first_charge,
            price=price,
            audit=audit,
            first_durable=first_durable,
            triage=observe,
        )
    second_store, second_app = _runner_authority(runner)
    comparable = (
        first_authority["condition"] == second_authority["condition"]
        and first_authority["champion_version_id"] == second_authority["champion_version_id"]
        and first_authority["champion_digest"] == second_authority["champion_digest"]
        and first_authority["trial_id"] != second_authority["trial_id"]
        and first_authority["workspace"] != second_authority["workspace"]
        and first_authority["store"] != second_authority["store"]
    )
    if not comparable:
        return _final_receipt(
            root,
            first,
            stop="retry_authority_drift",
            charged_microunits=first_charge,
            price=price,
            audit=audit,
            first_durable=first_durable,
            triage=observe,
        )
    _receipt(
        root,
        f"retry-{first.trial_id}-{second_authority['trial_id']}.json",
        {
            "schema": "tianwen.alpha_c.real_evidence.retry_authority.v1",
            "first_prepared": {
                "trial_id": first_authority["trial_id"],
                "condition_digest": first_authority["condition_digest"],
                "champion_version_id": first_authority["champion_version_id"],
                "champion_digest": first_authority["champion_digest"],
                "workspace": first_authority["workspace"],
                "store": first_authority["store"],
            },
            "second_prepared": {
                "trial_id": second_authority["trial_id"],
                "condition_digest": second_authority["condition_digest"],
                "champion_version_id": second_authority["champion_version_id"],
                "champion_digest": second_authority["champion_digest"],
                "workspace": second_authority["workspace"],
                "store": second_authority["store"],
            },
            "first_result_digest": first_durable["result_digest"],
            "reserved_cny_microunits": reserve,
        },
    )
    second_confirmation = TrialConfirmation(
        trial_id=second_prepared.preview.trial_id,
        preview_digest=content_digest(second_prepared.preview),
        confirmed_via="approved_goal_budget",
    )
    second, second_durable = _load_result(
        second_store, second_app, await runner.execute(second_prepared, second_confirmation)
    )
    if second.goal_id == first.goal_id or set(second.run_ids) & set(first.run_ids):
        raise StageError("repeat Goal or Run identity is not independent")
    charged = first_charge + _result_charge(second, price)
    if _qualifying_success(second):
        receipt = intake.triage((_project(intake, second, second_store),))
        return _final_receipt(
            root,
            first,
            second=second,
            stop="retry_success_observe",
            charged_microunits=charged,
            price=price,
            audit=audit,
            first_durable=first_durable,
            second_durable=second_durable,
            triage=receipt,
        )
    if not _qualifying_failure(second):
        return _final_receipt(
            root,
            first,
            second=second,
            stop="retry_non_qualifying",
            charged_microunits=charged,
            price=price,
            audit=audit,
            first_durable=first_durable,
            second_durable=second_durable,
            triage=observe,
        )
    second_outcome = _project(intake, second, second_store)
    if (
        second_outcome.capability_scope != first_outcome.capability_scope
        or second_outcome.problem_fingerprint != first_outcome.problem_fingerprint
    ):
        return _final_receipt(
            root,
            first,
            second=second,
            stop="retry_fingerprint_mismatch",
            charged_microunits=charged,
            price=price,
            audit=audit,
            first_durable=first_durable,
            second_durable=second_durable,
            triage=observe,
        )
    case = intake.triage((first_outcome, second_outcome))
    return _final_receipt(
        root,
        first,
        second=second,
        stop="case_requires_attribution",
        charged_microunits=charged,
        price=price,
        audit=audit,
        first_durable=first_durable,
        second_durable=second_durable,
        triage=case,
    )


def main() -> int:
    try:
        result = asyncio.run(run_stage())
    except StageError as error:
        print(f"Alpha-C real-evidence stop: {error}", file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 2 if result["stop"] in {"missing_credential", "preflight_failure"} else 0


if __name__ == "__main__":
    raise SystemExit(main())
