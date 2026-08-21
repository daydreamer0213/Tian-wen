# Tianwen installer machine-readable transport implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` with TDD,
> `verification-before-completion`, `requesting-code-review`, and Ponytail.
> Preserve the one-attempt operational stop line.

**Goal:** Make the official pnpm package entry expose the existing installer
safe JSON receipt without lifecycle presentation contaminating its stdout.

**Architecture:** Keep the installer untouched. The native-Windows installer
test uses the native Windows shell to resolve the actual `pnpm` command from
PATH with `--silent run`, then locks the documented machine command in the
existing handoff and public repository contract.

**Tech stack:** Existing pnpm 11.20.0 package script, Node.js `spawnSync`,
native-Windows Vitest installer contract, and the existing Python public
repository contract.

## Global constraints

- Base main: `6178f1acb5fd26e9fc679f484eddc88db0a37b92`.
- Canonical design:
  `docs/superpowers/specs/2026-08-22-tianwen-installer-machine-readable-transport-design.md`.
- DSH `0.1.0-rc.7` remains the only product Agent Runtime.
- Reuse the existing D-drive worktree, node_modules, Corepack and pnpm store;
  do not create another clone, worktree, node_modules, Profile, or probe, and
  do not install, download, or relink dependencies.
- Do not modify `package.json`, the lockfile, workflow, installer source,
  Runtime/DSH code, receipt schemas, transaction, or dependencies.
- No product installer, Goal, manifest, model selection, Provider, paid token,
  Docker, Alpha, runtime-profile, price lookup, price snapshot, budget store,
  retry, production/operational raw-output retrieval, ordinary fallback,
  commit on main, or CI dispatch occurs during Tasks 1–3.
- The implementation range is exactly:
  `tests/dsh-migration/tianwen-installer.spec.ts`,
  `docs/operations/tianwen-rc6-rc7-managed-install-migration-handoff.md`, and
  `tests/contracts/test_public_repository_surface.py`.
- Reuse only the existing public-contract interpreter
  `D:\DevData\tianwen-task5-ci-fresh-433fc0d\.venv\Scripts\python.exe`.
  Check that it is a leaf and imports `pytest` and `ruff` before using it. If it
  is absent or unsuitable, record local Python as unavailable and leave
  exact-main Python CI bearing; do not create or synchronize an environment.

---

### Workspace setup and baseline stop gate

- [ ] Require a clean implementation worktree derived from the exact base, its
  tracking/remote agreement, and the existing `node_modules/.modules.yaml`.
  Set only `pnpm_config_verify_deps_before_run=false`; do not install or
  relink.
- [ ] Confirm the native installer fixture root is empty. Run the existing
  native contract once:

  ```powershell
  pnpm exec vitest run tests/dsh-migration/tianwen-installer.spec.ts
  ```

  It must pass. Any unrelated baseline failure is a stop line.
- [ ] Establish the conditional Python gate once without creating an
  environment:

  ```powershell
  $existingPython = 'D:\DevData\tianwen-task5-ci-fresh-433fc0d\.venv\Scripts\python.exe'
  if (Test-Path -LiteralPath $existingPython -PathType Leaf) {
    & $existingPython -c 'import pytest, ruff'
    if ($LASTEXITCODE -ne 0) { throw 'existing Python lacks public-contract gates' }
  } else {
    Write-Output 'local Python public contract unavailable; exact-main CI remains bearing'
  }
  ```

### Task 1: RED/GREEN — canonical silent pnpm transport

**Files:**

- Modify: `tests/dsh-migration/tianwen-installer.spec.ts`

- [ ] RED: add a process-level test inside the existing installer contract.
  Derive a unique fixture-root path through `testRoot`, assert that it does not
  exist, and form one fully controlled command string using only that fixed
  D-drive/UUID root and a fixed sentinel literal. Invoke it through native
  Windows shell PATH resolution with `spawnSync(command, { shell: true, ... })`;
  do not resolve launchers with `npm_execpath`, `where.exe`, launcher parsing,
  or a direct-Node fallback. First invoke the actual package command without
  `--silent`, while asserting the eventual exact safe-receipt contract. The
  test must fail because normal pnpm lifecycle presentation makes stdout more
  than one JSON value; it must not print, persist, redirect, fragment-search,
  or reuse that raw presentation.

  ```ts
  const command = `pnpm run install:tianwen -- --data-dir ${root} --json --${credentialSentinel}`
  const result = spawnSync(command, { shell: true, cwd: resolve('.'),
    encoding: 'utf8', env: { ...process.env,
      pnpm_config_verify_deps_before_run: 'false' } })
  ```

  The eventual assertions are exit 1, `stderr === ''`, a single parsed object exactly
  equal to the existing three-key `managed-layout-preflight` receipt, no
  sentinel in either stream, and `existsSync(root) === false` after the call.
  Temporary capture and whole-stream parsing are permitted only in this
  deterministic fixture test; they must never become product or operational
  wrapper-output handling. Run the installer spec and record this known
  lifecycle-presentation RED.

- [ ] Do not add production code. GREEN changes only that actual package command
  to `pnpm --silent run ...`; the final test therefore locks the official
  machine command rather than a direct Node call. The native installer-windows
  job already supplies pnpm on PATH through its setup action. Re-run the named
  transport test and the installer spec; both must pass and leave every fixture
  root empty.

- [ ] Commit only the test:

  ```text
  test: require silent pnpm installer JSON transport
  ```

### Task 2: RED/GREEN — document and permanently lock the command

**Files:**

- Modify: `docs/operations/tianwen-rc6-rc7-managed-install-migration-handoff.md`
- Modify: `tests/contracts/test_public_repository_surface.py`

- [ ] RED: extend the existing installer handoff/public-contract test to
  require the exact command:

  ```text
  pnpm --silent run install:tianwen -- --data-dir D:\DevData\tianwen --json
  ```

  and the factual boundary that normal pnpm lifecycle presentation is not a
  machine-readable transport. Require that direct Node, raw JSON scanning,
  raw-output retention, and schema changes remain rejected. Run the Python
  public contract conditionally with the exact existing interpreter established
  in workspace setup; if it is unavailable, record that fact without creating
  an environment and leave exact-main Python CI bearing. Otherwise record its
  exact RED failure.

- [ ] GREEN: update only the current migration handoff with the canonical
  command, silent-transport reason, receipt parsing rule, and one-attempt
  stop line. Keep human non-JSON usage unchanged and do not rewrite historical
  frozen plans. Re-run the public contract and `git diff --check`.

- [ ] Commit only the handoff and permanent contract:

  ```text
  docs: specify silent installer JSON transport
  ```

### Task 3: fresh gates, reviews, and feature push

**Files:** no additional files. Only fix demonstrated Critical or Important
findings within Tasks 1–2 using a focused RED/GREEN cycle.

- [ ] Run fresh bearing gates:

  ```powershell
  pnpm exec vitest run tests/dsh-migration/tianwen-installer.spec.ts
  pnpm --filter @tianwen/runtime-bundle... build
  pnpm run typecheck
  pnpm run check:dsh-install
  pnpm run check:no-private-dsh-imports
  & $existingPython -m pytest tests/contracts/test_public_repository_surface.py
  & $existingPython -m ruff check .
  git diff --check
  ```

  The named package-entry transport test and installer spec must pass; all
  fixture roots must finish at zero files/zero bytes. Re-establish
  `$existingPython` with the same leaf/import check from workspace setup before
  running the two Python commands. If it is unavailable, report that local fact
  without creating an environment; exact-main Python remains bearing.

- [ ] Independently review correctness/test intent, architecture/privacy/DSH,
  and Ponytail/YAGNI. Require: actual pnpm entry, `--silent`, no direct-node
  fallback, no raw lifecycle scan/retention, no product code/schema change, and
  no expanded framework. Resolve only demonstrated Critical/Important issues.

- [ ] Ordinary-push the clean feature once, verify local/tracking/`ls-remote`
  equality, and send the supervisor the exact SHA, commits, 3-file audit,
  RED/GREEN evidence, gates, reviews, and resource audit. Stop before main
  integration.

### Task 4: supervisor-only main integration and exact-SHA CI

After separate approval, merge and ordinary-push the exact feature once.
Require the unique automatic push run for the merge SHA to complete with Python,
TypeScript, and `installer-windows` success; the native job must execute the
installer contract including the package-entry transport test. Any failure is a narrow-log stop line: do not rerun
or patch main.

### Task 5: separately authorized single operational attempt

Only after Task 4 exact-main CI succeeds may separate authorization permit one
official offline product installation using exactly:

```powershell
pnpm --silent run install:tianwen -- --data-dir D:\DevData\tianwen --json
```

Consume one canonical ready or three-key failed receipt without raw scanning.
Any other output, nonzero failure, missing durable equality, or failed
zero-Provider preflight stops at zero Provider. Only a ready receipt plus all
existing checks may permit the already-authorized same Goal/manifest natural
resume once; that result never authorizes retries, Candidate, Evaluation,
Shadow, or Promotion.
