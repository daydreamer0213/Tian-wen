# DeepSeek Harness probe Task 6 handoff

**Date:** 2026-08-14

**Status:** Task 6 implementation complete, independently reviewed, and ready
for the required fast-forward push

**Branch target:** `codex/deepseek-harness-probe`

**Starting local and remote SHA:**
`ec0d400f946abbfa5c580cb00f39c7c494df06ad`

**Implementation commit:**

- `f136922cfbb6fc860bb5d9081408e11950c0a959`
  `feat: bridge harness trials to python a1 evaluator`

The controlling handoff carries the final local and remote SHA because this
document cannot identify the commit that contains itself.

This result proves only Task 6. It does not start Task 7, authorize a full
Tianwen-on-DSH migration, change Goal/Champion/Candidate policy, change the
Python Alpha runtime, or start Alpha Task 10.

## Implemented scope

Task 6 changed only:

- `packages/tianwen-evaluator-python/package.json`;
- `packages/tianwen-evaluator-python/tsconfig.json`;
- `packages/tianwen-evaluator-python/src/index.ts`;
- `packages/tianwen-evaluator-python/src/protocol.ts`;
- `scripts/dsh_probe_alpha_a1_evaluator.py`;
- `tests/dsh-probe/python-a1-evaluator.spec.ts`;
- the mechanical `packages/tianwen-evaluator-python` importer in
  `pnpm-lock.yaml`;
- this canonical handoff.

No Task 0–5 implementation, A1 task package, seed, reference patch, verifier,
image lock, dependency version, Python Alpha runtime, Goal/Champion/Candidate
policy, Sandbox, approval flow, UI, or Task 7 file was changed.

## Typed protocol and fail-closed validation

`@tianwen/evaluator-python` exports the planned:

- `EvalRequestV1`;
- `EvalReceiptV1`;
- `EvalProtocolError`;
- `parseEvalRequest()`;
- `parseEvalReceipt()`;
- `PythonA1Evaluator`.

Request parsing requires exactly:

- schema `tianwen.eval_request.v1`;
- one canonical UUID;
- task `A1`;
- candidate `nop` or `oracle`;
- exact lowercase `sha256:` task and model digests;
- no extra command, verifier, patch, workspace, or path field.

Receipt parsing requires exactly:

- schema `tianwen.eval_receipt.v1`;
- the same request id, task, and candidate as the request;
- the expected candidate digest;
- the same task and model authorities as the request;
- the SHA-256 digest of the exact raw stdout;
- a receipt verdict equal to the verdict inside raw stdout.

`met` additionally requires the exact frozen A1 seven-check names in their
canonical order, an empty failed-check list, empty failure categories, and
the exact `7/7 checks passed` summary. A self-consistent receipt with seven
invented checks or a non-empty failure category is rejected.

## Frozen A1 authority and real evaluator reuse

Both TypeScript and Python independently bind:

```text
task_bundle_digest =
sha256:15e08373a535c14bb0de636724170afb05cbb2e8ace1f91ca53bc877f73184d0

model_input_digest =
sha256:b8f76aae549aeca56d9a4749aa188788648fc0fae578f422c85cfb6da28eb490
```

The Python worker calls:

```python
load_task_bundle(
    repo_root / "alpha/tasks/A1",
    repo_root / "alpha/environment/image.lock",
)
```

It rejects a request or repository that differs from either exact authority
before resolving Git, creating a candidate workspace, applying a patch, or
running the verifier.

The worker copies only the frozen A1 `seed/`. Nop makes no candidate change.
Oracle applies the exact frozen `reference/solution.patch`. Both candidates
run the exact frozen `verifier/verify.py`. No A1 evaluation logic was
rewritten.

Candidate digests are:

```text
nop =
sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855

oracle =
sha256:321e088cc0b613d8ce321aedac7ee72e4abfec13abed4797dfb4f2501f913eeb
```

## Candidate repeatability

The final focused suite runs each candidate twice through the real bridge and
worker.

Nop:

```text
verdict: not_met
summary: 1/7 checks passed
raw_stdout_digest:
sha256:76f5258a48170161497d032da1e84278f9c831fde595d6c59a3c0f6f28912fc3
```

Oracle:

```text
verdict: met
summary: 7/7 checks passed
raw_stdout_digest:
sha256:e8ab9af5844519a4500727325febed982a82f53b9921068ef66bf45a19ac1e2c
```

The two runs for each candidate produced identical raw stdout and identical
stdout digests. Nop and Oracle produced identical task and model authority
digests. On Windows, verifier stdout is captured as bytes, strictly decoded
as UTF-8 without universal-newline conversion, and retains its original CRLF
ending. The stdout digest is computed from those original bytes.

## Fixed subprocess, path, and environment boundary

The public `evaluateA1()` business input is only `nop` or `oracle`.
Constructor options are trusted control-plane configuration and are narrowed
as follows:

- `repoRoot` must resolve to the current Tianwen worktree;
- the default interpreter remains
  `repoRoot\.venv\Scripts\python.exe`;
- a Windows explicit interpreter must resolve to `Scripts\python.exe` and
  must be either the real repository default or below the fixed D drive probe
  authority;
- `stateRoot` must remain below
  `D:\DevData\tianwen-dsh-probe`.

The fixed Windows probe authority itself must not be a symlink, junction, or
other reparse point and must resolve exactly to itself. The bridge validates
that authority before creating state. It then realpath-validates the
`evaluations` and `workspaces` directories. A regression proves an
`evaluations` junction cannot escape the authority.

The TypeScript bridge directly executes the controlled Python interpreter
with this fixed argv shape:

```text
scripts/dsh_probe_alpha_a1_evaluator.py
--repo-root <current fixed worktree>
--state-root <validated fixed D root descendant>
--request <bridge-owned UUID audit path>
--result <bridge-owned UUID audit path>
```

The worker accepts only those four named arguments. Request JSON cannot add
an argv element or choose a command/path.

Git is resolved once with `shutil.which("git")`, required to be an absolute
file, and retained as that absolute path. Oracle uses:

```text
<absolute git> apply --whitespace=nowarn <fixed solution.patch>
```

The verifier uses:

```text
<sys.executable> -I <fixed verify.py> <worker-owned workspace>
```

All calls use program plus argv, `shell: false` / no shell, captured output,
and timeouts. Worker child environments contain only Windows runtime
variables and D drive TEMP/TMP. The TypeScript worker environment is an
allowlist containing Windows runtime paths, D drive TEMP/TMP, and
`UV_OFFLINE=1`; it does not pass model keys, tokens, secrets, proxy variables,
or `PYTHONPATH`.

Request and result files are retained below the fixed D root for audit.
Result files are atomically replaced as canonical UTF-8 JSON with one LF.
Candidate workspaces are also retained below the fixed D root.

The bridge and worker use no network, Docker, paid model, model credential,
interactive DSH, queue, RPC service, database, general worker platform, or
configurable command layer.

## TDD evidence

The first valid RED was:

```text
pnpm.cmd exec vitest run tests/dsh-probe/python-a1-evaluator.spec.ts
FAIL: Cannot find module
../../packages/tianwen-evaluator-python/src/index.js
```

The failure was caused by the absent Task 6 package and worker.

The initial GREEN produced:

```text
protocol tests: 12 passed
focused bridge tests: 13 passed
```

A path-flow review then identified a possible pre-existing
`evaluations` junction. The dedicated regression failed because the
constructor did not reject the junction. Shared realpath validation for
`evaluations` and `workspaces`, plus an independent worker check, made it
green.

The first independent review identified four load-bearing gaps. New RED tests
proved:

- an arbitrary executable was accepted as `pythonExecutable`;
- a non-current `repoRoot` failed for the wrong reason;
- Windows CRLF stdout was normalized to LF;
- seven invented check names could be reported as `met`;
- a non-empty failure category could be reported as `met`.

The narrowed control-plane paths, byte-preserving stdout, and exact A1
check-set validation made all five regressions green.

Final focused result:

```text
1 file, 18 tests passed
```

## Lockfile and offline replay

The lockfile changes only add the empty new workspace importer and keep the
existing importers sorted.

The planned offline lockfile-only command was attempted. The active pnpm
minimum-release-age policy rejected the 187 already pinned rc.6 packages,
the same baseline limitation recorded by Task 5. The importer was then
generated with the repository's existing `--trust-lockfile` acceptance path,
still offline and using the D drive store.

The final frozen replay was:

```text
pnpm 11.20.0
--offline
--frozen-lockfile
--trust-lockfile
registry=http://127.0.0.1:9/
store=D:\DevData\pnpm-store
virtual-store=D:\DevData\tianwen-dsh-probe\virtual-store-task-6
Already up to date
exit 0
```

## Fresh final verification

Final verification on implementation commit
`f136922cfbb6fc860bb5d9081408e11950c0a959` produced:

```text
@tianwen/evaluator-python build
exit 0

Task 6 focused
1 file, 18 tests passed

Tasks 0–6 Node regression
7 files, 46 tests passed

TypeScript workspace typecheck
exit 0

DSH dependency closure
187 installed packages at 0.1.0-rc.6; 15 public surfaces; 0 violations

Private DSH source import scan
187 installed packages; 15 public surfaces; 0 violations

Offline frozen pnpm install
exit 0; already up to date

Python A1 author proof
1 passed, 9 deselected

Full Python pytest
424 passed, 4 skipped

Ruff
All checks passed

git diff --check
exit 0
```

The four Python skips are the paid live-model probe, two unavailable Windows
symlink cases, and the separately covered Windows ACL case. No paid model,
model key, or real Docker was used.

## Independent review

Fresh scoped reviewer:

```text
019fff8e-3693-7261-9a2d-2e4323649785
Initial: 1 Critical, 3 Important, 1 Minor; Ready: No
```

The Critical concerned arbitrary constructor program/repository selection.
The three Important findings concerned the D authority root itself, CRLF
stdout preservation, and forged seven-check `met` receipts. All Critical and
Important findings were closed with the RED/GREEN changes described above.

Fresh scoped re-review:

```text
Critical: 0
Important: 0
Minor: 1
Ready: Yes
```

The remaining non-load-bearing Minor notes that Python `argparse` accepts
unambiguous long-option abbreviations. It does not permit request command/path
injection or change the fixed argv emitted by the bridge. Under the requested
ponytail policy it is recorded rather than expanded into another test and
change.

## Storage and operational anomaly

The final isolated environment uses:

```text
D:\DevData\pnpm-store
D:\DevData\uv-cache
D:\DevData\tianwen-dsh-probe\virtual-store-task-6
D:\DevData\tianwen-dsh-probe\venv-task-6
D:\DevData\tianwen-dsh-probe\temp-task-6
D:\DevData\tianwen-dsh-probe\pycache-task-6
D:\DevData\tianwen-dsh-probe\task-6-evaluator
```

Before the valid RED, the first bare `pnpm exec` found no worktree
`node_modules` links and automatically attempted an install with the
machine's default C drive store. The install failed the release-age policy
and logged one aborted registry GET; it did not provide test evidence and was
not counted as RED. All later pnpm/UV operations were explicitly offline,
frozen where applicable, and D drive backed.

The failed automatic install left an untracked generated directory:

```text
<probe-worktree>\
node_modules-task6-failed-install
```

It is approximately 295 MB and contains only failed-install dependency data.
The host command policy rejected the exact recursive cleanup command, so the
directory remains safe to delete manually. A partial recoverable quarantine
also exists at:

```text
D:\DevData\tianwen-dsh-probe\
quarantine-node_modules-task6-auto-install-20260814
```

Neither path is tracked by Git or used by the final environment. This is an
operational hygiene item, not a product or evaluation artifact.

## Remaining risks and next boundary

- The evaluator bridge is scoped only to frozen A1 Nop/Oracle. It is not a
  general worker protocol.
- DSH remains pinned to Developer Preview `0.1.0-rc.6`; Task 6 does not prove
  future version compatibility.
- The one argparse abbreviation Minor remains recorded.
- The failed-install C drive directory should be deleted manually when
  convenient.
- Task 7 and Alpha Task 10 remain frozen. The controller must separately
  accept this handoff before authorizing the next task.
