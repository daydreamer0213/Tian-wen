# DeepSeek Harness probe Task 8 handoff

**Date:** 2026-08-14

**Status:** blocked — the Task 8 implementation and controlled observations
are complete, but the real sandbox gate failed its load-bearing read-only
classification contract

**Branch target:** `codex/deepseek-harness-probe`

**Starting local and remote SHA:**
`a3706515b72f7875ed7bd053f98ea78a6b97858b`

**Implementation commits:**

- `d60993785386a05122ef45899d0bd83ec1ddc7e4`
  `test: probe local harness sandbox boundary`
- `5582010db669caf170169acd8489ebb1e73522db`
  `fix: harden sandbox probe path cleanup`

The controlling handoff carries the final local and remote SHA because this
document cannot identify the commit that contains itself.

This result proves only the Task 8 compatibility outcome. It does not start
Task 9, authorize a Tianwen-on-DSH migration, change any Goal, Evidence,
Evaluator, Evolution, Python, Runtime, UI, package, dependency version, or
Alpha Task 10 boundary.

## Baseline and document provenance

Before implementation:

- local `HEAD` and remote
  `origin/codex/deepseek-harness-probe` both resolved exactly to
  `a3706515b72f7875ed7bd053f98ea78a6b97858b`;
- the Codex-managed worktree was detached, clean, and already isolated;
- no merge, rebase, baseline change, nested worktree, force push, or global
  Git configuration change was made.

As recorded by Task 7, the probe baseline contains its canonical handoff but
not the three canonical architecture/spec/plan files. The following were read
without copying, cherry-picking, or changing the baseline from the clean
repository checkout at `D:\Guo\zuochong\AGi`:

- `docs/architecture-master-session-memory.md`;
- `docs/superpowers/specs/2026-08-14-deepseek-harness-runtime-selection-design.md`;
- Task 8 only from
  `docs/superpowers/plans/2026-08-14-deepseek-harness-compatibility-probe.md`.

The baseline-local
`docs/operations/deepseek-harness-probe-task-7-handoff.md` was read in full.

## Implemented scope

Task 8 changes only:

- `vitest.config.ts`;
- `tests/dsh-probe/sandbox.e2e.spec.ts`;
- this canonical handoff.

`vitest.config.ts` no longer hard-excludes the sandbox file. The file is now
discoverable, while both explicit sandbox tests use:

```ts
const runSandbox = process.env.TIANWEN_RUN_DSH_SANDBOX === '1'
const describeSandbox = runSandbox ? describe : describe.skip
```

Default `pnpm.cmd run test:dsh` therefore discovers and skips the real gate.

No sandbox abstraction, provider wrapper, policy framework, fallback runner,
Docker integration, network call, model call, dependency, or production code
was added.

## Real provider and process boundary

The test imports only public package roots and mounts:

```text
@deepseek-ai/cordis Context
@deepseek-ai/dsh-sandbox-local LocalSandboxProvider
@deepseek-ai/dsh-sandbox public ConfinedArgv / RunnerFailureRule types
@deepseek-ai/dsh-session SessionId
```

Every confined command uses:

```text
process.execPath
-e
require("node:fs").writeFileSync(process.argv[1], "probe")
<fixed target path>
```

The returned `confined.argv[0]` and `confined.argv.slice(1)` are spawned with:

- `shell: false`;
- a fixed 15-second timeout;
- `cwd` equal to the disposable workspace;
- a minimal environment containing only `SystemRoot`, `WINDIR`, `TEMP`, and
  `TMP`;
- no model key, DSH home, user profile, credentials, repository path, shell
  command string, Docker, or network input.

There is no `danger-full-access` or unconfined fallback.

## D-drive path boundary

The only fixed probe locations are:

```text
D:\DevData\tianwen-dsh-probe
D:\DevData\tianwen-dsh-probe\sandbox
D:\DevData\tianwen-dsh-probe\sandbox-report.json
```

Each explicit test uses a unique `mkdtempSync` child under `sandbox`.
Workspace, private temp root, read-only target, workspace-write target, and
sibling target all remain inside that unique child.

Before creating a sandbox child, deleting a report, or asking the provider to
materialize ACL grants, the test requires:

- the fixed probe root to be a real directory;
- `realpathSync.native(root)` to equal the exact intended D-drive path;
- the sandbox directory to pass the same check;
- reparse points, symlinks, and junction redirection to be rejected.

An opt-in RED/GREEN regression creates a junction only between two disposable
directories inside the D-drive sandbox root and proves the guard rejects it.

The old report is invalidated after canonical-root validation and before the
environment-variable check, so a wrong opt-in environment cannot leave a
stale passing report.

Provider disposal, `TEMP`/`TMP` restoration, and unique-child cleanup are
attempted independently. A gate failure remains the primary error rather than
being replaced by a cleanup error.

## Failure classifier

The classifier follows the published `ConfinedArgv` contract:

1. reject exit `0` and missing exit codes as runner-failure candidates;
2. apply each `runnerFailureRule.allowedExitCodes`;
3. remove `informationalLines` only by case-insensitive exact full-line
   equality;
4. match `fatalSignatures` only on the remaining lines;
5. only if no runner failure matched, compare stderr with the selected
   backend's own `denialSignatures`.

It does not use a cross-backend signature union. A nonzero exit alone is
never classified as a sandbox denial.

## Actual controlled observations

Actual provider:

```text
@deepseek-ai/dsh-sandbox-local@0.1.0-rc.6
```

Actual host and provider enforcement:

```text
platform: win32
enforcement: partial
```

### Read-only workspace write

Observed:

```text
exitCode: 1
runner failure: false
target exists: false
stderr: Error: EPERM: operation not permitted, open '<D-drive target>'
```

The selected Windows backend returned only:

```text
access is denied
access to the path
permission denied
```

`EPERM: operation not permitted` matches none of those published backend
denial signatures. Under the Task 8 contract this is not sufficient proof of
a sandbox denial, even though the file was absent and the process exited
nonzero.

Classification:

```text
readOnlyWorkspaceWrite: not-proven
gate: failed
```

The test deliberately remains red at the denial-signature assertion. It does
not add `operation not permitted` locally because doing so would stop using
the current backend's own denial dialect.

### Workspace-write inside root

Observed:

```text
exitCode: 0
runner failure: false
content: probe
```

Classification:

```text
workspaceWriteInsideRoot: allowed
```

### Sibling write

The sibling attempt ran through the same selected backend with no
runner-failure classification. Because Windows enforcement is `partial`, the
test does not promote any sibling outcome to strong isolation.

Classification:

```text
outsideRootProtection: not-proven
highRiskRecommendation: use-container-remote-or-microvm
```

An unexpected Windows `full` result is rejected for compatibility review
instead of being silently accepted.

## Machine-readable report

Path:

```text
D:\DevData\tianwen-dsh-probe\sandbox-report.json
```

SHA-256 after the controlled gate:

```text
c40b418a8191a71389e921bbe7a3d5bbf977861388803e9df5297441f098e7d0
```

Content:

```json
{
  "schemaVersion": "tianwen.dsh_sandbox_probe.v1",
  "platform": "win32",
  "provider": "@deepseek-ai/dsh-sandbox-local@0.1.0-rc.6",
  "enforcement": "partial",
  "readOnlyWorkspaceWrite": "not-proven",
  "workspaceWriteInsideRoot": "allowed",
  "outsideRootProtection": "not-proven",
  "highRiskRecommendation": "use-container-remote-or-microvm"
}
```

## TDD evidence

Initial Task 8 RED, before changing `vitest.config.ts`:

```text
No test files found, exiting with code 1
filter: tests/dsh-probe/sandbox.e2e.spec.ts
exclude: tests/dsh-probe/sandbox.e2e.spec.ts
```

Removing the one hard-exclude line made the real provider test discoverable.
Its first controlled execution then exposed the load-bearing rc.6 denial
dialect mismatch instead of producing a false GREEN.

The review repair wave added a separate path-safety RED:

```text
ReferenceError: assertCanonicalDirectory is not defined
1 failed, 1 skipped
```

After the minimal native-realpath guard:

```text
1 passed, 1 skipped
```

The final explicit real gate result is intentionally:

```text
1 passed, 1 failed
failed assertion: expected the selected backend denial signature to match
```

There is no accepted Task 8 GREEN because the compatibility gate itself did
not pass.

## Independent review

Initial fresh scoped reviewer:

```text
01a00045-4ba4-77d3-a670-2b6803a31234
Critical: 1
Important: 2
Minor: 0
Ready: No, with fixes
```

The bounded repair wave closed:

- junction/reparse redirection before ACL grants;
- stale report survival on a wrong environment;
- cleanup leakage or masking of the primary gate failure.

Fresh narrow re-review:

```text
01a0004c-2ee7-7f62-8530-526eed6819b9
Critical: 0
Important: 1
Minor: 0
Ready: No, with fixes
```

The remaining Important is the load-bearing compatibility result:
rc.6's selected Windows backend does not publish the Node 22 denial signature
actually observed. Closing it requires an upstream release or supported
runner whose published dialect matches the real denial. Changing dependency
versions, provider implementation, or backend signatures is outside Task 8
and is explicitly forbidden here.

No implementation Critical or Important remains. The Task 8 gate Important
remains open, so the task is blocked rather than accepted.

## Verification evidence

Explicit real sandbox focused gate:

```text
1 file failed
1 test passed, 1 test failed
expected failure: read-only denial signature not proven
```

Default Tasks 0–8 Node suite with the environment switch removed:

```text
8 files passed, 1 file skipped
63 tests passed, 2 tests skipped
```

Dependency closure and public surfaces:

```text
187 installed DSH packages at 0.1.0-rc.6
15 checked public surfaces
0 private-import violations
```

TypeScript workspace typecheck:

```text
exit 0
```

Offline frozen pnpm install:

```text
exit 0
already up to date
0 downloads
D:\DevData\pnpm-store
D:\DevData\tianwen-dsh-probe\virtual-store-task-8
```

The command used `--trust-lockfile`, matching the Task 7 audited installation
path. Without that command-scoped flag, pnpm 11.20.0 materialized zero
downloads but exited on its global minimum-release-age policy for the already
locked rc.6 packages. No global policy or Git configuration was changed.

Python A1 author proof:

```text
1 passed, 9 deselected
```

Full Python pytest:

```text
424 passed, 4 skipped
```

The skips are the paid live-model probe, two unavailable Windows symlink
cases, and the separately covered Windows ACL case.

Ruff:

```text
All checks passed
```

`git diff --check`:

```text
exit 0
```

All Python environment, cache, bytecode, and temp data used for final
verification are on D:

```text
D:\DevData\uv-cache
D:\DevData\tianwen-dsh-probe\venv-task-8
D:\DevData\tianwen-dsh-probe\pycache-task-8
D:\DevData\tianwen-dsh-probe\temp-task-8
```

One automatically generated C-drive `.venv` was detected immediately after
the first Python run, moved off C, then rebuilt natively at the D-drive path
because Windows uv trampolines are not relocatable. No C-drive `.venv`
remains.

## Forbidden-effect audit

This Task 8 run used:

```text
paid model requests: 0
live web/search requests: 0
real Docker invocations: 0
interactive DSH sessions: 0
private DSH source imports: 0
unconfined fallback attempts: 0
danger-full-access attempts: 0
dependency-version changes: 0
writes outside the repository and D:\DevData\tianwen-dsh-probe: 0
```

The repository itself was only changed in the three allowed Task 8 files.

## Blocker and next boundary

Task 8 cannot be accepted on the current exact
`@deepseek-ai/dsh-sandbox-local@0.1.0-rc.6` and Node `22.23.1` Windows
combination because the required backend-owned denial proof is absent.

Do not repair this by:

- accepting any nonzero exit;
- adding a local cross-backend or Node-specific denial signature;
- falling back to an unconfined process;
- using `danger-full-access`;
- changing the locked DSH dependency in this task;
- starting Docker, network, a model, Task 9, migration, or Alpha Task 10.

The architecture controller must decide whether to wait for/review an upstream
DSH release or authorize a separate compatibility plan for a supported
runner. Task 9 remains frozen.

This probe does not make Tianwen production-ready and does not authorize full
migration.
