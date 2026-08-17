# Alpha-A Implementation Handoff: Tasks 1–4

Date: 2026-08-13

## Resume point

- Branch: `codex/alpha-a-real-task`
- Base: `8ca70d379a46ee495b70fcb4b8f21fde5083c037`
- Current implementation head before this handoff commit:
  `d0568214564648705eef76bb3b195e717b47cf86`
- Execution plan:
  `docs/superpowers/plans/2026-08-13-real-task-alpha-a-execution.md`
- Next plan item: Task 5, **Assemble the Shell-Free Alpha Runtime**

Do not restart design or reimplement Tasks 1–4. Continue from Task 5 with
test-driven implementation and a separate task-scoped review.

## Completed work

### Task 1 — Versioned model identity

- Added the shared `model_identity()` compatibility seam.
- Preserved schema-v1 `model_name` identity and added schema-v2 `model_id`.
- Exposed `BudgetedModel` without changing ordinary task behavior.
- Independent review: approved with no findings.

Commits:

- `0f89fbb` — `refactor: share versioned model identity`

### Task 2 — Frozen Alpha task packages

- Added frozen task, image, check, verifier, round, limit and source models.
- Added canonical directory, task-bundle and model-input digests.
- Added author-only freezing and read-only runtime loading.
- Added the immutable Python image lock.
- Independent review: approved with no findings.

Commits:

- `38ebd17` — `feat: freeze alpha task bundles`

### Task 3 — Disposable workspaces and immutable evidence

- Added new-only Trial workspaces on a confirmed `D:` root.
- Added pre-write path and quota projection.
- Added one baseline Git commit and read-only diff evidence.
- Added bounded immutable artifacts and credential-sentinel scanning.
- Persisted `state/authority.json` so evidence limits survive controller
  restarts.
- Independent review found two Important issues; both were fixed and the
  scoped re-review approved them.

Commits:

- `222e42f` — `feat: create auditable alpha workspaces`
- `894a6c3` — `fix: persist alpha workspace authority`

### Task 4 — Recoverable locked-down Docker checks

- Added one concrete `DockerCheckExecutor`.
- Added fixed, shell-free, no-network, read-only, non-root Docker execution.
- Added minimal host environment, exact mount/config verification and
  secret-safe durable records.
- Added bounded concurrent output capture, absolute deadlines and exact
  container recovery.
- Added typed public/final timeout evidence and durable recovery audits.
- Added narrow `UNKNOWN -> SUCCEEDED|FAILED` StateStore settlement.
- Four focused fix rounds closed the task review findings. Final scoped
  re-review passed with no open Critical or Important issue.

Commits:

- `275ceca` — `feat: run recoverable named docker checks`
- `3d73649` — `fix: complete docker check recovery`
- `ad0af16` — `fix: preserve public docker result type`
- `f9e684d` — `fix: close docker timeout crash windows`
- `415e1b7` — `fix: inspect after docker timeout control errors`
- `7675f28` — `fix: finalize docker timeout evidence`
- `d056821` — `fix: handle docker log timeouts`

## Verified state

Commands run at `d056821`:

```powershell
$env:UV_CACHE_DIR = 'D:\DevData\uv-cache'
uv run pytest -q
uv run ruff check .
git diff --check
```

Results:

- Pytest: `367 passed, 4 skipped in 87.87s`
- Ruff: `All checks passed!`
- Git whitespace check: passed
- Working tree: clean before this handoff document

Expected skips:

- paid DeepSeek V4 Pro live probe;
- two symlink tests because this Windows account lacks symlink privilege;
- the Windows ACL case that is tested separately.

No paid model request, network request or real Docker container was used for
Tasks 1–4.

## Known constraints to carry forward

- Preserve the Trial `state` directory. It contains the immutable authority
  snapshot needed after restart.
- Call Docker preflight before any paid model request.
- A Docker timeout must remain a recoverable unknown outcome until the exact
  prior container is reconciled; never launch a replacement automatically.
- `cleanup_terminal()` is synchronous best-effort cleanup and may run only
  after both the execution record and linked Action are terminal.
- Persisted Docker records, audits and errors must never contain raw stderr,
  host paths, inherited environment values or API keys.
- Runtime task loading is read-only. Only the explicit author freezer may
  rewrite derived task digests.
- Ordinary schema-v1 runs must remain compatible and must not be rewritten.

## Task 5 starting instructions

Read the Task 5 section of the execution plan in full. Regenerate its
task-scoped brief if needed:

```powershell
& 'D:\hermes\git\bin\bash.exe' `
  'C:/Users/Administrator/.codex/skills/subagent-driven-development/scripts/task-brief' `
  'docs/superpowers/plans/2026-08-13-real-task-alpha-a-execution.md' 5
```

Task 5 owns only:

- `src/tianwen/alpha_runtime.py`
- the specified `RunManifest` fields in `src/tianwen/domain.py`
- the specified reusable runtime seams in `src/tianwen/runtime.py`
- `tests/integration/test_alpha_runtime.py`
- the specified compatibility additions in `tests/integration/test_runtime.py`

The runtime must expose file tools, the frozen Champion Skill and
controller-selected named checks, but no shell, process or web tools. It
must call the existing Docker executor and workspace projection rather than
reimplementing either boundary.

After Task 5 implementation:

1. run its focused tests and Ruff;
2. commit only its owned files;
3. perform an independent task-scoped review;
4. fix every Critical/Important finding before starting Task 6.
