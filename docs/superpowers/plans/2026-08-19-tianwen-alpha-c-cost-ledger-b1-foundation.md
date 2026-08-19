# Tianwen Alpha-C Cost-Ledger B1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the zero-paid, offline-reviewed B1 task foundation and freeze the B2/B3 acceptance contracts so Tianwen—not the supervising Codex session—can implement the real AI cost-ledger increments in later one-shot Trials without the supervisor changing later requirements after seeing B1.

**Architecture:** Keep the product baseline and Tianwen governance authority separate. Add only fixed B1–B3 task IDs to the existing Alpha task loader, create a no-answer product scaffold plus a frozen B1 task package, and prove the seed fails while the hidden oracle passes. Freeze exact B2/B3 input, output, and edge-case contracts as pilot-specific data; their future task packages must mechanically reuse those bytes while deriving their seed only from the previously verified product commit. This plan stops before any Provider call or Tianwen product implementation; a separate plan will own the B1 live Trial after this foundation is merged.

**Tech Stack:** Python 3.12 standard library, Pydantic models already present in Tianwen, pytest, Ruff, Git, existing Alpha task bundle and Docker image lock.

## Global Constraints

- The tested implementation author is Tianwen. The supervising session must not implement, repair, or complete `ai-cost-ledger` product behavior.
- The supervising session may create a no-answer scaffold, frozen instructions, public checks, a hidden verifier, and an inaccessible oracle solely to validate the task contract.
- No Provider, paid model, live web, Candidate, Promotion, Shadow, or Alpha-D action occurs in this plan.
- Product code uses only the Python standard library; no dependency, database, UI, CSV importer, Provider API, or multi-currency support is added.
- B1–B3 are the only new accepted IDs. Do not build an arbitrary external-task router or second Runner.
- Existing A1–A5 task bytes, digests, semantics, roots, receipts, and branches remain unchanged.
- The current billing authority is actual spend CNY 0.48 and remaining authorization CNY 19.52. This plan spends CNY 0.
- Large generated or temporary data stays under `D:\DevData` or the project directory on `D:`; do not create new caches on `C:`.
- Existing untracked or unreadable `.tmp` paths are not part of the work and must not be modified.

---

## File Structure

### Tianwen repository

- Modify `src/tianwen/alpha_tasks.py` — admit exactly B1–B3 as single-round, no-source Alpha task IDs.
- Modify `tests/unit/test_alpha_tasks.py` — prove B IDs are admitted with the intended round/source/feedback constraints and unrelated IDs remain rejected.
- Modify `tests/alpha/test_task_packages.py` — add B1 to the frozen package contract and nop/oracle repeatability gate.
- Create `alpha/tasks/B1/instruction.md` — model-visible B1 product requirement.
- Create `alpha/tasks/B1/task.json` — frozen B1 authority with derived digests.
- Create `alpha/tasks/B1/seed/pyproject.toml` — no-dependency project metadata.
- Create `alpha/tasks/B1/seed/src/ai_cost_ledger/__init__.py` — empty public package marker and version only.
- Create `alpha/tasks/B1/seed/src/ai_cost_ledger/__main__.py` — explicit not-implemented scaffold; contains no solution logic.
- Create `alpha/tasks/B1/checks/public.py` — small public behavioral check.
- Create `alpha/tasks/B1/verifier/verify.py` — hidden deterministic B1 verifier emitting the existing verifier JSON contract.
- Create `alpha/tasks/B1/reference/solution.patch` — hidden oracle used only to prove the verifier can accept a valid implementation.
- Create `alpha/pilots/cost-ledger/contracts.json` — one canonical pilot-specific file containing the exact future B2/B3 model-visible instructions and cases; not a runnable task package.
- Create `tests/alpha/test_cost_ledger_pilot_contracts.py` — prove frozen contracts are canonical, closed, and contain no product answer.
- Create `docs/operations/tianwen-alpha-c-cost-ledger-b1-foundation-handoff.md` — exact offline evidence and the no-live stop line.

### Product repository created during Task 2

- Create `D:\Guo\zuochong\ai-cost-ledger\.gitignore` — Python generated files only.
- Create `D:\Guo\zuochong\ai-cost-ledger\README.md` — product purpose and B1 scope, no solution.
- Create `D:\Guo\zuochong\ai-cost-ledger\pyproject.toml` — same bytes as the B1 seed.
- Create `D:\Guo\zuochong\ai-cost-ledger\src\ai_cost_ledger\__init__.py` — same bytes as the B1 seed.
- Create `D:\Guo\zuochong\ai-cost-ledger\src\ai_cost_ledger\__main__.py` — same not-implemented scaffold as the B1 seed.

---

### Task 1: Admit only the fixed B-series task IDs

**Files:**
- Modify: `src/tianwen/alpha_tasks.py`
- Modify: `tests/unit/test_alpha_tasks.py`

**Interfaces:**
- Consumes: existing `AlphaTask`, `load_task_bundle()`, `_validate_rounds()`, `_validate_source()`, and `_validate_task_layout()`.
- Produces: `AlphaTask.task_id` accepting `B1`, `B2`, and `B3`; all three use the existing single-round/no-feedback/no-source rules.

- [ ] **Step 1: Add failing loader tests for B1–B3**

Add this test beside the existing authority-field tests:

```python
@pytest.mark.parametrize("task_id", ("B1", "B2", "B3"))
def test_loader_accepts_fixed_single_round_b_tasks(tmp_path: Path, task_id: str) -> None:
    task_dir, lock = _minimal_bundle(tmp_path, task_id=task_id)

    bundle = load_task_bundle(task_dir, lock)

    assert bundle.task.task_id == task_id
    assert [round_.round_id for round_ in bundle.task.rounds] == ["round-1"]
    assert bundle.feedback_by_round == {}
    assert bundle.task.sources == ()
```

Extend the invalid-ID parameters with `B4` and retain `A6` so the test proves this is a closed pilot set:

```python
@pytest.mark.parametrize("task_id", ("A6", "B4", "COST1"))
def test_loader_rejects_unapproved_task_ids(tmp_path: Path, task_id: str) -> None:
    task_dir, lock = _minimal_bundle(tmp_path)
    raw = _raw(task_dir)
    raw["task_id"] = task_id
    _save(task_dir, raw)

    with pytest.raises(AlphaTaskError, match="task_id"):
        load_task_bundle(task_dir, lock)
```

- [ ] **Step 2: Run the focused RED**

Run:

```powershell
uv run pytest tests/unit/test_alpha_tasks.py -k "fixed_single_round_b_tasks or unapproved_task_ids" -q
```

Expected: B1–B3 cases fail because Pydantic rejects their task IDs; invalid IDs continue to fail closed.

- [ ] **Step 3: Implement the minimal closed ID extension**

In `src/tianwen/alpha_tasks.py`, define exact closed sets:

```python
AlphaTaskId = Literal["A1", "A2", "A3", "A4", "A5", "B1", "B2", "B3"]
_SINGLE_ROUND_TASK_IDS = frozenset({"A1", "A2", "A3", "A4", "B1", "B2", "B3"})
```

Use `AlphaTaskId` for `AlphaTask.task_id`. In `_validate_rounds()`, replace the A1–A4-only membership test with `_SINGLE_ROUND_TASK_IDS`. Preserve A5 as the only two-round feedback task and A3 as the only source-bearing task. Do not change task layout, digest, path, image, or limit validation.

- [ ] **Step 4: Run the focused GREEN and existing A3/A5 regression cases**

Run:

```powershell
uv run pytest tests/unit/test_alpha_tasks.py -k "fixed_single_round_b_tasks or unapproved_task_ids or requires_a5 or only_a3" -q
```

Expected: all selected tests pass.

- [ ] **Step 5: Run the complete task-loader unit package**

Run:

```powershell
uv run pytest tests/unit/test_alpha_tasks.py -q
```

Expected: all tests pass; the two existing Windows symlink cases may skip only when the account lacks symlink permission.

- [ ] **Step 6: Commit the closed schema change**

```powershell
git add -- src/tianwen/alpha_tasks.py tests/unit/test_alpha_tasks.py
git commit -m "feat(alpha): admit fixed cost-ledger pilot tasks"
```

---

### Task 2: Create the no-answer product baseline and frozen B1 authority

**Files:**
- Create the product and B1 files listed in the File Structure section.

**Interfaces:**
- Consumes: the B1 task ID admitted by Task 1 and `alpha/environment/image.lock`.
- Produces: a clean product baseline commit and `alpha/tasks/B1` whose seed bytes match that baseline's project files.

- [ ] **Step 1: Create the standalone repository without implementation behavior**

Create `D:\Guo\zuochong\ai-cost-ledger`, initialize `main`, and add only these baseline files. Use `apply_patch` for file contents rather than shell redirection:

```powershell
New-Item -ItemType Directory -Path 'D:\Guo\zuochong\ai-cost-ledger' -Force
git -C D:\Guo\zuochong\ai-cost-ledger init -b main
```

`pyproject.toml`:

```toml
[project]
name = "ai-cost-ledger"
version = "0.1.0"
description = "Reconcile local AI usage evidence with explicit billing authority."
requires-python = ">=3.12"
dependencies = []
```

Do not add a `[build-system]` table in B1. The task executes directly from the
`src` checkout and does not build or install a wheel, so an empty or invented
build backend would be invalid authority rather than useful metadata.

`src/ai_cost_ledger/__init__.py`:

```python
"""AI cost-ledger package."""

__version__ = "0.1.0"
```

`src/ai_cost_ledger/__main__.py`:

```python
from __future__ import annotations


def main() -> int:
    raise NotImplementedError("B1 receipt reporting is not implemented")


if __name__ == "__main__":
    raise SystemExit(main())
```

`.gitignore`:

```gitignore
__pycache__/
*.py[cod]
.pytest_cache/
report-output/
```

`README.md` must state only the user problem, the standard-library/no-network boundary, and that B1 is not implemented. It must not contain algorithms, expected JSON, verifier cases, or a solution outline.

- [ ] **Step 2: Verify and commit the no-answer baseline**

Run:

```powershell
python -m py_compile D:\Guo\zuochong\ai-cost-ledger\src\ai_cost_ledger\__init__.py D:\Guo\zuochong\ai-cost-ledger\src\ai_cost_ledger\__main__.py
git -C D:\Guo\zuochong\ai-cost-ledger diff --check
git -C D:\Guo\zuochong\ai-cost-ledger status --short
```

Expected: compilation passes and only the five intended baseline files are untracked. Commit them:

```powershell
git -C D:\Guo\zuochong\ai-cost-ledger add -- .gitignore README.md pyproject.toml src/ai_cost_ledger/__init__.py src/ai_cost_ledger/__main__.py
git -C D:\Guo\zuochong\ai-cost-ledger commit -m "chore: establish cost-ledger B1 baseline"
```

- [ ] **Step 3: Add the permanent B1 package tests before the task exists**

In `tests/alpha/test_task_packages.py`, extend the existing closed tuple:

```python
TASK_IDS = ("A1", "A2", "A3", "A4", "A5", "B1")
```

Add this focused authority test:

```python
def test_b1_is_single_round_no_source_and_writes_only_product_code() -> None:
    bundle = load_task_bundle(ROOT / "alpha" / "tasks" / "B1", IMAGE_LOCK)

    assert [round_.round_id for round_ in bundle.task.rounds] == ["round-1"]
    assert bundle.feedback_by_round == {}
    assert bundle.task.sources == ()
    assert bundle.task.allowed_write_patterns == (
        "src/ai_cost_ledger/__main__.py",
        "src/ai_cost_ledger/ledger.py",
    )
    assert bundle.task_bundle_digest != bundle.model_input_digest
```

Run:

```powershell
uv run pytest tests/alpha/test_task_packages.py -k "B1 or b1" -q
```

Expected RED: B1 cases fail because `alpha/tasks/B1` does not exist yet. Do not
weaken or skip the tests.

- [ ] **Step 4: Copy only product project bytes into the B1 seed**

The B1 seed contains `pyproject.toml` and `src/ai_cost_ledger/{__init__.py,__main__.py` with byte-for-byte equality to the product baseline. Do not copy `.git`, `.gitignore`, README, tests, task instructions, checks, reference material, or user credentials into the seed.

- [ ] **Step 5: Write the model-visible B1 instruction**

`alpha/tasks/B1/instruction.md` must require:

```markdown
# 汇总 AI 运行收据并生成费用报告

只修改 `src/ai_cost_ledger/`，实现 `python -m ai_cost_ledger report`：

- `--receipts` 指向只含 JSON 收据的目录；
- `--budget-cny` 和 `--rate-cny-per-million` 接受非负十进制字符串；
- `--output` 指向不存在或为空的输出目录；
- 每份 B1 收据含唯一 `receipt_id`、非负整数 `request_usage` 和 `token_usage`；
- 汇总收据数量、请求数和 Token，并按费率计算保守投影；
- B1 没有实际账单，实际花费和实际剩余余额必须显示为 unknown；
- 生成确定性的 `summary.json` 和 `report.md`；
- 不修改输入，不访问网络，只使用 Python 标准库。

可以按需运行登记的 `public` 检查。不能运行任意 Shell，不能读取最终验证器或参考答案。
```

- [ ] **Step 6: Define the B1 machine-readable output contract**

The public and hidden checks must require this JSON shape. Decimal values are strings so no binary-float representation enters the contract:

```json
{
  "schema_version": "ai-cost-ledger.summary.v1",
  "status": "complete",
  "currency": "CNY",
  "observed": {
    "receipt_count": 2,
    "model_requests": 3,
    "tokens": 150
  },
  "projection": {
    "rate_cny_per_million": "27",
    "spend_cny": "0.00405"
  },
  "actual_billing": {
    "status": "unknown",
    "spend_cny": null,
    "remaining_cny": null
  },
  "budget_cny": "20"
}
```

`report.md` must show the same facts with explicit headings for observed usage, conservative projection, actual billing, and budget. It must say actual billing is unknown rather than presenting the projection as actual spend.

- [ ] **Step 7: Write the public check**

`checks/public.py` creates two temporary receipts:

```json
{"receipt_id":"public-1","request_usage":2,"token_usage":100}
{"receipt_id":"public-2","request_usage":1,"token_usage":50}
```

It invokes the documented module boundary with:

```python
subprocess.run(
    [
        sys.executable,
        "-m",
        "ai_cost_ledger",
        "report",
        "--receipts",
        str(receipts),
        "--budget-cny",
        "20",
        "--rate-cny-per-million",
        "27",
        "--output",
        str(output),
    ],
    cwd=workspace / "src",
    check=True,
    capture_output=True,
    timeout=10,
    env={"PYTHONIOENCODING": "utf-8"},
)
```

The check itself is already started by the Docker executor with `python -I`;
the product subprocess deliberately uses the normal documented `python -m`
entry point from `workspace/src` and receives no inherited credential or proxy
environment. It parses `summary.json` and asserts the exact contract from Step
6. It also asserts both output files exist and neither input file changed. On
success it prints one stable line and exits 0; assertion or subprocess failure
exits non-zero without printing hidden expected values.

- [ ] **Step 8: Write the hidden final verifier**

`verifier/verify.py` runs independent cases and emits the existing `VerifierResult` JSON fields used by A1–A5: `verdict`, `passed_checks`, `failed_checks`, `failure_categories`, and `summary`.

Freeze these checks:

```python
CHECKS = (
    "basic_totals",
    "decimal_projection",
    "actual_billing_unknown",
    "deterministic_json",
    "deterministic_markdown",
    "input_unchanged",
    "empty_receipt_directory",
    "no_network_or_dependencies",
)
```

The empty directory case must produce zero observed totals and a zero projection while actual billing remains unknown. Determinism is proved by two fresh output directories with byte-identical `summary.json` and `report.md`. The verifier must not import product code directly; it executes the same `python -m ai_cost_ledger report` boundary from `workspace/src`, with the same clean environment shown for the public check.

The verifier prints exactly one UTF-8 JSON document containing all five
required `VerifierResult` fields and no extras:

```python
{
    "verdict": "met" if not failed else "not_met",
    "passed_checks": sorted(passed),
    "failed_checks": sorted(failed),
    "failure_categories": [] if not failed else ["behavior_mismatch"],
    "summary": f"{len(passed)}/{len(CHECKS)} checks passed",
}
```

If the verifier itself cannot create its temporary inputs or execute the CLI,
it emits `verdict="inconclusive"` and
`failure_categories=["verifier_infrastructure"]`; it must not turn an
infrastructure exception into a product failure or a false `met`.

- [ ] **Step 9: Add the hidden oracle patch and frozen task skeleton**

Create `reference/solution.patch` only to prove the verifier admits one valid standard-library implementation. The patch is never copied to the product repository, model input, prompt, Evidence, Lesson, or Candidate. It may touch only:

```text
src/ai_cost_ledger/__main__.py
src/ai_cost_ledger/ledger.py
```

Create `task.json` with `task_id="B1"`, one `round-1`, one `public` check, the existing immutable Python image digest, and these limits:

```json
{
  "max_seed_bytes": 1048576,
  "max_changed_files": 2,
  "max_changed_bytes": 32768,
  "max_trial_bytes": 16777216,
  "min_free_bytes": 2147483648,
  "memory_bytes": 268435456,
  "cpus": 1.0,
  "pids": 64,
  "tmpfs_bytes": 33554432
}
```

Allowed writes are exactly the two product paths above. Protected patterns remain the A-task protected set. No sources or feedback directory exists.

Before freezing, `task.json` contains this complete authored skeleton; only
derived digest fields are omitted for `freeze_task_bundle()` to fill:

```json
{
  "schema_version": "tianwen.alpha_task.v1",
  "task_id": "B1",
  "task_version": "1.0.0",
  "title": "汇总 AI 运行收据并生成费用报告",
  "rounds": [
    {"round_id": "round-1", "public_check_ids": ["public"]}
  ],
  "public_acceptance": [
    "Aggregate receipt count, model requests, and tokens from B1 JSON receipts.",
    "Calculate the conservative CNY projection with decimal arithmetic.",
    "Keep projection separate from actual billing and report actual values as unknown.",
    "Write deterministic summary.json and report.md without changing inputs.",
    "Handle an empty receipt directory without network access or third-party dependencies."
  ],
  "named_checks": [
    {
      "check_id": "public",
      "script": "public.py",
      "argv": ["python", "-I", "/checks/public.py", "/workspace"],
      "timeout_seconds": 15,
      "output_limit_bytes": 65536
    }
  ],
  "final_verifier": {
    "verifier_id": "final",
    "argv": ["python", "-I", "/checks/verify.py", "/workspace"],
    "timeout_seconds": 15,
    "output_limit_bytes": 65536
  },
  "limits": {
    "max_seed_bytes": 1048576,
    "max_changed_files": 2,
    "max_changed_bytes": 32768,
    "max_trial_bytes": 16777216,
    "min_free_bytes": 2147483648,
    "memory_bytes": 268435456,
    "cpus": 1.0,
    "pids": 64,
    "tmpfs_bytes": 33554432
  },
  "allowed_write_patterns": [
    "src/ai_cost_ledger/__main__.py",
    "src/ai_cost_ledger/ledger.py"
  ],
  "protected_patterns": [
    ".git",
    ".git/**",
    ".gitattributes",
    ".env",
    ".env.*",
    "**/*key*",
    "**/*token*",
    "**/*secret*"
  ]
}
```

- [ ] **Step 10: Freeze derived task digests once**

Run the repository freezer explicitly:

```powershell
uv run python -c "from pathlib import Path; from tianwen.alpha_tasks import freeze_task_bundle; freeze_task_bundle(Path('alpha/tasks/B1'), Path('alpha/environment/image.lock'))"
```

Run it a second time and require no diff, proving canonical freeze idempotence:

```powershell
uv run python -c "from pathlib import Path; from tianwen.alpha_tasks import freeze_task_bundle; freeze_task_bundle(Path('alpha/tasks/B1'), Path('alpha/environment/image.lock'))"
git diff --check
```

- [ ] **Step 11: Run the B1 GREEN before committing**

Run twice:

```powershell
uv run pytest tests/alpha/test_task_packages.py -k "B1 or b1" -q
uv run pytest tests/alpha/test_task_packages.py -k "B1 or b1" -q
```

Expected: identical pass counts; the seed is `not_met`, the inaccessible oracle
is `met`, and the focused authority assertions pass.

- [ ] **Step 12: Commit the scaffold, package, and B1-first tests**

```powershell
git add -- alpha/tasks/B1 tests/alpha/test_task_packages.py
git commit -m "test(alpha): freeze real cost-ledger B1 task"
```

Do not add any product repository files to the Tianwen Git commit beyond the frozen seed bytes already under `alpha/tasks/B1/seed`.

---

### Task 3: Freeze B2/B3 before observing any paid B1 result

**Files:**
- Create: `alpha/pilots/cost-ledger/contracts.json`
- Create: `tests/alpha/test_cost_ledger_pilot_contracts.py`

**Interfaces:**
- Consumes: the approved pilot design and B1 output schema.
- Produces: immutable pilot-specific future contracts. These are not loadable Alpha task packages and contain no seed, reference patch, product code, or model answer.

- [ ] **Step 1: Add contract tests first**

Create `tests/alpha/test_cost_ledger_pilot_contracts.py`. It loads the one JSON
file above with `Path` and `json`, then requires:

```python
assert contracts["schema_version"] == "tianwen.cost_ledger_contracts.v1"
assert set(contracts) == {"schema_version", "tasks"}
b2, b3 = contracts["tasks"]
assert b2["task_id"] == "B2"
assert b2["predecessor"] == "B1"
assert b3["task_id"] == "B3"
assert b3["predecessor"] == "B2"
assert tuple(case["case_id"] for case in b2["cases"]) == (
    "confirmed_actual_billing",
    "missing_confirmation_remains_unknown",
    "invalid_confirmation_fails_without_official_output",
)
assert tuple(case["case_id"] for case in b3["cases"]) == (
    "identical_duplicate_counts_once",
    "missing_tokens_keeps_known_subtotals",
    "conflicting_receipt_id_excludes_conflict",
    "malformed_receipt_is_locatable",
    "output_failure_leaves_no_partial_official_report",
)
```

Require the ordered `tasks` list to contain exactly B2 then B3. Recursively
scan all string values and reject `solution.patch`, `reference/`, `diff --git`,
`@@ `, `def `, and `class `. This is a requirements freeze, not an answer
freeze.

Run:

```powershell
uv run pytest tests/alpha/test_cost_ledger_pilot_contracts.py -q
```

Expected RED: `contracts.json` does not exist.

- [ ] **Step 2: Freeze the B2 instruction and cases**

The B2 object's `instruction` string must require the existing B1 command to accept:

```text
--billing-confirmation <JSON file>
```

The confirmation schema is exactly:

```json
{
  "schema_version": "ai-cost-ledger.billing-confirmation.v1",
  "currency": "CNY",
  "spend_cny": "0.48",
  "checked_at": "2026-08-19",
  "source_type": "user_confirmation"
}
```

The instruction states that `spend_cny` is a non-negative decimal string,
currency must be `CNY`, actual remaining is `budget_cny - spend_cny`, and the
observed usage plus conservative projection remain present. Missing
`--billing-confirmation` preserves B1's `actual_billing.status="unknown"`.
Malformed, negative, wrong-currency, or over-budget confirmation is an input
error and must leave neither official output file behind.

The B2 object stores the three ordered cases asserted in Step 1. The confirmed
case requires:

```json
{
  "actual_billing": {
    "status": "confirmed",
    "spend_cny": "0.48",
    "remaining_cny": "19.52",
    "checked_at": "2026-08-19",
    "source_type": "user_confirmation"
  }
}
```

The case explicitly asserts that projection values remain separate and are
not overwritten by `0.48`.

- [ ] **Step 3: Freeze the B3 instruction and cases**

The B3 object's `instruction` string preserves B1/B2 behavior and fixes these decisions before
any live result exists:

- receipts are processed in normalized relative-path order;
- an identical duplicate means the same `receipt_id` and the same parsed JSON
  object; it is counted once and does not make the report incomplete;
- if the same ID has different parsed content, every version of that ID is
  excluded from totals and a sorted conflict issue names every source file;
- a receipt with valid ID/request usage but missing `token_usage` contributes
  its known request count, contributes no invented tokens, and makes the report
  incomplete;
- malformed JSON is excluded and produces a locatable issue; other valid
  receipts still contribute known subtotals;
- any unknown or conflict produces top-level `status="incomplete"`; otherwise
  status remains `complete`;
- official `summary.json` and `report.md` are committed as one logical result:
  a write/replace failure must not leave one new official file claiming
  completion without the other.

The B3 `observed` object retains B1 keys and adds:

```json
{
  "receipt_count": 2,
  "model_requests": 3,
  "tokens": 100,
  "completeness": "partial"
}
```

The top-level `issues` array is deterministically sorted by `code`, then
`receipt_id` (empty string when unavailable), then `sources`. Each issue has
exactly `code`, `receipt_id`, and `sources`; allowed codes are
`missing_token_usage`, `receipt_id_conflict`, and `malformed_receipt`.

The B3 object stores the five ordered cases from Step 1, including exact
fixture objects and expected totals/issues. The
conflict case includes one unrelated valid receipt so the test proves partial
truth is retained rather than zeroing the whole report.

- [ ] **Step 4: Run the contract GREEN and canonical-byte check**

```powershell
uv run pytest tests/alpha/test_cost_ledger_pilot_contracts.py -q
uv run pytest tests/alpha/test_cost_ledger_pilot_contracts.py -q
git diff --check
```

Expected: identical pass counts. Serialize `contracts.json` with sorted object
keys, compact separators, UTF-8, and one final LF. Array order remains the
authority. Re-reading and serializing must reproduce byte-identical bytes.

- [ ] **Step 5: Commit the pre-observation contracts**

```powershell
git add -- alpha/pilots/cost-ledger/contracts.json tests/alpha/test_cost_ledger_pilot_contracts.py
git commit -m "test(alpha): freeze cost-ledger B2 B3 contracts"
```

Later B2/B3 plans must bind this commit and exact contract digests. They may
copy the exact `instruction` string into the future package and derive only the
seed/baseline from the preceding verified Tianwen product commit; changing a
frozen case requires a new explicit design decision, not an implementation
convenience.

---

### Task 4: Prove the B1 task contract is closed and repeatable

**Files:**
- Test: `tests/alpha/test_task_packages.py`
- Test: `tests/unit/test_alpha_tasks.py`
- Test: `tests/alpha/test_task_packages.py`

**Interfaces:**
- Consumes: frozen B1 bundle from Task 2.
- Produces: permanent regression evidence that B1 seed fails, the inaccessible oracle passes, and the bundle excludes checks/reference from model input.

- [ ] **Step 1: Re-run the B1 contract after reopening the repository**

Run:

```powershell
uv run pytest tests/alpha/test_task_packages.py -k "B1 or b1" -q
uv run pytest tests/alpha/test_task_packages.py -k "B1 or b1" -q
```

Expected: identical pass counts both times. The generic nop/oracle test proves seed `not_met`, oracle `met`, and byte-stable verifier output.

- [ ] **Step 2: Prove the public check boundary separately**

Copy the B1 seed to a disposable directory under `D:\DevData\tianwen-b1-contract`, run the public check twice, apply the hidden reference patch only to that disposable copy, and run twice again.

Expected:

```text
seed: non-zero, identical stdout/stderr across both runs
oracle: exit 0, identical stdout/stderr across both runs
```

Delete only the exact disposable directory after recording its digest; do not touch product or Alpha live roots.

- [ ] **Step 3: Run the complete task authority suites**

```powershell
uv run pytest tests/unit/test_alpha_tasks.py tests/alpha/test_task_packages.py -q
```

Expected: all tests pass, with only existing platform-conditioned symlink skips.

- [ ] **Step 4: Record the contract evidence for the handoff**

Record the two focused pass counts, disposable contract digest, seed/oracle
verdicts, and exact cleanup target. No new production or product commit is
created in this task.

---

### Task 5: Run offline release gates and close the foundation stage

**Files:**
- Create: `docs/operations/tianwen-alpha-c-cost-ledger-b1-foundation-handoff.md`

**Interfaces:**
- Consumes: Tasks 1–3 commits and test evidence.
- Produces: a merge-ready, zero-paid foundation and the exact authority inputs required by the later B1 live plan.

- [ ] **Step 1: Run focused and full Python gates fresh**

```powershell
uv run pytest tests/unit/test_alpha_tasks.py tests/alpha/test_task_packages.py -q
uv run pytest -q
```

Expected: all non-platform-skipped tests pass. Record exact pass/skip counts and elapsed time in the handoff.

- [ ] **Step 2: Run static and diff gates**

```powershell
uv run ruff check src tests scripts
uv run python -m compileall -q src tests
git diff --check main...HEAD
```

Expected: exit 0 for every command.

- [ ] **Step 3: Audit the role boundary**

Run these read-only checks and record results:

```powershell
git -C D:\Guo\zuochong\ai-cost-ledger status --short
git diff --name-only main...HEAD
rg -n "solution.patch|verifier/verify.py" alpha/tasks/B1/seed D:\Guo\zuochong\ai-cost-ledger
```

Expected:

- product repository is still at the no-answer baseline and clean;
- the Tianwen diff contains infrastructure, B1 authority, tests, and handoff only;
- no hidden verifier/reference content occurs in the B1 seed or product repository.

- [ ] **Step 4: Review against the approved design**

Check every diff hunk for:

- fixed IDs only, not a generic task framework;
- no product implementation written by the supervising session;
- no Provider or paid call;
- B1 seed fail and oracle pass;
- B2/B3 instructions and acceptance cases frozen before paid B1 observation;
- A1–A5 unchanged;
- no Candidate/Promotion/Alpha-D behavior.

Any correctness finding is fixed with a focused RED/GREEN before continuing. Complexity-only findings may delete code but may not weaken the frozen authority.

Require two separate review conclusions before merge:

- correctness/spec review: no open Critical or Important finding;
- Ponytail/YAGNI review: no unnecessary router, recovery layer, dependency,
  generic task framework, or duplicated parser/billing abstraction.

- [ ] **Step 5: Write the canonical foundation handoff**

The handoff records:

- branch, base, commit SHAs and tree;
- B1 task bundle/model-input/baseline/verifier/public-check digests;
- B2/B3 instruction and contract SHA-256 values;
- product baseline Git SHA and clean status;
- focused/full/static gate counts;
- explicit external effects `Provider=0`, `tokens=0`, `CNY=0`, `Docker=0` unless a separately recorded free contract proof ran;
- explicit statement that the supervising session did not implement product behavior;
- exact next entrance: write and review a separate one-shot B1 live plan, then let Tianwen execute;
- stop line: no B2/B3 execution or package baselines, no Candidate, no Alpha-D in this foundation stage.

- [ ] **Step 6: Commit the handoff**

```powershell
git add -- docs/operations/tianwen-alpha-c-cost-ledger-b1-foundation-handoff.md
git commit -m "docs: hand off cost-ledger B1 foundation"
```

- [ ] **Step 7: Normal Git integration**

After final verification, normally push the stage branch. Merge to the then-current `main` with `--no-ff`, rerun focused/full Python, Ruff, and diff-check on the merge tree, then ordinary-push `main`. Never rebase, squash, force-push, or delete evidence branches.

- [ ] **Step 8: Stop before live execution**

Do not invoke Tianwen or DeepSeek from this plan. The next plan must bind the exact merged foundation SHA, product baseline SHA, B1 task digests, fresh one-use root, model/provider/non-thinking settings, actual remaining CNY 19.52, and the existing Learning Intake stop rules.
