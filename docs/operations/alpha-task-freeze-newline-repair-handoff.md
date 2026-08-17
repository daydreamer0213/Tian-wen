# Alpha task freeze newline repair handoff

Date: 2026-08-14

## Status and scope

The infrastructure repair is implemented, independently reviewed, and fully
verified. Task 8 is ready for controller re-acceptance after the final pushed
SHA is checked. Task 9 remains frozen and was not started. The repair changes
only the `freeze_task_bundle()` write boundary and adds unit coverage; it does
not change any Alpha task package, task authority, serialization, dependency,
runtime, or source/model boundary.

## Root cause

`freeze_task_bundle()` builds canonical JSON with
`json.dumps(..., separators=(",", ":")) + "\n"`. On Windows, its final
`Path.write_text(..., encoding="utf-8")` write used text I/O and converted that
LF to CRLF. A pre-frozen LF-only `task.json` therefore changed during its first
re-freeze. `load_task_bundle()` includes the literal `task.json` bytes in the
full task entries, so the conversion changed `task_bundle_digest`; the
model-input entries exclude `task.json`, so `model_input_digest` did not drift.

The repair retains the exact serializer and validation flow, but writes
`serialized.encode("utf-8")` with `Path.write_bytes(...)` at the final boundary.
This preserves the canonical LF bytes across platforms.

## TDD evidence

The new regression creates an explicit canonical LF-only `task.json` with all
derived fields populated before the behavior under test. It checks bytes,
SHA-256, Git-compatible blob identity, full bundle digest, model-input digest,
no CR bytes, and exactly one trailing LF before the first freeze and after the
first and second freezes.

RED before the production edit, with the required offline D: environment:

```powershell
$env:UV_CACHE_DIR='D:\DevData\uv-cache'
$env:UV_PROJECT_ENVIRONMENT='D:\DevData\uv-envs\tianwen-alpha-freeze-repair'
$env:UV_OFFLINE='1'
uv run pytest tests\unit\test_alpha_tasks.py -q -k canonical_lf_bytes
```

```text
1 failed, 16 deselected in 0.35s
assert ... b'...\n' == b'...\r\n'
At index 1283 diff: b'\n' != b'\r'
```

This is the expected first-freeze byte conversion failure, not a test setup,
import, or validation error.

GREEN after the one-line production edit:

```text
uv run pytest tests\unit\test_alpha_tasks.py -q -k canonical_lf_bytes
1 passed, 16 deselected in 0.24s

uv run pytest tests\unit\test_alpha_tasks.py -q
15 passed, 2 skipped in 0.79s
```

The two skips are the existing Windows-account symlink privilege tests.

## Clean A1-A3 first- and second-freeze proof

A detached worktree at
`D:\DevData\tianwen-alpha-freeze-repair-final-e45e1d2` was created from the
repair commit with `core.autocrlf=false`. For every package, the checked-out
`task.json` exactly matched the committed bytes before freezing, contained no
CR, and ended in exactly one LF. The worktree remained clean after both
freezes.

| Task | Stable file SHA-256 | Stable Git blob | Stable task bundle | Stable model input |
| --- | --- | --- | --- | --- |
| A1 | `69b29a8c4ecc19d4350d91bf5c9151f918de7e96ce679fa1e8da73c1d484eb2c` | `1ff0f936b9d4c22b27012cfb9312a8c46bf70083` | `sha256:15e08373a535c14bb0de636724170afb05cbb2e8ace1f91ca53bc877f73184d0` | `sha256:b8f76aae549aeca56d9a4749aa188788648fc0fae578f422c85cfb6da28eb490` |
| A2 | `2df6d3107308fbea1d8c7650d44a020a5e8e29329efce016ac7760db2164d989` | `2f1eb8871ed7c46b9ec751b03daf10d5c24204b1` | `sha256:461bb90c1de9b45b18c4c956b7c2bbd326d9aa4a6dd7bfaae88a9a83ae0a84f1` | `sha256:39fa759cca124bdb2d612ce3cfe24ce391332152c52560e303d88e72095c049e` |
| A3 | `445b33029b793c238fb4dd97a4e01d9670dd6f2bf0b92802e89897fe70dd42ee` | `7739f4b33817eb5db8d6e9f9a3dfad8d39ae1b8b` | `sha256:7f36109f813d5f0674d91c5498bdb13e1c1b986d2bf45ead99b677b75860c54e` | `sha256:d0828aede8948bcf97b32154ce7cce131edb5dced8425af32cc058831fc5d5de` |

Each value above was identical before freeze, after the first freeze, and
after the second freeze. `git hash-object --no-filters` also matched each
listed Git blob.

## Final verification

All commands used `UV_CACHE_DIR=D:\DevData\uv-cache`,
`UV_PROJECT_ENVIRONMENT=D:\DevData\uv-envs\tianwen-alpha-freeze-repair`, and
`UV_OFFLINE=1`.

- New regression: `1 passed, 16 deselected`.
- Complete `tests/unit/test_alpha_tasks.py`: `15 passed, 2 skipped`.
- A1-A3 author proof: `5 passed`.
- Task 8 A3 focused proof: `3 passed, 34 deselected`.
- Related task authority, exploration, and trial tests:
  `93 passed, 2 skipped`.
- Full offline suite: `419 passed, 4 skipped`.
- `uv run ruff check .`: `All checks passed!`.
- `git diff --check 4fa585888bd18dc9b9cb45e67c1b352505771f78..HEAD`:
  exited `0` with no diagnostics.

The four full-suite skips are the opt-in paid live probe, two
Windows-account symlink privilege cases, and the Windows ACL case tested
separately. No network, paid model, or real Docker Engine was used.

## Independent review and commits

The independent scoped reviewer approved specification compliance and task
quality with no Critical, Important, or Minor findings. It specifically
confirmed the pre-first-freeze fixture, Git-compatible blob calculation,
first/second bundle bindings, pre-freeze authoring coverage, and truthful Task
8 handoff correction.

- Repair commit: `e45e1d2960d93fed38615b0c16060bd7237b4c3a`
  (`fix: preserve canonical alpha task newlines`).
- Final evidence commit and pushed remote SHA: recorded in the structured
  controller handoff after the ordinary fast-forward push and `ls-remote`
  check.

## Residual risk and recommendation

Residual repair risk is low: the production change is one final-boundary byte
write, and both authoring-form and frozen-form paths are covered. The repair
does not change authority fields or package contents.

After the controller confirms the final pushed SHA, Task 8 should be
re-accepted. Task 9 may then start only in a new independent implementation
session; this repair session must not start it.
