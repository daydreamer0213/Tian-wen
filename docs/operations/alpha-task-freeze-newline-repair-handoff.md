# Alpha task freeze newline repair handoff

Date: 2026-08-14

## Status and scope

Task 8 is controller-acceptance-pending this infrastructure repair. Task 9
remains frozen. The repair changes only the `freeze_task_bundle()` write
boundary and adds unit coverage; it does not change any Alpha task package,
task authority, serialization, dependency, runtime, or source/model boundary.

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

## Controller-finalized fields

- Full-suite verification: pending controller review; not run in this repair.
- Push / remote evidence: pending controller action; no push was performed.
