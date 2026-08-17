# Alpha-A Task 8 Handoff

Date: 2026-08-14

## Status

- Task 8 is controller-acceptance-pending the canonical-freeze newline repair.
- A3 remains authored as a source-grounded compatibility task; its existing
  package bytes are not changed by this repair.
- Its one official Python API fact is consumed through the existing recorded
  exploration path and reaches the execution model only as governed,
  escaped untrusted Evidence.
- A3 proves deterministic Nop `not_met`, Oracle `met`, and exact raw-stdout
  repeatability.
- Independent task-scoped review approved both specification compliance and
  code quality with no Critical, Important, or Minor findings.
- Task 9 remains frozen and was not started.

## Branch and commits

- Required starting ref: `origin/codex/alpha-a-real-task`
- Verified starting SHA:
  `5e02d77aeab0ea264b94e1135eacabff6553a91c`
- Task 8 implementation commit:
  `43eebed610e604edf7d7154f31ca89df6bd398a3`
  (`test: add source-grounded alpha compatibility task`)
- First handoff-document commit:
  `cc4d1ff86dc803620334500d598cc856c728bc11`
  (`docs: hand off alpha task eight`)
- A docs-only correction commit may follow the first handoff-document commit.
  Its final pushed SHA is supplied post-push.
- Intended remote branch: `codex/alpha-a-real-task`
- This Codex-managed worktree is detached. This canonical document records
  all pre-push evidence. The post-push structured controller handoff records
  the final commit, pushed HEAD, and `ls-remote` result.

## Exact scope

The implementation commit creates only:

```text
alpha/tasks/A3/checks/public.py
alpha/tasks/A3/instruction.md
alpha/tasks/A3/reference/solution.patch
alpha/tasks/A3/seed/query.py
alpha/tasks/A3/sources/fetched_page.md
alpha/tasks/A3/sources/search_results.json
alpha/tasks/A3/task.json
alpha/tasks/A3/verifier/verify.py
```

It modifies only:

```text
tests/alpha/test_task_packages.py
tests/integration/test_alpha_trial.py
```

The staged package parameterization is now exactly:

```python
TASK_IDS = ("A1", "A2", "A3")
```

A4/A5 were not prefilled or fabricated. No runtime, dependency, A1/A2,
Task 1–7, A4/A5, or deferred-Minor file was changed. The only additional
tracked file in the final handoff commit is this document.

## Frozen A3 authority

A3 uses:

- `schema_version="tianwen.alpha_task.v1"`;
- `task_id="A3"` and `task_version="1.0.0"`;
- one `round-1` and one named `public` check;
- one writable file, `query.py`;
- only the Python standard library in seed and reference solution;
- the common Task 7 small-task limits and protected patterns;
- image digest
  `sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7`;
- no feedback and no live web tool.

Its one source is the short project-authored factual recording:

```text
URL: https://docs.python.org/3/library/urllib.parse.html
Retrieved: 2026-08-13
Search digest:
  sha256:db5b66aebe553d3e13e144e85e780b3b960127b836d05c02a136b787df6e9edb
Fetched-content digest:
  sha256:3a68852bc5741c495bfe5bee65b33831730b877de211917ab5ae9fa97f2e3374
```

It records only the API fact that
`urllib.parse.urlencode(..., doseq=True)` expands sequence-valued elements
into repeated parameters while preserving item order. It is not a copied
documentation page and grants no controller authority.

The exact reference change is the one-line standard-library fix:

```python
return urlencode(parameters, doseq=True)
```

The committed LF object loaded from a clean `core.autocrlf=false` worktree has:

```text
Task bundle:
  sha256:7f36109f813d5f0674d91c5498bdb13e1c1b986d2bf45ead99b677b75860c54e
Model input:
  sha256:d0828aede8948bcf97b32154ce7cce131edb5dced8425af32cc058831fc5d5de
Task JSON Git object:
  7739f4b33817eb5db8d6e9f9a3dfad8d39ae1b8b
```

The task-bundle digest differs from the model-input digest because checks,
the final verifier, and the reference solution are frozen in the full bundle
but excluded from model input.

## Recorded exploration and model boundary

The integration proof executes the real A3 package and verifies:

- recorded search and fetch use the exact frozen docs.python.org URL;
- exploration produces a succeeded Action plus linked `SourceRecord` and
  `EvidenceRecord`;
- Evidence provenance points to the matching SourceRecord;
- exploration completes before the first execution-model `run_started`
  event;
- the execution-model request contains the source URL, the escaped
  `<UNTRUSTED_SOURCE_DATA ...>` envelope, and the `doseq=True` fact;
- it does not contain the content of `checks/public.py`,
  `verifier/verify.py`, or `reference/solution.patch`;
- the frozen execution tool contract contains neither `web_search` nor
  `web_fetch`;
- the runtime remains shell-free.

The source files therefore do not masquerade as trusted controller
instructions. They enter model context only after the recorded
`recorded_search_tool` / `recorded_fetch_tool` /
`ExplorationEngine` path creates governed source and evidence records.

## TDD evidence

The replacement implementer preserved the in-progress A3 directory under
`D:\DevData`, temporarily removed only that exact directory from the
worktree, and ran:

```powershell
uv run pytest tests\alpha\test_task_packages.py `
  tests\integration\test_alpha_trial.py -q -k A3
```

Initial RED:

```text
3 failed, 34 deselected in 1.15s
```

All three failures were specifically `AlphaTaskError: missing directory:
...\alpha\tasks\A3`; there was no syntax or import failure.

After restoring and implementing A3, the focused test passed. A strengthened
assertion then reproduced how the actual captured model message applies an
additional representation-escaping layer; after the minimal assertion fix,
the final focused GREEN was:

```text
3 passed, 34 deselected in 2.57s
```

The main controller independently reran the same focused command and obtained:

```text
3 passed, 34 deselected in 3.31s
```

No network, paid model, or real Docker Engine was used.

## Nop, Oracle, and raw repeatability

Each verifier was run twice before and twice after bounded
`git apply --whitespace=nowarn` in separate mutation workspaces under
`D:\DevData`. Both raw stdout values were identical for every state.

| Task | Nop | Oracle | Raw repeatability |
| --- | --- | --- | --- |
| A1 | `1/7`, `not_met` | `7/7`, `met` | exact for both |
| A2 | `0/7`, `not_met` | `7/7`, `met` | exact for both |
| A3 | `3/6`, `not_met` | `6/6`, `met` | exact for both |

A3 Nop raw stdout:

```json
{"failed_checks": ["list_repeats_key_in_order", "mixed_mapping_preserves_order", "tuple_repeats_key_in_order"], "failure_categories": ["behavior_mismatch"], "passed_checks": ["input_unchanged", "string_is_scalar", "urlencode_escaping"], "summary": "3/6 checks passed", "verdict": "not_met"}
```

A3 Oracle raw stdout:

```json
{"failed_checks": [], "failure_categories": [], "passed_checks": ["input_unchanged", "list_repeats_key_in_order", "mixed_mapping_preserves_order", "string_is_scalar", "tuple_repeats_key_in_order", "urlencode_escaping"], "summary": "6/6 checks passed", "verdict": "met"}
```

The six final checks cover list order, tuple order, string scalar behavior,
mixed mapping and sequence order, normal space/ampersand escaping, and input
container preservation.

## Historical canonical re-freeze and Windows newline note

Two consecutive `freeze_task_bundle()` calls in the current Windows checkout
produced identical:

```text
Task bundle:
  sha256:a35ed5bd7db95f7634fdc8b91990ecaef1cac955c5ecf3572a8ea7d633a88068
Model input:
  sha256:d0828aede8948bcf97b32154ce7cce131edb5dced8425af32cc058831fc5d5de
Task JSON file SHA-256:
  436D3B6A885502CFBD2C66ECEFD1DF3927B31FB9FCFE174E50406C91593BEA79
Task JSON Git object:
  7739f4b33817eb5db8d6e9f9a3dfad8d39ae1b8b
```

The checked-out repository inherits system `core.autocrlf=true`.
Historically, `freeze_task_bundle()` rewrote `task.json` through Python text
I/O, so a clean LF-only temporary checkout changed its final newline to CRLF
on the first freeze. The JSON fields were unchanged, `git diff` was empty
after Git newline normalization, and `git hash-object` remained exactly the
committed object `7739f4b...`. The second freeze was byte-for-byte stable in
that already-converted state.

That historical result is not a passing canonical re-freeze result: the first
freeze changed the actual task bytes and therefore the load-bearing
`task_bundle_digest`, even though Git's normalized object identity was stable.
The Task 8 infrastructure repair must preserve LF-only bytes, digest, and
bundle binding from the first freeze onward. Historical test and push evidence
above is preserved; repair-specific evidence is recorded separately.

For tests that load frozen A1/A2 bytes, final verification used the
LF-only worktree `D:\DevData\tianwen-alpha-task8-final` created with
`git -c core.autocrlf=false worktree add`. No A1/A2 file was edited or
re-frozen.

## Fresh final verification

Environment:

```powershell
$env:UV_CACHE_DIR='D:\DevData\uv-cache'
$env:UV_PROJECT_ENVIRONMENT='D:\DevData\uv-envs\tianwen-alpha-task8-final'
$env:UV_OFFLINE='1'
```

Focused A3:

```powershell
uv run pytest tests\alpha\test_task_packages.py `
  tests\integration\test_alpha_trial.py -q -k A3
```

Result: `3 passed, 34 deselected in 3.64s`.

Complete A1–A3 author proof:

```powershell
uv run pytest tests\alpha\test_task_packages.py -q
```

Result: `5 passed in 1.25s`.

Related task authority, exploration, and trial tests:

```powershell
uv run pytest tests\unit\test_alpha_tasks.py `
  tests\unit\test_exploration.py `
  tests\integration\test_alpha_trial.py -q
```

Result: `92 passed, 2 skipped in 41.10s`.

The two skips are the expected Windows-account symlink privilege cases.

Full offline suite:

```powershell
uv run pytest -q
```

Result: `418 passed, 4 skipped in 117.47s`.

Expected skips:

- the opt-in paid DeepSeek live probe;
- two Windows symlink tests because this account lacks symlink privilege;
- the Windows ACL case tested separately.

Static and committed-range checks:

```powershell
uv run ruff check .
git diff --check 5e02d77aeab0ea264b94e1135eacabff6553a91c..HEAD
```

Results: `All checks passed!`; committed-range diff check exited `0` with no
diagnostics.

## Independent review

The independent task-scoped reviewer read the Task 8 brief, implementation
report, and complete diff from the exact starting SHA through the
implementation commit. Verdict:

- specification compliant;
- task quality approved;
- Critical: none;
- Important: none;
- Minor: none.

Fix Round 1 was limited to clarifying where pre-push evidence and post-push
commit/remote evidence are recorded. It made no production or test behavior
change.

## Product-boundary note

`docs/architecture-master-session-memory.md` is absent from the required base
commit. Its latest historical revision at
`566a027133d123ddc8793831fde6a06366c7ee93` was read only. It was not restored
or modified.

Task 8 remains an Alpha-A real-execution/real-verification proof. It does not
add Challenger generation, Skill mutation, Champion/Challenger comparison,
promotion, canary, rollback, a new runtime, a live web tool, or a dependency.

## Recommended next entry

After the main controller independently verifies the final pushed SHA and
this handoff, Task 9 may start in a new independent implementation session.

This Task 8 session must not and did not start Task 9.
