# Alpha-A Task 7 Handoff

Date: 2026-08-14

## Status

- Task 7 is complete.
- A1 Parser and A2 Status are authored as frozen canonical task packages.
- A1 and A2 each prove deterministic Nop `not_met`, Oracle `met`, and exact
  raw-stdout repeatability.
- All independent-review Critical and Important findings are closed.
- One formatting-only Minor remains deliberately deferred and is not
  merge-blocking.
- Task 8 was not started in this implementation session.

## Branch and commits

- Required starting ref: `origin/codex/alpha-a-real-task`
- Verified starting SHA:
  `cc361b2ed16f284576a240fecf198001c1065bdb`
- Task 7 implementation commit:
  `536d02c64fa39ea28120984f8ff8e55cda80274c`
  (`test: add alpha parser and status tasks`)
- Intended remote branch: `codex/alpha-a-real-task`
- This Codex-managed worktree is detached. The handoff-document commit follows
  the implementation commit. The controller handoff records the exact final
  pushed HEAD and `ls-remote` result.

## Exact scope

The implementation commit creates only:

```text
alpha/tasks/A1/checks/public.py
alpha/tasks/A1/instruction.md
alpha/tasks/A1/reference/solution.patch
alpha/tasks/A1/seed/records.py
alpha/tasks/A1/task.json
alpha/tasks/A1/verifier/verify.py
alpha/tasks/A2/checks/public.py
alpha/tasks/A2/instruction.md
alpha/tasks/A2/reference/solution.patch
alpha/tasks/A2/seed/statuses.py
alpha/tasks/A2/task.json
alpha/tasks/A2/verifier/verify.py
tests/alpha/test_task_packages.py
```

No runtime file, dependency, Task 1–6 file, A3–A5 package, public check after
initial authorship, instruction, or seed was changed during review fixes.

The only additional tracked file in the final handoff commit is this document.

## Staged A1/A2 author test

The generic plan test originally listed A1–A5, while Task 7 creates only A1
and A2. The committed test therefore uses the explicit staged tuple:

```python
TASK_IDS = ("A1", "A2")
```

This does not skip or fabricate a package. Later tasks must extend this same
parameterization when the real A3–A5 packages are created, preserving final
A1–A5 acceptance strength.

The author test compares the two raw verifier stdout strings before parsing one
of them for the verdict. It therefore proves exact deterministic output, not
only JSON semantic equality.

## Frozen authority

Both packages use:

- `schema_version="tianwen.alpha_task.v1"`;
- one `round-1` and one named `public` check;
- `timeout_seconds=15` and `output_limit_bytes=65536` for the public check and
  final verifier;
- the exact Task 7 limits and protected patterns;
- one allowed write pattern (`records.py` or `statuses.py`);
- one seed module and no sources;
- only the Python standard library;
- image digest
  `sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7`.

Final loaded digests:

| Task | Task bundle | Model input | Verifier |
| --- | --- | --- | --- |
| A1 | `sha256:8c5eef898ab0d65bdbc758441accc7e0cc221ebacb8ee4b086ef4b91a6a62c81` | `sha256:b8f76aae549aeca56d9a4749aa188788648fc0fae578f422c85cfb6da28eb490` | `sha256:5d581903616a2ef814824d56491c6ec243cb91e71facc5065fa9eb4bd88e951c` |
| A2 | `sha256:dbccb19b1ac5b90a77986048f0fbd2e053b0e32615fc00b7fd64ac1571f992c2` | `sha256:39fa759cca124bdb2d612ce3cfe24ce391332152c52560e303d88e72095c049e` | `sha256:1b2fef55830007219aa69f1f93c47357180e32ffb12bceee1c89c4780962e775` |

Running `freeze_task_bundle()` again for both packages left both committed
`task.json` object hashes unchanged, proving that the checked-in files are the
complete canonical frozen form.

## TDD evidence

Initial RED:

```powershell
$env:UV_CACHE_DIR='D:\DevData\uv-cache'
$env:UV_PROJECT_ENVIRONMENT='D:\DevData\uv-envs\tianwen-alpha-repair-f6f2'
uv run pytest tests\alpha\test_task_packages.py -q
```

Result: `2 failed in 0.39s`, solely because the A1 and A2 task directories did
not yet exist.

The implementation and review fixes retained RED → minimal GREEN evidence for:

- missing A1/A2 packages;
- raw verifier stdout retention before repeatability comparison;
- A1 quoted separators and malformed quotes;
- A1 whitespace after a quoted field before a delimiter;
- A1 escaped quote plus meaningful interior whitespace;
- A1 whitespace after a quoted final field at end-of-record;
- A2 preservation of all known and unknown normalization/label behavior;
- A2 unrestricted `str.strip()` behavior for spaces, tabs, and newlines.

Mutation/reproduction workspaces were self-cleaning temporary directories on
`D:\DevData`; no Trial workspace, network, paid model, or Docker Engine was
used.

## Fresh final verification

Environment:

```powershell
$env:UV_CACHE_DIR='D:\DevData\uv-cache'
$env:UV_PROJECT_ENVIRONMENT='D:\DevData\uv-envs\tianwen-alpha-repair-f6f2'
$env:UV_OFFLINE='1'
```

Focused author and task-authority tests:

```powershell
uv run pytest tests\alpha\test_task_packages.py tests\unit\test_alpha_tasks.py -q
```

Result: `17 passed, 2 skipped in 1.56s`.

The two skips are the expected Windows symlink-privilege cases.

Explicit verifier proof:

- A1 Nop: `1/7`, `not_met`, two raw stdout values identical.
- A1 Oracle: `7/7`, `met`, two raw stdout values identical.
- A2 Nop: `0/7`, `not_met`, two raw stdout values identical.
- A2 Oracle: `7/7`, `met`, two raw stdout values identical.
- Both reference patches applied with
  `git apply --whitespace=nowarn`.

Full offline suite:

```powershell
uv run pytest -q
```

Result: `416 passed, 4 skipped in 115.41s`.

Expected skips:

- the opt-in paid DeepSeek live probe;
- two Windows symlink tests because this account lacks symlink privilege;
- the Windows ACL case tested separately.

Static and range validation:

```powershell
uv run ruff check .
git diff --check cc361b2ed16f284576a240fecf198001c1065bdb..HEAD
```

Results: `All checks passed!`; committed-range diff check exited `0` with no
diagnostics.

## Independent review

The independent task-scoped review initially found three Important issues:

1. parsed-JSON equality did not prove exact raw output;
2. A1 did not fully enforce decoded-field whitespace behavior;
3. A2 under-enforced preservation of its existing APIs.

Main-controller ruling authorized the behavior-preserving fixes within Task 7.
Fix Round 1 closed items 1 and 3 but exposed a non-quote-aware A1 regex.
Fix Round 2 replaced it with a small quote-aware standard-library scan and
closed that issue.

The final whole-Task review found two additional Important boundary gaps:

1. whitespace after a quoted final field at end-of-record;
2. A2 tabs/newlines inherited from unrestricted `str.strip()`.

Fix Round 3 added reproducing RED cases and minimal GREEN changes. The final
scoped re-review verdict was:

- both findings addressed;
- no new Critical or Important breakage;
- no out-of-scope issue;
- fresh focused author proof `3 passed`.

The review cap was three rounds. It was not exceeded. No Critical or Important
finding remains open.

## Deferred Minor

The reference patches remove existing blank separators, so the patched Oracle
source is visually cramped. Both scoped and final review classified this as
formatting-only and non-blocking. The task instructions explicitly prohibited
fixing the deferred Minor in these rounds.

## Product-boundary note

`docs/architecture-master-session-memory.md` is absent from the required base
commit. Its latest historical revision at `566a027133d123ddc8793831fde6a06366c7ee93`
was read only to preserve product boundaries, together with the current plan's
Global Constraints. No historical document was restored or changed.

Task 7 remains an Alpha-A real-execution/real-verification proof. It does not
add Challenger generation, Skill mutation, Champion/Challenger comparison,
promotion, canary, rollback, a new runtime, or a new dependency.

## Recommended next entry

After the main controller independently verifies the final pushed SHA and this
handoff, Task 8 may start in a new independent implementation session.

This Task 7 session must not and did not start Task 8.
