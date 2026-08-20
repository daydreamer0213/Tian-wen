# Tianwen Portable Python CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the unchanged Ubuntu Python CI job run the complete `uv run pytest` suite without changing Tianwen's product Runtime or Alpha's public Windows drive boundary.

**Architecture:** DSH remains the only product Agent Runtime. This change only makes the retained Alpha lab's Git subprocess environment and private test fixtures portable; the public Alpha workspace entry point continues to require `D:` and no Alpha execution capability is added.

**Tech Stack:** Python 3.12, pytest, pathlib, standard-library `os` and `tempfile`, GitHub Actions.

## Global Constraints

- Do not create or expand a Tianwen, Alpha, RepoTask, or Python Agent Runtime. DSH `0.1.0-rc.7` remains the only product Agent Runtime.
- Do not change `create_trial_workspace` or `_PUBLIC_DRIVE = "D:"`.
- Do not edit `.github/workflows/ci.yml`, dependencies, lock files, README files, release notes, or architecture ownership.
- Do not add pytest skips, ignores, markers, a platform matrix, a Windows job, retries, Docker services, credentials, or paid-live execution.
- Do not run Provider calls, paid models, Docker, or a live Alpha Trial.
- Reuse the existing worktree, Python environment, pnpm/uv caches, and disposable checkout. Do not create another clone, `.venv`, `node_modules`, or dependency installation.
- Task 7 and Task 8 remain frozen. Do not publish the repository, create a tag/Release/PR, or submit an application.
- Stop if Linux reveals an Alpha behavior failure beyond the confirmed Git-environment and private test-root assumptions.

---

### Task 1: Make the isolated Alpha Git environment portable

**Files:**
- Modify: `src/tianwen/alpha_workspace.py:93-101`
- Test: `tests/unit/test_alpha_workspace.py`

**Interfaces:**
- Consumes: `_git_environment(paths: AlphaTrialPaths) -> dict[str, str]`
- Produces: the same mapping, with `GIT_CONFIG_GLOBAL=os.devnull` and an optional `SYSTEMROOT` entry.

- [ ] **Step 1: Write the failing regression test**

Add `import os` beside the existing standard-library imports in
`tests/unit/test_alpha_workspace.py`, then add this test before the workspace
creation tests:

```python
def test_git_environment_does_not_require_windows_systemroot(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    trial_dir = tmp_path / "runs" / "trial-1"
    paths = alpha_workspace.AlphaTrialPaths(
        trial_id="trial-1",
        data_root=tmp_path,
        trial_dir=trial_dir,
        workspace=trial_dir / "workspace",
        state=trial_dir / "state",
        logs=trial_dir / "logs",
        diff_patch=trial_dir / "diff.patch",
        trial_manifest_json=trial_dir / "trial-manifest.json",
        trial_result_json=trial_dir / "trial-result.json",
    )
    monkeypatch.delenv("SYSTEMROOT", raising=False)

    environment = alpha_workspace._git_environment(paths)

    assert environment["GIT_CONFIG_GLOBAL"] == os.devnull
    assert "SYSTEMROOT" not in environment
```

- [ ] **Step 2: Run the regression test and preserve RED**

Run from `D:\DevData\tianwen-worktrees\tianwen-oss-application-prep`:

```powershell
$env:UV_CACHE_DIR = 'D:\DevData\uv-cache'
uv run pytest tests/unit/test_alpha_workspace.py::test_git_environment_does_not_require_windows_systemroot -q
```

Expected: FAIL with `KeyError: 'SYSTEMROOT'`. Do not change a second variable
before recording this result.

- [ ] **Step 3: Implement the minimum source fix**

Replace `_git_environment` with:

```python
def _git_environment(paths: AlphaTrialPaths) -> dict[str, str]:
    environment = {
        "GIT_CONFIG_NOSYSTEM": "1",
        "GIT_CONFIG_GLOBAL": os.devnull,
        "GIT_TERMINAL_PROMPT": "0",
        "HOME": str(paths.state / "git-home"),
        "PATH": os.environ["PATH"],
    }
    if system_root := os.environ.get("SYSTEMROOT"):
        environment["SYSTEMROOT"] = system_root
    return environment
```

Do not change workspace creation, drive validation, Git commands, or Alpha
execution behavior.

- [ ] **Step 4: Run focused GREEN**

```powershell
uv run pytest tests/unit/test_alpha_workspace.py::test_git_environment_does_not_require_windows_systemroot -q
uv run pytest tests/unit/test_alpha_workspace.py tests/unit/test_alpha_docker.py -q
uv run ruff check src/tianwen/alpha_workspace.py tests/unit/test_alpha_workspace.py
```

Expected: all selected tests and Ruff pass. These tests use fake Docker
boundaries and must not start Docker.

- [ ] **Step 5: Review and commit Task 1**

```powershell
git diff --check
git diff -- src/tianwen/alpha_workspace.py tests/unit/test_alpha_workspace.py
git add -- src/tianwen/alpha_workspace.py tests/unit/test_alpha_workspace.py
git diff --cached --check
git commit -m "fix: make Alpha git isolation portable"
```

Expected staged scope: exactly the two files listed above.

---

### Task 2: Make only the private Alpha integration fixtures portable

**Files:**
- Modify: `tests/integration/test_alpha_comparison.py`
- Modify: `tests/integration/test_alpha_trial.py`

**Interfaces:**
- Consumes: `AlphaTrialRunner(..., allowed_drive: str)` private test injection.
- Produces: Windows test roots under `D:\DevData`; POSIX test roots under the operating-system temporary directory; `allowed_drive` derived from that root.

- [ ] **Step 1: Record the existing Linux RED and the static Windows assumption**

Use GitHub Actions run `32335533984` as the platform RED: 440 passed, with all
97 failures and 50 errors confined to the four Alpha files identified in the
design. Then run:

```powershell
rg -n 'allowed_drive="D:"' tests/integration/test_alpha_comparison.py tests/integration/test_alpha_trial.py
```

Expected: existing hard-coded matches in both files.

- [ ] **Step 2: Add one platform-derived test root per integration module**

Add `import os` and `import tempfile` to both modules. In
`test_alpha_comparison.py`, define after the imports:

```python
_ALPHA_TEST_DATA_ROOT = (
    Path("D:/DevData/alpha-b-task-2-tests")
    if os.name == "nt"
    else Path(tempfile.gettempdir()) / "tianwen-alpha-b-task-2-tests"
)
_ALPHA_TEST_ALLOWED_DRIVE = _ALPHA_TEST_DATA_ROOT.resolve().drive
```

Change its `_data_root` to:

```python
def _data_root(role: str) -> Path:
    root = _ALPHA_TEST_DATA_ROOT / f"{role}-{secrets.token_hex(6)}"
    root.mkdir(parents=True)
    return root
```

In `_runner`, bind the generated root once so the path and allowed drive cannot
diverge:

```python
    data_root = _data_root(role)
    runner = AlphaTrialRunner(
        task_root=root / "tasks",
        image_lock_path=root / "environment" / "image.lock",
        data_root=data_root,
        model=model,
        docker_factory=lambda *_args: docker,
        allowed_drive=_ALPHA_TEST_ALLOWED_DRIVE,
    )
```

Replace the other comparison-module `allowed_drive="D:"` occurrence with
`allowed_drive=_ALPHA_TEST_ALLOWED_DRIVE`.

- [ ] **Step 3: Apply the same bounded fixture pattern to Alpha trial tests**

In `test_alpha_trial.py`, define after the imports:

```python
_ALPHA_TEST_DATA_ROOT = (
    Path("D:/DevData/alpha-task6-tests")
    if os.name == "nt"
    else Path(tempfile.gettempdir()) / "tianwen-alpha-task6-tests"
)
_ALPHA_TEST_ALLOWED_DRIVE = _ALPHA_TEST_DATA_ROOT.resolve().drive
```

Change `_data_root` to:

```python
def _data_root() -> Path:
    root = _ALPHA_TEST_DATA_ROOT / secrets.token_hex(4)
    root.mkdir(parents=True)
    return root
```

Replace every `allowed_drive="D:"` in this test module with
`allowed_drive=_ALPHA_TEST_ALLOWED_DRIVE`. Do not change any runner,
confirmation, budget, model, Docker fake, Evidence, or settlement assertion.

- [ ] **Step 4: Verify the private fixture boundary and focused behavior**

```powershell
rg -n 'allowed_drive="D:"' tests/integration/test_alpha_comparison.py tests/integration/test_alpha_trial.py
if ($LASTEXITCODE -ne 1) { throw 'hard-coded private test drive remains' }
uv run pytest tests/integration/test_alpha_comparison.py tests/integration/test_alpha_trial.py -q
uv run ruff check tests/integration/test_alpha_comparison.py tests/integration/test_alpha_trial.py
```

Expected: no hard-coded private `allowed_drive="D:"` remains; both integration
files and Ruff pass on Windows. The fake model and fake Docker boundaries must
not produce Provider, token, CNY, network, or Docker activity.

- [ ] **Step 5: Review and commit Task 2**

```powershell
git diff --check
git diff -- tests/integration/test_alpha_comparison.py tests/integration/test_alpha_trial.py
git add -- tests/integration/test_alpha_comparison.py tests/integration/test_alpha_trial.py
git diff --cached --check
git commit -m "test: make Alpha fixtures portable"
```

Expected staged scope: exactly the two integration test files.

---

### Task 3: Run proportional local gates and integrate the reviewed branch

**Files:**
- Verify only; no planned file changes.

**Interfaces:**
- Consumes: Task 1 and Task 2 commits plus the already-green TypeScript workflow.
- Produces: reviewed feature SHA and a no-fast-forward main merge SHA.

- [ ] **Step 1: Run the complete affected Python surface once**

```powershell
$env:UV_CACHE_DIR = 'D:\DevData\uv-cache'
Remove-Item Env:DEEPSEEK_API_KEY -ErrorAction SilentlyContinue
Remove-Item Env:TIANWEN_RUN_LIVE_MODEL_TESTS -ErrorAction SilentlyContinue
uv run pytest tests/unit/test_alpha_workspace.py tests/unit/test_alpha_docker.py tests/integration/test_alpha_comparison.py tests/integration/test_alpha_trial.py -q
uv run ruff check src/tianwen/alpha_workspace.py tests/unit/test_alpha_workspace.py tests/integration/test_alpha_comparison.py tests/integration/test_alpha_trial.py
uv run python -m compileall -q src tests
git diff --check
```

Expected: zero failures. Do not repeat dependency sync or the already-green
TypeScript suite locally.

- [ ] **Step 2: Perform correctness and Ponytail/YAGNI review**

Confirm all of the following directly from the branch diff:

- public `_PUBLIC_DRIVE` and `create_trial_workspace` are unchanged;
- no Runtime, Agent loop, model/provider, Docker, workflow, dependency, or
  public-surface file changed;
- the only source change is portable Git environment construction;
- the two integration modules preserve `D:\DevData` on Windows;
- no skip, retry, matrix, helper framework, or new abstraction was added;
- Critical and Important findings are zero.

If review requires a correction, make a narrow new commit; do not amend or
rewrite the existing commits.

- [ ] **Step 3: Push the feature branch normally**

```powershell
git status --short
git log -4 --oneline
git push origin codex/tianwen-oss-application-prep
git rev-parse HEAD
git rev-parse origin/codex/tianwen-oss-application-prep
git ls-remote origin refs/heads/codex/tianwen-oss-application-prep
```

Expected: clean worktree and identical local, tracking, and remote SHAs. No
force push, rebase, squash, PR, or tag.

- [ ] **Step 4: Merge through the existing dedicated main worktree**

Use `D:\DevData\tianwen-worktrees\tianwen-architecture-overview-v2-merge`.
Before merging, require clean main at exact
`b85543e4237b85120afc6211e170b78f5287eab8` locally and remotely.

```powershell
git status --short
git rev-parse HEAD
git rev-parse origin/main
git ls-remote origin refs/heads/main
git merge --no-ff codex/tianwen-oss-application-prep
git diff --check HEAD^1 HEAD
git push origin main
```

Verify that the merge introduces only the approved design/plan documents and
the four implementation files after the already-merged CI fix.

---

### Task 4: Require exact-SHA Linux CI evidence and stop

**Files:**
- Verify only; do not update readiness documents yet.

**Interfaces:**
- Consumes: the new main merge SHA and unchanged `.github/workflows/ci.yml`.
- Produces: exact GitHub Actions run and job conclusions for supervision.

- [ ] **Step 1: Wait for the exact main SHA**

Require a GitHub Actions run whose `head_sha` equals the new main merge SHA.
Do not accept an earlier run, feature-branch local result, or rerun of a failed
SHA as evidence.

- [ ] **Step 2: Check both jobs**

Expected:

- TypeScript job: success, including runtime dependency build, typecheck, DSH
  closure, private-import gate, focused Vitest, and demo.
- Python job: success, including immutable setup-uv, Python 3.12, frozen sync,
  Ruff, compileall, and unchanged complete `uv run pytest`.

If either job fails, save the exact job log under
`D:\DevData\tianwen-public-audit`, report the new root cause, and stop without
rerun or additional fixes.

- [ ] **Step 3: Report and stop before Task 7**

Send the architecture-supervision conversation:

- design, plan, Task 1, Task 2, feature, and main merge SHAs;
- exact CI run URL, head SHA, and both job URLs/conclusions;
- focused Windows test counts and Linux full-pytest count;
- proof that DSH remains the only product Runtime and public Alpha `D:` safety
  behavior is unchanged;
- resource statement confirming no second clone/environment/install;
- remaining readiness handoff/audit pending state.

Do not make a post-CI documentation commit, publish, tag, release, open a PR,
submit an application, or enter Task 7/8 until the supervisor explicitly
continues the plan.
