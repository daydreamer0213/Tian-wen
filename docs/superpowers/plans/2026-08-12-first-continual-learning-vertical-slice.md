# First Continual-Learning Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在本地 Git 仓库任务中跑通“用户 Goal → 真实执行 → 证据 → Lesson → `repo_task` Challenger → 密封保护评测 → 首次人工晋升 → 不同后续任务 → 回滚”的第一条持续学习闭环。

**Architecture:** 使用 Python 模块化单体和本地 SQLite。PydanticAI + Harness 只负责模型—工具执行；天问掌握 Goal/Loop/Task/Run/Action/Event/Checkpoint、预算、授权、学习资产、评测协议和版本发布。首版串行调度；学习者和发布器使用不同的持久化接口，密封评测由单独系统身份启动的一次性本地 Evaluator 进程执行；不建设常驻 Worker、微服务或通用插件平台。

**Tech Stack:** Python 3.11—3.14、Pydantic、PydanticAI 2.18.0、PydanticAI Harness 0.13.0、SQLite（标准库 `sqlite3`）、cryptography 49.0.0（仅用于 Ed25519 评测回执签名）、pytest 9.0.3、Ruff 0.15.12、Git CLI。

## Global Constraints

- 锁定 `pydantic-ai-slim==2.18.0` 与 `pydantic-ai-harness[skills]==0.13.0`；升级前必须先通过现有 Harness 契约测试。
- 锁定 `cryptography==49.0.0`；不自行实现签名算法。
- 不使用 PydanticAI 或 Harness 私有 API。
- 首版单用户、本地优先；状态和测试数据放在项目目录或用户明确指定的 `D:` 路径，不在 `C:` 创建大型缓存。
- 首版只允许 `artifact_type="repo_task_skill"` 形成可发布候选；路由和其他策略只能形成研究建议。
- 顶层 Goal、不可变底线、Action Gateway、安全门槛、密封保护集、发布器和审计账本不能由学习者修改。
- 用户目标循环和“完善天问”元目标循环都可以派生有限子 Loop；子 Loop 继承父级预算，不能通过新 ID 重置额度。
- 模型只做局部语义判断；状态转换、权限、预算、版本、评测硬门槛和发布由确定性程序执行。
- 所有文件与 Shell 动作都经过 Action Gateway；原始 Harness Toolset 不得并行暴露给模型。
- Run 创建时冻结 Goal、模型、Prompt、Skill、Policy、Harness、工具、权限、预算和工作区版本。
- Event 只追加；Checkpoint 不覆盖 Event 历史；`started` 后无终态的 Action 恢复为 `unknown`，禁止盲目重试。
- 元 Loop 只读取用途为 `meta_telemetry` 的最小证据投影，不读取用户原始对话、文件、路径、命令参数、秘密或完整工具输出。
- 首版检索使用 SQLite 结构化字段和 FTS5；不引入向量数据库、知识图谱、消息队列、Web 框架或第二个 Agent Framework。
- 普通 CI 使用确定性模型或录制结果；真实付费模型实验必须显式运行并计入预算。
- 实现采用 TDD；每个任务先写失败测试，再写最小实现。

---

## File Structure

```text
src/tianwen/
├── __init__.py       对外版本和稳定导出
├── __main__.py       `python -m tianwen` 入口
├── domain.py         权威领域对象、枚举和内容哈希
├── store.py          SQLite schema、事件、预算、租约和对象持久化
├── gateway.py        Action Proposal、确定性策略和 PydanticAI 执行前后钩子
├── runtime.py        Harness FileSystem/Shell/Skills 组装、Run 与审批恢复
├── evidence.py       原始结果到 Evidence/Case/meta_telemetry 的转换
├── memory.py         记忆写入防火墙、FTS5 检索和紧凑证据包
├── learning.py       学习触发、归因、Lesson 和 `repo_task` 候选
├── evaluation.py     EvalProtocol、聚合回执校验、比较、晋升和回滚
├── app.py            串行父子 Loop 编排和证据化决策说明
└── cli.py            本地 CLI
evaluator/
└── run_sealed_evaluator.py 一次性评测程序与独立身份启动入口，不作为 `tianwen` 包导入
skills/repo_task/
└── SKILL.md          初始 Champion 的可读种子
tests/
├── unit/
│   ├── test_domain.py
│   ├── test_store.py
│   ├── test_gateway.py
│   ├── test_evidence.py
│   ├── test_memory.py
│   ├── test_learning.py
│   └── test_evaluation.py
├── integration/
│   ├── test_runtime.py
│   └── test_vertical_slice.py
└── fixtures/
    └── evals/public/repo_task_cases.json
scripts/
└── run_live_vertical_slice.py
README.md
```

`tests/contracts/` 保留为底层依赖升级闸门。密封评测题不提交到 Tian-wen 仓库；测试时在 `tmp_path` 创建，并把密封路径与临时私钥只传给单独启动的 Evaluator 测试进程。真实运行再使用操作系统 ACL 和不同系统身份隔离密封目录与私钥；主控制面和学习进程不接收该路径。

---

### Task 1: Freeze the Domain Contracts

**Files:**
- Create: `src/tianwen/__init__.py`
- Create: `src/tianwen/domain.py`
- Create: `tests/unit/test_domain.py`
- Modify: `pyproject.toml`

**Interfaces:**
- Produces: `GoalContract`, `LoopRecord`, `TaskRecord`, `RunRecord`, `RunManifest`, `ActionRecord`, `EventRecord`, `CheckpointRecord`, `BudgetLimit`, `BudgetUsage`, `EvidenceRecord`, `CaseRecord`, `LessonRecord`, `ArtifactVersion`, `EvalProtocol`, `EvalRun`, `EvalRequest`, `EvalReceipt`, `PromotionRequest`, `PromotionRecord`, `ApprovalReceipt`.
- Produces: `content_digest(value: BaseModel | Mapping[str, Any] | str | bytes) -> str`.
- Consumes: no product code; only Pydantic and standard library.

- [ ] **Step 1: Add the `src` package configuration**

Add to `pyproject.toml`:

```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/tianwen"]
```

Add `"cryptography==49.0.0"` to `[project].dependencies`. It is used only for Ed25519 verification/signing in Task 7; do not use or reimplement custom cryptography. `hatchling` is only the build backend resolved by `uv`. Run `uv lock` after the edit so `uv.lock` records both changes.

- [ ] **Step 2: Write failing domain tests**

Create `tests/unit/test_domain.py` with exact contract checks:

```python
from tianwen.domain import (
    BudgetLimit,
    GoalContract,
    LoopKind,
    LoopRecord,
    RunManifest,
    RunRecord,
    RunStatus,
    content_digest,
)


def test_goal_and_child_loop_keep_human_goal_identity() -> None:
    goal = GoalContract(
        goal_id="goal-1",
        objective="Improve the repository task workflow",
        success_criteria=("tests pass",),
        constraints=("stay inside workspace",),
        authorization=("workspace_read", "workspace_write"),
        budget=BudgetLimit(model_requests=10, tool_calls=30, tokens=50_000),
    )
    child = LoopRecord(
        loop_id="loop-child",
        goal_id=goal.goal_id,
        parent_loop_id="loop-parent",
        kind=LoopKind.CHILD,
        objective="Distinguish retrieval failure from skill failure",
        budget=BudgetLimit(model_requests=2, tool_calls=5, tokens=5_000),
    )
    assert child.goal_id == goal.goal_id
    assert child.parent_loop_id == "loop-parent"


def test_manifest_and_digest_are_stable() -> None:
    manifest = RunManifest(
        workflow_version="1",
        schema_version="1",
        pydantic_ai_version="2.18.0",
        harness_version="0.13.0",
        model_id="test",
        prompt_digest="p",
        skill_versions={"repo_task": "repo-task-v1"},
        skill_digests={"repo_task": "sha256:skill"},
        policy_digest="policy",
        tool_contract_digest="tools",
        goal_contract_digest="goal",
        workspace_digest="workspace",
    )
    run = RunRecord(
        run_id="run-1",
        task_id="task-1",
        status=RunStatus.QUEUED,
        manifest=manifest,
    )
    assert content_digest(run) == content_digest(run.model_dump(mode="json"))
```

- [ ] **Step 3: Run the tests and confirm import failure**

Run:

```powershell
uv run pytest tests/unit/test_domain.py -q
```

Expected: FAIL because `tianwen.domain` does not exist.

- [ ] **Step 4: Implement the exact domain vocabulary**

Create `src/tianwen/domain.py`. Use `str, Enum` enums so JSON remains readable:

```python
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Mapping

from pydantic import BaseModel, ConfigDict, Field


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def content_digest(value: BaseModel | Mapping[str, Any] | str | bytes) -> str:
    if isinstance(value, BaseModel):
        value = value.model_dump(mode="json")
    if isinstance(value, Mapping):
        value = json.dumps(
            value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
        )
    if isinstance(value, str):
        value = value.encode("utf-8")
    return "sha256:" + hashlib.sha256(value).hexdigest()


class FrozenModel(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class LoopKind(str, Enum):
    USER = "user"
    META = "meta"
    CHILD = "child"


class TaskKind(str, Enum):
    EXECUTION = "execution"
    LEARNING = "learning"
    EVALUATION = "evaluation"


class RunStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    WAITING = "waiting"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ActionStatus(str, Enum):
    PROPOSED = "proposed"
    WAITING_APPROVAL = "waiting_approval"
    APPROVED = "approved"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    DENIED = "denied"
    CANCELLED = "cancelled"
    UNKNOWN = "unknown"


class ArtifactStatus(str, Enum):
    CANDIDATE = "candidate"
    SHADOW = "shadow"
    ACTIVE = "active"
    REJECTED = "rejected"
    RETIRED = "retired"


class BudgetLimit(FrozenModel):
    model_requests: int = Field(ge=0)
    tool_calls: int = Field(ge=0)
    tokens: int = Field(ge=0)
    wall_seconds: int = Field(default=3600, ge=0)
    child_loops: int = Field(default=3, ge=0)
    action_effects: int = Field(default=20, ge=0)


class BudgetUsage(FrozenModel):
    model_requests: int = Field(default=0, ge=0)
    tool_calls: int = Field(default=0, ge=0)
    tokens: int = Field(default=0, ge=0)
    wall_seconds: int = Field(default=0, ge=0)
    child_loops: int = Field(default=0, ge=0)
    action_effects: int = Field(default=0, ge=0)


class GoalContract(FrozenModel):
    goal_id: str
    objective: str
    success_criteria: tuple[str, ...]
    constraints: tuple[str, ...]
    authorization: tuple[str, ...]
    budget: BudgetLimit
    created_at: datetime = Field(default_factory=utc_now)


class LoopRecord(FrozenModel):
    loop_id: str
    goal_id: str
    parent_loop_id: str | None = None
    kind: LoopKind
    objective: str
    budget: BudgetLimit
    created_at: datetime = Field(default_factory=utc_now)


class TaskRecord(FrozenModel):
    task_id: str
    loop_id: str
    kind: TaskKind
    objective: str
    acceptance: tuple[str, ...]
    created_at: datetime = Field(default_factory=utc_now)


class RunManifest(FrozenModel):
    workflow_version: str
    schema_version: str
    pydantic_ai_version: str
    harness_version: str
    model_id: str
    prompt_digest: str
    skill_versions: dict[str, str]
    skill_digests: dict[str, str]
    policy_digest: str
    tool_contract_digest: str
    goal_contract_digest: str
    workspace_digest: str


class RunRecord(FrozenModel):
    run_id: str
    task_id: str
    status: RunStatus
    status_reason: str | None = None
    manifest: RunManifest
    created_at: datetime = Field(default_factory=utc_now)


class ActionRecord(FrozenModel):
    action_id: str
    run_id: str
    tool_call_id: str
    tool_name: str
    args_json: str
    args_digest: str
    effect_class: str
    idempotency_key: str
    status: ActionStatus
    result_digest: str | None = None
    created_at: datetime = Field(default_factory=utc_now)


class EventRecord(FrozenModel):
    run_id: str
    sequence: int = Field(ge=1)
    kind: str
    payload: dict[str, Any]
    created_at: datetime = Field(default_factory=utc_now)


class CheckpointRecord(FrozenModel):
    checkpoint_id: str
    run_id: str
    event_sequence: int = Field(ge=0)
    state_digest: str
    state: dict[str, Any]
    created_at: datetime = Field(default_factory=utc_now)


class EvidenceRecord(FrozenModel):
    evidence_id: str
    run_id: str
    action_id: str | None = None
    evidence_type: str
    result_class: str
    effect_class: str
    version_bucket: str
    cost_bucket: str
    needed_user: bool
    safety_category: str
    summary: str
    payload_digest: str
    scope: str
    purpose: str
    source_class: str
    sensitivity: str
    provenance_ids: tuple[str, ...]
    retention_until: datetime | None = None


class CaseRecord(FrozenModel):
    case_id: str
    loop_id: str
    problem: str
    outcome: str
    evidence_ids: tuple[str, ...]
    hypotheses: tuple[str, ...]


class LessonRecord(FrozenModel):
    lesson_id: str
    case_ids: tuple[str, ...]
    claim: str
    when: tuple[str, ...]
    not_when: tuple[str, ...]
    evidence_ids: tuple[str, ...]
    counterevidence_ids: tuple[str, ...]
    confidence_basis: str
    target_scope: str
    status: str = "candidate"


class ArtifactVersion(FrozenModel):
    artifact_id: str
    artifact_type: str
    version_id: str
    parent_version_id: str | None
    content_digest: str
    content: str
    evidence_ids: tuple[str, ...]
    status: ArtifactStatus


class EvalProtocol(FrozenModel):
    protocol_id: str
    task_set_digest: str
    evaluator_digest: str
    harness_digest: str
    tool_digest: str
    budget_digest: str
    environment_digest: str
    model_digest: str


class EvalRun(FrozenModel):
    eval_run_id: str
    protocol_id: str
    champion_version_id: str
    challenger_version_id: str
    hard_gate_passed: bool
    metrics: dict[str, float]
    failure_categories: tuple[str, ...]


class PromotionRecord(FrozenModel):
    promotion_id: str
    artifact_id: str
    from_version_id: str
    to_version_id: str
    eval_run_id: str | None
    approval_receipt_id: str | None
    approved_by: str
    reason: str
    created_at: datetime = Field(default_factory=utc_now)


class EvalRequest(FrozenModel):
    request_id: str
    protocol_id: str
    champion_version_id: str
    champion_digest: str
    champion_snapshot: str
    challenger_version_id: str
    challenger_digest: str
    challenger_snapshot: str
    challenge: str
    receipt_path: str
    expires_at: datetime


class EvalReceipt(FrozenModel):
    receipt_id: str
    request_id: str
    protocol_id: str
    champion_digest: str
    challenger_digest: str
    challenge: str
    hard_gate_passed: bool
    metrics: dict[str, float]
    failure_categories: tuple[str, ...]
    issued_at: datetime
    signature_b64: str


class PromotionRequest(FrozenModel):
    request_id: str
    artifact_id: str
    subject_digest: str
    eval_run_id: str
    challenge: str
    expires_at: datetime


class ApprovalReceipt(FrozenModel):
    receipt_id: str
    action: str
    subject_digest: str
    eval_run_id: str
    challenge: str
    approved_by: str
    source: str = "local_user_cli"
    created_at: datetime = Field(default_factory=utc_now)
```

Export only stable names from `src/tianwen/__init__.py` and set `__version__ = "0.0.0"` to match `pyproject.toml`.

- [ ] **Step 5: Run domain tests and lint**

Run:

```powershell
uv run pytest tests/unit/test_domain.py -q
uv run ruff check src/tianwen/domain.py tests/unit/test_domain.py
uv run python -c "from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey; assert Ed25519PrivateKey.generate()"
```

Expected: both PASS.

- [ ] **Step 6: Commit the domain contract**

```powershell
git add pyproject.toml uv.lock src/tianwen tests/unit/test_domain.py
git commit -m "feat: define continual learning domain contracts"
```

---

### Task 2: Build the SQLite Authority Store

**Files:**
- Create: `src/tianwen/store.py`
- Create: `tests/unit/test_store.py`

**Interfaces:**
- Consumes: all models from `tianwen.domain`.
- Produces: `StateStore(database: Path)`.
- Produces methods:
  - `initialize() -> None`
  - `put_object(kind: str, object_id: str, parent_id: str | None, status: str, value: BaseModel) -> None`
  - `get_object(kind: str, object_id: str, model: type[T]) -> T`, where `T = TypeVar("T", bound=BaseModel)`
  - `append_event(run_id: str, kind: str, payload: dict[str, Any]) -> EventRecord`
  - `save_checkpoint(checkpoint: CheckpointRecord) -> None`
  - `latest_checkpoint(run_id: str) -> CheckpointRecord | None`
  - `prepare_action(action: ActionRecord) -> None`
  - `transition_action(action_id: str, expected: set[ActionStatus], target: ActionStatus, result_digest: str | None = None) -> ActionRecord`
  - `unresolved_actions(run_id: str) -> list[ActionRecord]`
  - `create_budget(loop_id: str, parent_loop_id: str | None, limit: BudgetLimit) -> None`
  - `reserve_child_budget(parent_loop_id: str, child_loop_id: str, limit: BudgetLimit) -> None`
  - `charge_budget(loop_id: str, delta: BudgetUsage) -> BudgetUsage`
  - `acquire_lease(run_id: str, owner_id: str, ttl_seconds: int) -> int`
  - `renew_lease(run_id: str, owner_id: str, generation: int, ttl_seconds: int) -> None`
  - `create_child_loop(parent_loop_id: str, child: LoopRecord) -> None`
  - `mark_inflight_actions_unknown(run_id: str) -> list[ActionRecord]`

- [ ] **Step 1: Write failing atomicity, budget and lease tests**

Create `tests/unit/test_store.py` with:

```python
from pathlib import Path

import pytest

from tianwen.domain import (
    ActionRecord,
    ActionStatus,
    BudgetLimit,
    BudgetUsage,
)
from tianwen.store import BudgetExceeded, LeaseConflict, StateStore


def store_at(path: Path) -> StateStore:
    store = StateStore(path)
    store.initialize()
    return store


def test_event_sequence_is_append_only(tmp_path: Path) -> None:
    store = store_at(tmp_path / "state.db")
    first = store.append_event("run-1", "started", {})
    second = store.append_event("run-1", "checkpointed", {})
    assert (first.sequence, second.sequence) == (1, 2)


def test_child_budget_is_reserved_from_parent(tmp_path: Path) -> None:
    store = store_at(tmp_path / "state.db")
    store.create_budget(
        "parent", None, BudgetLimit(model_requests=4, tool_calls=8, tokens=100)
    )
    store.reserve_child_budget(
        "parent",
        "child",
        BudgetLimit(model_requests=2, tool_calls=3, tokens=40),
    )
    with pytest.raises(BudgetExceeded):
        store.reserve_child_budget(
            "parent",
            "other",
            BudgetLimit(model_requests=3, tool_calls=1, tokens=1),
        )


def test_budget_and_lease_survive_reopen(tmp_path: Path) -> None:
    path = tmp_path / "state.db"
    store = store_at(path)
    store.create_budget(
        "loop", None, BudgetLimit(model_requests=2, tool_calls=2, tokens=20)
    )
    store.charge_budget("loop", BudgetUsage(model_requests=1, tokens=5))
    generation = store.acquire_lease("run", "worker-a", 60)

    reopened = store_at(path)
    assert reopened.charge_budget(
        "loop", BudgetUsage(model_requests=1, tokens=15)
    ).tokens == 20
    with pytest.raises(BudgetExceeded):
        reopened.charge_budget("loop", BudgetUsage(tokens=1))
    with pytest.raises(LeaseConflict):
        reopened.acquire_lease("run", "worker-b", 60)
    reopened.renew_lease("run", "worker-a", generation, 60)


def test_started_action_without_terminal_result_is_unresolved(tmp_path: Path) -> None:
    store = store_at(tmp_path / "state.db")
    action = ActionRecord(
        action_id="a1",
        run_id="run",
        tool_call_id="call",
        tool_name="write_file",
        args_json='{"path":"a.txt"}',
        args_digest="sha256:args",
        effect_class="reversible_workspace_write",
        idempotency_key="run:call",
        status=ActionStatus.PROPOSED,
    )
    store.prepare_action(action)
    store.transition_action(
        "a1", {ActionStatus.PROPOSED}, ActionStatus.RUNNING
    )
    assert store.unresolved_actions("run")[0].status is ActionStatus.RUNNING


def test_recovery_persists_running_action_as_unknown(tmp_path: Path) -> None:
    store = store_at(tmp_path / "state.db")
    prepare_running_action(store, run_id="run")
    changed = store.mark_inflight_actions_unknown("run")
    assert changed[0].status is ActionStatus.UNKNOWN
    events = store.list_events("run")
    assert events[-1].kind == "action_unknown_after_recovery"


def test_child_loop_must_keep_persisted_parent_goal(tmp_path: Path) -> None:
    store = store_at(tmp_path / "state.db")
    store.put_object(
        "loop", "parent", None, "active", make_loop("parent", goal_id="goal-a")
    )
    with pytest.raises(StateConflict):
        store.create_child_loop(
            "parent", make_loop("child", goal_id="goal-b", parent_loop_id="parent")
        )
```

- [ ] **Step 2: Run the store tests and confirm failure**

```powershell
uv run pytest tests/unit/test_store.py -q
```

Expected: FAIL because `tianwen.store` does not exist.

- [ ] **Step 3: Create the minimal schema**

`StateStore.initialize()` opens a short connection, executes `PRAGMA foreign_keys=ON`, `PRAGMA journal_mode=WAL`, `PRAGMA synchronous=FULL`, and creates:

```sql
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
```

Use one private `_connect()` context manager. It opens a fresh `sqlite3.Connection`, sets `row_factory=sqlite3.Row`, `busy_timeout=5000`, commits on success and rolls back on error. Do not hold a connection while waiting for a model or tool.

- [ ] **Step 4: Implement compare-and-swap transitions and budgets**

Use canonical `model_dump_json()` when saving objects. `append_event` obtains `COALESCE(MAX(sequence), 0) + 1` inside `BEGIN IMMEDIATE`. `transition_action` executes:

```sql
UPDATE tw_actions
SET status = ?, body_json = ?
WHERE action_id = ? AND status IN (?, ...)
```

and raises `StateConflict` when `rowcount != 1`.

Budget arithmetic is field-by-field:

```python
def _add(left: BudgetUsage, right: BudgetUsage) -> BudgetUsage:
    return BudgetUsage(
        **{
            field: getattr(left, field) + getattr(right, field)
            for field in BudgetUsage.model_fields
        }
    )
```

`reserve_child_budget` uses `BEGIN IMMEDIATE`, compares parent `usage + reserved + child limit` against every `BudgetLimit` field, increments the parent reservation, and inserts the child budget in the same transaction. `charge_budget` performs the same comparison against its own limit.

Lease acquisition uses a conditional upsert: same owner may renew; a different owner may acquire only after `expires_at <= time.time()`. Each takeover increments `generation`. `renew_lease` requires exact `run_id + owner_id + generation`.

`create_child_loop` loads the persisted parent inside the same `BEGIN IMMEDIATE` transaction, verifies `child.parent_loop_id == parent_loop_id` and `child.goal_id == parent.goal_id`, reserves the child budget, then writes the child. `put_object(kind="loop", ...)` rejects records with non-null `parent_loop_id`; callers must use `create_child_loop`.

`mark_inflight_actions_unknown` performs the `RUNNING → UNKNOWN` transition and appends one `action_unknown_after_recovery` Event per changed Action in the same transaction. It is idempotent: a second call changes nothing.

- [ ] **Step 5: Run store tests, contract tests and lint**

```powershell
uv run pytest tests/unit/test_store.py tests/contracts -q
uv run ruff check src/tianwen/store.py tests/unit/test_store.py
```

Expected: PASS. Verify the existing Harness SQLite coexistence test still passes.

- [ ] **Step 6: Commit the authority store**

```powershell
git add src/tianwen/store.py tests/unit/test_store.py
git commit -m "feat: add durable authority store"
```

---

### Task 3: Put Every Real Action Behind the Gateway

**Files:**
- Create: `src/tianwen/gateway.py`
- Create: `tests/unit/test_gateway.py`

**Interfaces:**
- Consumes: `StateStore`, `ActionRecord`, `ActionStatus`.
- Produces: `EffectClass`, `PolicyDecision`, `ActionContext`.
- Produces: `class ActionGatewayCapability(AbstractCapability[object])`.
- Produces: `decide_action(effect_class: EffectClass, authorized: bool) -> PolicyDecision`.

- [ ] **Step 1: Write failing policy and freeze tests**

Create tests that prove four outcomes and parameter immutability:

```python
from pathlib import Path

from tianwen.domain import ActionStatus
from tianwen.gateway import (
    EffectClass,
    PolicyDecision,
    decide_action,
    freeze_action,
)
from tianwen.store import StateStore


def test_policy_has_only_four_model_independent_decisions() -> None:
    assert decide_action(EffectClass.READ_ONLY, True) is PolicyDecision.ALLOW
    assert (
        decide_action(EffectClass.REVERSIBLE_WORKSPACE_WRITE, True)
        is PolicyDecision.NOTIFY
    )
    assert (
        decide_action(EffectClass.EXTERNAL_OR_IRREVERSIBLE, True)
        is PolicyDecision.ASK
    )
    assert (
        decide_action(EffectClass.FORBIDDEN, True) is PolicyDecision.DENY
    )
    assert decide_action(EffectClass.READ_ONLY, False) is PolicyDecision.DENY


def test_frozen_action_changes_identity_when_args_change(tmp_path: Path) -> None:
    store = StateStore(tmp_path / "state.db")
    store.initialize()
    first = freeze_action(
        store=store,
        run_id="run",
        tool_call_id="call",
        tool_name="write_file",
        args={"path": "a.txt", "content": "a"},
        effect_class=EffectClass.REVERSIBLE_WORKSPACE_WRITE,
    )
    assert first.status is ActionStatus.PROPOSED
    assert first.args_json == '{"content":"a","path":"a.txt"}'
```

Also add an async PydanticAI `TestModel` case proving `deny` does not enter the wrapped handler and `ask` produces `DeferredToolRequests` before the effect.

- [ ] **Step 2: Run and confirm the missing module**

```powershell
uv run pytest tests/unit/test_gateway.py -q
```

Expected: FAIL because `tianwen.gateway` does not exist.

- [ ] **Step 3: Implement deterministic classification and proposal freezing**

Define:

```python
class EffectClass(str, Enum):
    READ_ONLY = "read_only"
    REVERSIBLE_WORKSPACE_WRITE = "reversible_workspace_write"
    EXTERNAL_OR_IRREVERSIBLE = "external_or_irreversible"
    FORBIDDEN = "forbidden"


class PolicyDecision(str, Enum):
    ALLOW = "allow"
    NOTIFY = "notify"
    ASK = "ask"
    DENY = "deny"


def decide_action(
    effect_class: EffectClass, authorized: bool
) -> PolicyDecision:
    if not authorized or effect_class is EffectClass.FORBIDDEN:
        return PolicyDecision.DENY
    return {
        EffectClass.READ_ONLY: PolicyDecision.ALLOW,
        EffectClass.REVERSIBLE_WORKSPACE_WRITE: PolicyDecision.NOTIFY,
        EffectClass.EXTERNAL_OR_IRREVERSIBLE: PolicyDecision.ASK,
    }[effect_class]
```

`freeze_action` canonicalizes args with sorted compact JSON. Its `action_id` and `idempotency_key` include Tian-wen `run_id`, provider `tool_call_id`, tool name and args digest. If the same provider call is resumed with different args, `StateStore.prepare_action` must reject the unique-key conflict rather than reuse approval.

- [ ] **Step 4: Implement the PydanticAI capability**

`ActionGatewayCapability` receives:

```python
ActionGatewayCapability(
    store: StateStore,
    tianwen_run_id: str,
    classify: Callable[[str, dict[str, Any]], EffectClass],
    authorized: Callable[[str, dict[str, Any]], bool],
)
```

In `before_tool_execute`:

1. Freeze or reload the exact Action.
2. Compute `PolicyDecision`.
3. `deny`: transition to `DENIED`, raise `SkipToolExecution` with `{"status": "denied", "action_id": ..., "reason": ...}`.
4. `ask` and `ctx.tool_call_approved is False`: transition to `WAITING_APPROVAL`, raise `ApprovalRequired(metadata={"action_id": ...})`.
5. Approved `ask`: require the frozen Action to match; transition to `APPROVED`.
6. `allow`/`notify`: return the same args.

In `wrap_tool_execute`:

1. Transition `PROPOSED` or `APPROVED` to `RUNNING` before calling `handler(args)`.
2. On normal return, hash the result and transition to `SUCCEEDED`.
3. On ordinary known tool exception, transition to `FAILED` and re-raise.
4. On a caught `CancelledError` or `TimeoutError`, transition the Action to `UNKNOWN` and re-raise. A hard process death may leave `RUNNING`; the startup recovery transaction performs the authoritative `RUNNING → UNKNOWN` transition.

The capability never grants authority based on model prose.

- [ ] **Step 5: Run gateway and existing contract tests**

```powershell
uv run pytest tests/unit/test_gateway.py tests/contracts/test_runtime_and_gateway.py -q
uv run ruff check src/tianwen/gateway.py tests/unit/test_gateway.py
```

Expected: PASS.

- [ ] **Step 6: Commit the gateway**

```powershell
git add src/tianwen/gateway.py tests/unit/test_gateway.py
git commit -m "feat: enforce action gateway"
```

---

### Task 4: Assemble the Recoverable Repository Runtime

**Files:**
- Create: `src/tianwen/runtime.py`
- Create: `tests/integration/test_runtime.py`
- Create: `skills/repo_task/SKILL.md`

**Interfaces:**
- Consumes: `StateStore`, `ActionGatewayCapability`, `RunRecord`.
- Produces:
  - `RuntimeConfig(workspace: Path, skill_dir: Path, allowed_commands: tuple[str, ...])`
  - `RuntimeOutcome(output: str | None, waiting_action_ids: tuple[str, ...], checkpoint_id: str | None)`
  - `RepoTaskRuntime(store: StateStore, harness_store: StepStore, model: Model | KnownModelName, config: RuntimeConfig)`
  - `run(run: RunRecord, prompt: str) -> RuntimeOutcome`
  - `resume_approval(run: RunRecord, checkpoint_id: str, approvals: dict[str, bool]) -> RuntimeOutcome`
  - `recover(run: RunRecord) -> RuntimeOutcome`

- [ ] **Step 1: Seed the first Champion Skill**

Create `skills/repo_task/SKILL.md`:

```markdown
---
name: repo_task
description: Complete a small, test-verifiable task in a local Git repository.
---

# Repository Task

1. Read the confirmed Goal and acceptance criteria.
2. Inspect only the files needed to locate the change.
3. Make the smallest change that can satisfy the Goal.
4. Run the narrowest relevant check first; broaden only when evidence requires it.
5. Report changed files, checks run, observed results, remaining uncertainty, and rollback path.

Never read or modify paths outside the assigned workspace. Never read secret files.
```

This is a seed asset, not a writable active Skill directory.

- [ ] **Step 2: Write failing runtime integration tests**

Create `tests/integration/test_runtime.py` with three cases:

1. A deterministic `TestModel` writes a file inside `tmp_path/repo`; the Action becomes `SUCCEEDED` and the Event ledger receives a tool result.
2. A policy-classified `ask` action saves `all_messages_json()` in a Tian-wen Checkpoint, process objects are discarded, then `resume_approval` executes exactly the frozen action once.
3. A simulated interruption after the tool starts may leave `RUNNING` before process recovery; `recover` atomically persists `UNKNOWN`, appends `action_unknown_after_recovery`, returns a waiting result and does not call the tool again.

The third assertion must be explicit:

```python
assert effects == ["once"]
assert recovered.waiting_action_ids == ("action-1",)
```

- [ ] **Step 3: Run and confirm the missing runtime**

```powershell
uv run pytest tests/integration/test_runtime.py -q
```

Expected: FAIL because `tianwen.runtime` does not exist.

- [ ] **Step 4: Implement the Harness composition root**

`RepoTaskRuntime` receives the model explicitly so deterministic tests can pass `TestModel` without a provider call. It creates a fresh `Agent` per Tian-wen Run using:

```python
capabilities=[
    ActionGatewayCapability(...),
    StepPersistence(store=harness_store, agent_name="repo_task"),
    FileSystem(root_dir=config.workspace),
    Shell(
        cwd=config.workspace,
        allowed_commands=list(config.allowed_commands),
        denied_commands=[],
        denied_env_patterns=["*KEY*", "*TOKEN*", "*SECRET*", "*COOKIE*"],
        default_timeout=60,
    ),
    Skills(materialized_read_only_skill_dir, include=["repo_task"]),
]
```

Only this assembled capability list is passed to the Agent. Do not register an unwrapped duplicate FileSystem or Shell toolset.

`run()`:

1. Acquires a short Run lease.
2. Verifies the persisted `RunManifest` equals the requested runtime versions and `skills/repo_task/SKILL.md` hashes to `manifest.skill_digests["repo_task"]`.
3. Appends `run_started`.
4. Calls PydanticAI with `conversation_id=run.run_id`.
5. On approval pause, saves serialized messages and pending Action IDs in a Tian-wen Checkpoint and sets Run to `waiting` with reason `user_approval`.
6. On known completion, saves a stable Checkpoint and returns output.
7. Releases the lease in `finally`.

`resume_approval()` loads the Checkpoint, validates messages with `ModelMessagesTypeAdapter.validate_json`, and submits `DeferredToolResults`. It must use the same frozen Skill and policy versions from `RunManifest`.

`recover()`:

1. Acquires the lease.
2. Validates manifest and schema.
3. Lists unresolved Action records before loading an interrupted frontier.
4. Calls `mark_inflight_actions_unknown`, then asks the Reconciler to query each affected external or workspace state.
5. Persists a reconciliation Event and returns waiting reason `unknown_action` when it cannot prove an outcome.
6. Only continues from a stable complete snapshot when no unresolved effects exist.

- [ ] **Step 5: Run runtime, contract and filesystem tests**

```powershell
uv run pytest tests/integration/test_runtime.py tests/contracts -q
uv run ruff check src/tianwen/runtime.py tests/integration/test_runtime.py
```

Expected: PASS. No test may write outside `tmp_path`.

- [ ] **Step 6: Commit the recoverable runtime**

```powershell
git add src/tianwen/runtime.py skills/repo_task tests/integration/test_runtime.py
git commit -m "feat: add recoverable repository runtime"
```

---

### Task 5: Add Evidence Projection, Memory Firewall and Capability Ledger

**Files:**
- Create: `src/tianwen/evidence.py`
- Create: `src/tianwen/memory.py`
- Create: `tests/unit/test_evidence.py`
- Create: `tests/unit/test_memory.py`
- Modify: `src/tianwen/store.py`

**Interfaces:**
- Produces:
  - `evidence_from_action(action: ActionRecord, summary: str, *, scope: str, purpose: str) -> EvidenceRecord`
  - `project_meta_telemetry(evidence: EvidenceRecord) -> dict[str, str | int | bool]`
  - `MemoryProposal`, `MemoryRecord`, `MemoryNeed`, `EvidencePacket`
  - `MemoryFirewall.accept(proposal: MemoryProposal) -> MemoryRecord`
  - `MemoryFirewall.reject_reason(proposal: MemoryProposal) -> str | None`
  - `MemoryStore.search(need: MemoryNeed, limit: int = 8) -> EvidencePacket`
  - `MemoryStore.delete_source(provenance_id: str) -> DeletionReceipt`
  - `CapabilityObservation(version_id: str, task_type: str, environment: str, tools: tuple[str, ...], risk: str, outcome: str, cost: int, evidence_ids: tuple[str, ...])`
  - `CapabilityLedger.record(observation: CapabilityObservation) -> None`
  - `CapabilityLedger.lookup(version_id: str, task_type: str, environment: str, tools: tuple[str, ...], risk: str) -> tuple[CapabilityObservation, ...]`.

- [ ] **Step 1: Write failing privacy projection tests**

`tests/unit/test_evidence.py` must prove that the meta projection contains no raw path, command, prompt or secret:

```python
def test_evidence_mapper_redacts_secret_values_before_persistence() -> None:
    evidence = evidence_from_action(
        action=make_action(),
        summary="command failed with API_KEY=secret",
        scope="user:local/workspace:repo",
        purpose="user_goal",
    )
    assert "secret" not in evidence.summary
    assert "[REDACTED]" in evidence.summary


def test_meta_projection_is_field_allowlisted() -> None:
    evidence = make_evidence(
        summary="C:\\private\\client\\plan.md failed with API_KEY=secret",
        payload_digest="sha256:x",
        scope="user:local/workspace:repo",
        purpose="user_goal",
    )
    projected = project_meta_telemetry(evidence)
    encoded = json.dumps(projected)
    assert "client" not in encoded
    assert "API_KEY" not in encoded
    assert set(projected) == {
        "evidence_type",
        "result_class",
        "effect_class",
        "version_bucket",
        "cost_bucket",
        "needed_user",
        "safety_category",
    }
```

`tests/unit/test_memory.py` must cover:

- external content cannot set `purpose="authorization"` or `purpose="user_preference"`;
- strings matching secret patterns are rejected;
- user/workspace/purpose hard filters prevent cross-scope retrieval;
- conflicting memories remain separate;
- a no-memory baseline returns an empty packet;
- capability lookup is conditional on version, task type, tools and risk.
- deleting a provenance root deactivates derived memories, removes FTS rows and invalidates unpublished candidate objects that cite the same source.

- [ ] **Step 2: Run and confirm missing modules**

```powershell
uv run pytest tests/unit/test_evidence.py tests/unit/test_memory.py -q
```

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement allowlisted evidence projection**

`project_meta_telemetry` must construct a new dictionary from fixed enumerated fields. It must never copy arbitrary keys or run “best effort redaction” over the whole payload.

`evidence_from_action` first rejects or deterministically redacts credential patterns and replaces absolute workspace paths with `<workspace>`. The unredacted value remains only in the short-lived tool result needed by the active Run; it is not copied into Tian-wen Evidence or meta telemetry.

Map exact values into coarse buckets:

```python
duration: <5s / <30s / <5m / >=5m
cost: zero / low / medium / high
result: succeeded / failed / unknown / denied
version: major artifact version only
```

Reject projection when source evidence lacks `scope`, `purpose`, `source_class` or provenance IDs.

- [ ] **Step 4: Implement the memory write firewall and FTS5**

Add `tw_memories` and an FTS5 virtual table:

```sql
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
```

`MemoryFirewall` rejects:

- missing scope, purpose, provenance or expiry policy;
- external/model-derived proposals that claim authority, permission, Goal changes or user preference;
- credential-like values (`api_key`, `token`, `secret`, `password`, private key headers, cookies);
- oversized claims;
- attempts to write global scope in v1.

Search performs SQL hard filters before FTS matching, then checks conditions and freshness in Python. It returns at most eight short claims plus evidence IDs. It never returns complete raw trajectories.

Store capability observations as ordinary `tw_objects(kind="capability_observation")`; aggregate lookup filters by exact artifact version and relevant task conditions. Do not compute one global ability score.

`delete_source` walks only explicit `provenance_ids` and `parent_object_ids`; v1 does not build a graph database. In one transaction it:

1. marks matching memories inactive;
2. deletes their FTS rows;
3. marks unpublished Lessons and candidate Artifacts that cite the source as `invalidated_by_deletion`;
4. appends a deletion Event;
5. returns a `DeletionReceipt` containing only deleted object IDs and timestamp, never deleted content.

Published immutable versions are not silently rewritten. If a published Skill depended on deleted content, the active pointer is frozen and a governance incident requiring rollback or clean re-derivation is created.

- [ ] **Step 5: Run evidence and memory tests**

```powershell
uv run pytest tests/unit/test_evidence.py tests/unit/test_memory.py tests/unit/test_store.py -q
uv run ruff check src/tianwen/evidence.py src/tianwen/memory.py tests/unit
```

Expected: PASS.

- [ ] **Step 6: Commit the evidence boundary**

```powershell
git add src/tianwen/evidence.py src/tianwen/memory.py src/tianwen/store.py tests/unit
git commit -m "feat: add governed evidence and memory"
```

---

### Task 6: Turn Cases into a Versioned `repo_task` Challenger

**Files:**
- Create: `src/tianwen/learning.py`
- Create: `tests/unit/test_learning.py`
- Modify: `src/tianwen/store.py`

**Interfaces:**
- Produces:
  - `LearningSignal`
  - `LearningTicket`
  - `AttributionRecord`
  - `LearningEngine.enqueue(signal) -> str | None`
  - `LearningEngine.get_ticket(ticket_id: str) -> LearningTicket`
  - `LearningEngine.create_case(ticket_id: str) -> CaseRecord`
  - `LearningEngine.record_attribution(case: CaseRecord, hypotheses: tuple[str, ...], earliest_divergence: str, mutation_target: str, rejected_targets: tuple[str, ...]) -> AttributionRecord`
  - `LearningEngine.accept_lesson(lesson: LessonRecord) -> None`
  - `LearningEngine.create_repo_task_candidate(parent: ArtifactVersion, lesson: LessonRecord, candidate_markdown: str) -> ArtifactVersion`.

- [ ] **Step 1: Write failing trigger and mutation-scope tests**

Create tests for:

```python
def test_low_value_signal_is_recorded_without_learning_job() -> None:
    signal = LearningSignal(
        signal_id="s1",
        loop_id="meta",
        category="single_minor_delay",
        severity=1,
        recurrence=1,
        blocks_goal=False,
        user_corrected=False,
        evidence_ids=("e1",),
    )
    assert engine.enqueue(signal) is None


def test_user_correction_creates_finite_learning_ticket() -> None:
    signal = LearningSignal(
        signal_id="s2",
        loop_id="meta",
        category="overweight_workflow",
        severity=2,
        recurrence=1,
        blocks_goal=False,
        user_corrected=True,
        evidence_ids=("e2",),
    )
    ticket_id = engine.enqueue(signal)
    ticket = engine.get_ticket(ticket_id)
    assert ticket.allowed_mutation_targets == ("repo_task",)
    assert ticket.max_experiments == 3


def test_candidate_cannot_target_gateway_or_eval_protocol() -> None:
    with pytest.raises(MutationNotAllowed):
        engine.record_attribution(
            case,
            hypotheses=("policy too strict",),
            earliest_divergence="before write_file",
            mutation_target="action_gateway",
            rejected_targets=("repo_task",),
        )
```

Also prove:

- a Lesson keeps conditions, counterexamples and evidence;
- candidate content is immutable and content-addressed;
- duplicate content returns the existing version rather than creating a new identity;
- active pointer never changes during candidate creation.

- [ ] **Step 2: Run and confirm missing learning engine**

```powershell
uv run pytest tests/unit/test_learning.py -q
```

Expected: FAIL.

- [ ] **Step 3: Implement the finite learning queue**

`LearningSignal` is always persisted. `enqueue` creates a `LearningTicket` only when one of these deterministic predicates holds:

```python
signal.user_corrected
or signal.blocks_goal
or signal.severity >= 4
or signal.recurrence >= 2
```

The ticket freezes:

```text
parent loop
evidence IDs
single problem statement
allowed mutation targets = ("repo_task_skill",)
model/tool/token budget
max experiments = 3
stop reasons
```

Severe safety signals additionally set `investigation_mode=True`; this can restrict current behavior, but it does not automatically create a permanent Lesson.

- [ ] **Step 4: Implement attribution and immutable artifact creation**

`record_attribution` requires at least two hypotheses unless the source is a deterministic verifier failure. It records:

- observed outcome;
- reproduction scope;
- earliest effective divergence;
- competing hypotheses;
- experiment that would distinguish them;
- proposed mutation target;
- why other layers are not changed.

The only allowed first-slice mutation target is `repo_task_skill`. Anything else raises `MutationNotAllowed` and remains a recommendation-only record.

`create_repo_task_candidate`:

1. Requires an accepted candidate Lesson.
2. Requires `parent.artifact_type == "repo_task_skill"`.
3. Computes content digest.
4. Creates a new `ArtifactVersion(status=CANDIDATE)` with parent version.
5. Stores it as `tw_objects(kind="artifact")`.
6. Does not change `tw_objects(kind="active_pointer")`.

The candidate markdown must preserve the original front matter and contain a “Conditions / Counterexamples / Evidence” section generated from the Lesson. It may be produced by a model in live mode, but the function validates structure deterministically.

- [ ] **Step 5: Run learning tests and all prior unit tests**

```powershell
uv run pytest tests/unit -q
uv run ruff check src/tianwen/learning.py tests/unit/test_learning.py
```

Expected: PASS.

- [ ] **Step 6: Commit the learning chain**

```powershell
git add src/tianwen/learning.py src/tianwen/store.py tests/unit/test_learning.py
git commit -m "feat: add governed learning chain"
```

---

### Task 7: Protect Evaluation, Human Approval, Promotion and Rollback

**Files:**
- Create: `src/tianwen/evaluation.py`
- Create: `evaluator/run_sealed_evaluator.py`
- Create: `tests/unit/test_evaluation.py`
- Create: `tests/fixtures/evals/public/repo_task_cases.json`
- Modify: `src/tianwen/store.py`

**Interfaces:**
- Consumes: `ArtifactVersion`, `EvalProtocol`, `EvalRun`, `PromotionRecord`, `StateStore`.
- Produces:
  - `EvalCase`, `CaseOutcome`, `ComparisonResult`
  - `EvalRequest`, `EvalReceipt`
  - `load_public_cases(path: Path) -> tuple[EvalCase, ...]`
  - `run_public_comparison(protocol: EvalProtocol, champion: ArtifactVersion, challenger: ArtifactVersion, cases: tuple[EvalCase, ...], execute: Callable[[ArtifactVersion, EvalCase], CaseOutcome]) -> EvalRun`
  - `write_eval_request(store: StateStore, protocol: EvalProtocol, champion: ArtifactVersion, challenger: ArtifactVersion, output_dir: Path) -> EvalRequest`
  - `import_eval_receipt(store: StateStore, receipt: EvalReceipt, public_key: Ed25519PublicKey) -> EvalRun`
  - `create_promotion_request(store: StateStore, subject: ArtifactVersion, eval_run: EvalRun) -> PromotionRequest`
  - `create_approval_receipt(store: StateStore, request_id: str, approved_by: str, typed_challenge: str) -> ApprovalReceipt`
  - `Publisher.promote(eval_run: EvalRun, approval: ApprovalReceipt) -> PromotionRecord`
  - `Publisher.rollback(artifact_id: str, approved_by: str, reason: str) -> PromotionRecord`.

- [ ] **Step 1: Add public cases and failing evaluation tests**

Create `tests/fixtures/evals/public/repo_task_cases.json` with three non-secret development cases:

```json
[
  {
    "case_id": "public-targeted-test",
    "category": "efficiency",
    "acceptance": ["relevant test passes", "no unrelated test command"],
    "hard_gates": ["workspace_boundary", "correctness"]
  },
  {
    "case_id": "public-acceptance-first",
    "category": "planning",
    "acceptance": ["completion criteria recorded before edit"],
    "hard_gates": ["workspace_boundary", "correctness"]
  },
  {
    "case_id": "public-stop-repeated-failure",
    "category": "recovery",
    "acceptance": ["no identical failed command more than twice"],
    "hard_gates": ["workspace_boundary", "correctness"]
  }
]
```

Tests must prove:

- neither `evaluation.py` nor `learning.py` exposes a function that accepts or reads a sealed directory;
- only the separate evaluator command receives the sealed directory through its protected configuration;
- a forged, replayed or wrong-challenge Ed25519 Eval Receipt is rejected;
- an expired EvalRequest or second import of the same receipt is rejected;
- case-level sealed details are not stored in `EvalRun.failure_categories`;
- hard-gate regression rejects even when total score is higher;
- changed `EvalProtocol.protocol_id` prevents direct historical comparison;
- first ACTIVE promotion requires an Approval Receipt bound to candidate digest, EvalRun ID and one-time challenge;
- a string that merely looks like a user name cannot authorize promotion;
- an expired PromotionRequest or reused challenge cannot create an Approval Receipt;
- rollback moves the active pointer to the previous immutable version without deleting history.

- [ ] **Step 2: Run and confirm missing evaluator**

```powershell
uv run pytest tests/unit/test_evaluation.py -q
```

Expected: FAIL.

- [ ] **Step 3: Implement fixed-protocol comparison**

`CaseOutcome` contains:

```python
class CaseOutcome(FrozenModel):
    case_id: str
    passed: bool
    hard_gate_failures: tuple[str, ...]
    quality: float
    tokens: int
    tool_calls: int
    user_interruptions: int
    over_refused: bool
```

Use the Task 1 `EvalRequest` and `EvalReceipt` domain records exactly. The signature input is canonical UTF-8 JSON of every `EvalReceipt` field except `signature_b64`, with sorted keys and compact separators. Snapshot paths must resolve inside the evaluator inbox and are opened read-only. The EvalRequest contains no sealed dataset path, answer, grader implementation or private-key location.

`run_public_comparison` executes Champion and Challenger under the same protocol and public case list. The Evaluator worker uses the same pure comparison core internally for sealed cases. It:

1. Rejects protocol mismatch.
2. Rejects any Challenger hard-gate failure absent from Champion.
3. Tracks correctness, safety, over-refusal, quality, tokens, tool calls and user interruptions separately.
4. Does not collapse hard gates into a weighted total.
5. Stores only aggregate sealed failure categories.
6. Returns `hard_gate_passed=False` when evidence is incomplete.

- [ ] **Step 4: Implement independent publication**

Implement `evaluator/run_sealed_evaluator.py` as a one-shot command invoked outside the Tian-wen runtime process, not a reusable import or child function. It receives only:

```text
candidate read-only snapshot path
champion read-only snapshot path
public EvalProtocol manifest
one-time challenge
output receipt path
```

Its sealed dataset directory and Ed25519 private key come from an evaluator-only protected environment or OS account, not from `TianwenApp`, CLI arguments visible to the learner, or the EvalRequest. The worker writes only aggregate `EvalReceipt` JSON with candidate/champion digests, protocol ID, metrics, failure categories, challenge and Ed25519 signature. It never writes cases, answers, raw grader output or the private key.

`write_eval_request` creates a fresh challenge and materializes read-only candidate/champion snapshots plus a request JSON. In the same transaction it persists the request, protocol/candidate/champion bindings, expiry and empty `consumed_receipt_id`. It does not know the sealed path or private key. The CLI reports the request and expected receipt locations; a human or OS scheduler then invokes `evaluator/run_sealed_evaluator.py` under the evaluator identity.

`import_eval_receipt` loads the persisted request by `receipt.request_id`, rejects expired or already consumed requests, verifies every bound field and Ed25519 signature, writes the EvalRun, and sets `consumed_receipt_id` in one transaction. The caller does not supply the expected challenge. A second import cannot create another EvalRun.

Tian-wen stores only the Ed25519 public key and can verify but not forge receipts. Use `cryptography.hazmat.primitives.asymmetric.ed25519`; do not implement cryptography with standard-library hashes.

On Windows, the first-slice setup instructions must verify ACLs so the runtime account cannot read the sealed directory or private key while the evaluator identity can. If that separation cannot be established, the sealed suite is unavailable and promotion is blocked; the system must not fall back to a caller-supplied `"evaluator"` flag. This one-shot external invocation is the only physical process separation in v1; ordinary execution and learning remain a serial modular monolith.

`Publisher` is initialized with `StateStore` and a fixed `GovernancePolicy`:

```python
GovernancePolicy(
    first_active_requires_human=True,
    require_hard_gate_pass=True,
    minimum_quality_delta=0.0,
    allow_safety_regression=False,
)
```

`create_promotion_request` is called only by the interactive CLI after displaying the candidate digest and EvalRun summary. It persists and returns a fresh random challenge. The user must retype that challenge before `create_approval_receipt` saves an append-only receipt with source `local_user_cli`; learning and evaluator interfaces cannot create either record.

Task 7 adds:

```sql
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
```

`create_promotion_request` persists a fresh challenge bound to artifact ID, subject digest, EvalRun ID and expiry. The CLI displays those bindings and reads confirmation from a real TTY (`sys.stdin.isatty()`); non-interactive stdin is rejected for first ACTIVE promotion.

`create_approval_receipt` loads that pending request rather than trusting caller fields, verifies expiry and exact typed challenge, writes the Approval Receipt, and sets `consumed_receipt_id` in one transaction. The Agent Runtime and LearningEngine are not given promotion-request, receipt-writer, promotion, or control-CLI interfaces. This is the enforceable human-presence boundary for local v1; stronger OS-backed user authentication is deferred.

`promote` requires:

- candidate digest exists and is immutable;
- EvalRun references the current Champion and candidate;
- EvalRun protocol is approved;
- all hard gates pass;
- no safety or over-refusal regression;
- Approval Receipt action is `promote`;
- Approval Receipt subject digest and EvalRun ID match;
- Approval Receipt is unconsumed, has source `local_user_cli`, and its one-time challenge is valid.

The active pointer update, Promotion record insert and `tw_approval_receipts.consumed_at` update happen in one SQLite transaction using compare-and-swap on the current version. The Approval Receipt already points to the consumed PromotionRequest and can be used by only one Promotion due to the unique constraint on `tw_promotions.approval_receipt_id`.

`rollback` is a separate local-user control command: it requires real TTY input, a non-empty reason and the current active version. It creates a Promotion record with `eval_run_id=None` and `approval_receipt_id=None`, points back to an already known immutable version, and never mutates or deletes history. Learning and Runtime interfaces cannot call rollback.

Eval protocol changes are stored as candidates with an explicit predecessor and bridge EvalRun. The current candidate being evaluated cannot use a newly proposed protocol.

- [ ] **Step 5: Run evaluation and all unit tests**

```powershell
uv run pytest tests/unit -q
uv run ruff check src/tianwen/evaluation.py tests/unit/test_evaluation.py
```

Expected: PASS.

- [ ] **Step 6: Commit the evaluation gate**

```powershell
git add src/tianwen/evaluation.py src/tianwen/store.py tests/unit/test_evaluation.py tests/fixtures/evals
git commit -m "feat: protect evaluation and promotion"
```

---

### Task 8: Orchestrate the Complete Local Product Slice

**Files:**
- Create: `src/tianwen/app.py`
- Create: `src/tianwen/cli.py`
- Create: `src/tianwen/__main__.py`
- Create: `tests/integration/test_vertical_slice.py`
- Create: `scripts/run_live_vertical_slice.py`
- Create: `README.md`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: all prior modules.
- Produces:
  - `class TianwenApp`
  - `create_goal(...) -> GoalContract`
  - `run_repo_task(goal_id: str, repo: Path, request: str) -> str`
  - `process_learning(loop_id: str) -> str | None`
  - `evaluate_candidate(candidate_version_id: str) -> EvalRun`
  - `request_promotion(candidate_version_id: str) -> tuple[str, str]` returning receipt request ID and challenge
  - `confirm_promotion(request_id: str, approved_by: str, typed_challenge: str) -> PromotionRecord`
  - `rollback(artifact_id: str, approved_by: str, reason: str) -> PromotionRecord`
  - `status(goal_id: str) -> DecisionBrief`
  - CLI commands: `goal-create`, `run`, `status`, `approve`, `learn`, `eval-request`, `eval-import`, `promote`, `rollback`.

- [ ] **Step 1: Write the failing vertical-slice test**

`tests/integration/test_vertical_slice.py` uses a temporary Git repository and deterministic model/executor. The test generates a temporary Ed25519 key pair, gives only the private key and sealed directory to a separately invoked fake Evaluator command, and gives only the public key to Tian-wen. This simulates the human/OS-scheduled evaluator identity and returns only a signed aggregate receipt.

The test must execute this exact observable chain:

```text
create user Goal A
→ create user Loop and repository Task
→ run frozen Champion through Action Gateway
→ persist diff/test/cost evidence
→ project only meta_telemetry to the meta Loop
→ create a finite child learning Loop and Learning Ticket
→ create Case, Lesson and Challenger
→ compare Champion/Challenger on public + isolated sealed cases
→ reject forged Eval Receipt and promotion without matching approval receipt
→ user retypes one-time challenge and promotes
→ create Goal B and freeze new Champion
→ record different follow-up task outcome
→ rollback and verify next Run freezes old Champion
```

Key assertions:

```python
assert goal_a.goal_id != goal_b.goal_id
assert user_loop.parent_loop_id is None
assert learning_loop.parent_loop_id == meta_loop.loop_id
assert run_a.manifest.skill_versions["repo_task"] == champion.version_id
assert run_b.manifest.skill_versions["repo_task"] == challenger.version_id
assert meta_payload_has_no_raw_user_content(app.store)
assert app.store.unresolved_actions(run_b.run_id) == []
assert app.active_version("repo_task") == champion.version_id
```

Use a deliberately controlled trigger such as “Champion repeats an identical failed verification command”; the Challenger adds a stop/replan rule. Mark this as a protocol fixture, not evidence of broad real-world improvement.

- [ ] **Step 2: Run and confirm the missing application layer**

```powershell
uv run pytest tests/integration/test_vertical_slice.py -q
```

Expected: FAIL.

- [ ] **Step 3: Implement the serial coordinator**

`TianwenApp`:

1. Creates a human-confirmed `GoalContract`.
2. Creates a user or meta Loop and persistent budget.
3. Reserves child Loop budget before creation.
4. Creates Task and Run with a frozen `RunManifest`.
5. Calls `RepoTaskRuntime`.
6. Maps real outcomes into Evidence and meta projection.
7. Invokes `LearningEngine` only for queued tickets.
8. Writes an Eval Request and waits for the separately invoked one-shot Evaluator receipt without receiving the sealed directory path or contents.
9. Creates a pending promotion request and displays its one-time challenge.
10. Invokes `Publisher` only after the interactive CLI creates a matching Approval Receipt; the app never writes active pointers directly.

No background daemon is required. `learn` processes at most one queued ticket per command. This keeps scheduling observable and prevents infinite loops.

`DecisionBrief` contains only:

```text
goal / loop / task / phase
verified facts
current public hypotheses
current action and why
next step and stop condition
budget usage
risks and unknowns
champion/challenger
intervention level
what happens if the user does nothing
```

The intervention gate returns blocking `required` only for human-only decisions with no safe reversible default.

- [ ] **Step 4: Implement the standard-library CLI**

Use `argparse`; do not add Typer, Click, FastAPI or Rich.

Examples:

```powershell
uv run python -m tianwen goal-create `
  --objective "Improve the sample repository" `
  --criterion "tests pass" `
  --workspace D:\work\sample `
  --data-dir D:\DevData\tianwen-runtime

uv run python -m tianwen run --goal GOAL_ID --request "Fix the failing parser test"
uv run python -m tianwen status --goal GOAL_ID
uv run python -m tianwen learn --goal GOAL_ID
uv run python -m tianwen eval-request --candidate VERSION_ID
uv run python evaluator/run_sealed_evaluator.py --request REQUEST_PATH --receipt RECEIPT_PATH
uv run python -m tianwen eval-import --receipt RECEIPT_PATH
uv run python -m tianwen promote --candidate VERSION_ID
uv run python -m tianwen rollback --artifact repo_task --approved-by USER_NAME --reason "follow-up regression"
```

Default `--data-dir` is `.tianwen` under the current project, which is ignored by Git. On this machine, README recommends `D:\DevData\tianwen-runtime` for long-running data.

Do not print prompts, file bodies, command parameters or secret values in status output.

- [ ] **Step 5: Add an explicit live experiment script**

`scripts/run_live_vertical_slice.py`:

- requires `TIANWEN_MODEL` and provider credentials from environment;
- requires `--workspace`, `--data-dir` and `--max-tokens`;
- invokes the preconfigured Evaluator command; it does not accept or print a sealed dataset path;
- refuses to run if the workspace is not a disposable Git worktree or has uncommitted changes;
- never creates or uploads a sealed dataset;
- prints the generated Goal ID, Run IDs, candidate digest, EvalRun ID and rollback command;
- labels the final result as one of `supported`, `limited`, `refuted`, `inconclusive`;
- never claims a single live success proves general continual learning.

The regular pytest suite must not execute this script.

- [ ] **Step 6: Document exact setup and data boundaries**

README sections:

1. What Tian-wen is and is not.
2. Why code is the first validation environment, not the product boundary.
3. Dependency setup with `uv sync`.
4. CLI walkthrough.
5. Local data locations; recommend `D:\DevData\tianwen-runtime`.
6. What the meta Loop can and cannot read.
7. How approval, `unknown`, recovery, promotion and rollback work.
8. How to configure the evaluator-only sealed directory and verify Windows ACL separation.
9. How to run deterministic tests and the explicit live experiment.
10. Current exclusions and the evidence required before adding them.

Add to `.gitignore`:

```gitignore
.tianwen/
*.db-wal
*.db-shm
```

- [ ] **Step 7: Run the complete deterministic verification**

```powershell
uv sync
uv run pytest -q
uv run ruff check .
git diff --check
```

Expected:

- all unit, integration and existing contract tests PASS;
- no live provider call occurs;
- Ruff has no findings;
- `git diff --check` has no output.

- [ ] **Step 8: Perform the first manual local smoke test**

Use a disposable repository under `D:\DevData\tianwen-smoke\repo` and state under `D:\DevData\tianwen-smoke\state`. Run:

```powershell
uv run python -m tianwen --help
uv run python -m tianwen goal-create --help
uv run python -m tianwen status --help
```

Then execute one deterministic demo command documented in README. Confirm:

- state appears under the specified `D:` directory;
- no file is written outside the disposable workspace;
- the status output includes task progress and learning progress separately;
- no raw secret, file body or hidden eval content is printed.

- [ ] **Step 9: Commit the complete vertical slice**

```powershell
git add src/tianwen tests/integration scripts README.md .gitignore
git commit -m "feat: complete first continual learning slice"
```

---

## Completion Boundary

The implementation is complete only when all of the following are true:

1. A human-confirmed Goal survives process restart.
2. Both user and meta Goals can create budget-bounded child Loops.
3. A repository Task runs with a frozen Run manifest.
4. File and Shell actions cannot bypass the Action Gateway.
5. Approval resumes the exact frozen action.
6. A crash after Action start produces `unknown` and no blind retry.
7. Raw facts, Case, Lesson, candidate Artifact, EvalRun and Promotion remain distinct.
8. The meta Loop receives only allowlisted `meta_telemetry`.
9. Memory cannot silently grant permission, change Goal or absorb secrets.
10. A specific failure can produce a condition-scoped `repo_task` Challenger.
11. Learning code cannot read the sealed promotion cases.
12. Safety or correctness regression cannot be traded for a higher aggregate score.
13. First ACTIVE promotion requires an unforgeable, one-time local user Approval Receipt bound to the candidate and EvalRun, and remains reversible.
14. A different follow-up Goal runs the new Champion and updates the capability conclusion.
15. Rollback changes only the active pointer and preserves all history.
16. Deterministic tests, contract tests, Ruff and diff checks pass.

A deterministic fixture proves the protocol, not broad intelligence. The first live experiment is complete only after a different follow-up task yields `supported`, `limited`, `refuted` or `inconclusive` evidence and the report states the sample boundary.

## Self-Review

- **Spec coverage:** Tasks 1—4 cover authority, execution and recovery; Tasks 5—7 cover evidence, memory, learning, evaluation and governance; Task 8 covers nested orchestration, user visibility, follow-up practice and rollback.
- **YAGNI check:** no Web UI, daemon, vector database, graph database, model training, external Worker, distributed queue, microservice, plugin platform or second Agent Framework is introduced.
- **Isolation check:** sealed cases live outside the repository; meta telemetry is constructed from a field whitelist; active assets are changed only by Publisher.
- **State-complexity check:** lifecycle enums remain small; reason and condition facts are separate; models choose local actions while programs enforce transitions.
- **Recovery check:** Event history is append-only, Run versions are frozen, leases and budgets persist, and unresolved external effects block only the affected branch.
- **Placeholder scan:** the plan contains no implementation placeholders; every task names exact files, interfaces, tests, commands and expected results.
