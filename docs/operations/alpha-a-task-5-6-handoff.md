# Alpha-A Tasks 5–6 Handoff

Date: 2026-08-13

## Status

- Task 5 is complete and independently reviewed.
- Task 6 has a substantial tested implementation, but the Tasks 5–6 stage is
  **blocked** and is not approved for Task 7.
- Do not start Task 7 until the main controller explicitly accepts a new
  repair plan for the remaining manifest-recovery authority gap.

## Starting point and branch

- Original handoff commit: `5170ad5`
- Intended branch: `codex/alpha-a-real-task`
- Implementation head before the handoff-document commit: `987a8f8`
- The handoff-document commit itself is the next commit after `987a8f8`.
- This worktree is detached because it is managed by the Codex app.

## Task 5: complete

Commits:

- `938111a` — `feat: add shell-free alpha runtime`
- `12e1046` — `fix: bind alpha runtime recovery`
- `1e9863c` — `fix: require sole unknown alpha check`

Implemented:

- schema-v2 Alpha bindings on `RunManifest` with schema-v1 compatibility;
- a shell-free `AlphaRuntime` exposing bounded file tools, frozen
  `repo-task`, and controller-selected `run_check`;
- Goal authorization and pre-effect workspace projection;
- immutable TrialManifest, Skill, model, prompt, policy, tool, and workspace
  validation;
- stable initial checkpoints and exact named-check reconciliation;
- truthful Runtime failure settlement without persisting exception text.

Task-level review:

- Initial review found manifest binding, repeated UNKNOWN recovery, and
  timeout-classification defects.
- Two fix/re-review rounds closed every Critical and Important finding.
- Task 5 scoped re-review passed.

## Task 6: implemented but stage-blocked

Commits:

- `edfc5de` — `feat: orchestrate auditable alpha trials`
- `7a20e3d` — `fix: complete alpha trial settlement`
- `d78fa64` — `fix: close alpha trial recovery gaps`
- `987a8f8` — `fix: close alpha runtime trial integration`

Implemented:

- preview and exact confirmation before Goal creation or model execution;
- immutable TrialManifest, AlphaTrialState, and TrialResult authority;
- A3 governed recorded exploration before execution;
- A5 one Goal/workspace/root budget with two separate Runs and no round-2
  feedback in round 1;
- always-settle behavior for Provider failure, budget/deadline stop, and
  cancellation;
- Git evidence, durable final verification Action/Evidence, sanitized audit
  artifacts, credential scanning, and truthful boundary status;
- durable-stage recovery for prepared, running, settling, and finished
  trials;
- recovery of a `WAITING/unknown_action` Run now stops without another model
  request, Action, check, container, or final-verifier effect;
- initial A5 TrialManifest creation now includes per-round prompt, policy,
  and tool authority.

Task-level review:

- Two fix/re-review rounds closed all Task 6 scoped Critical and Important
  findings.

## Remaining blocking finding

The final Tasks 5–6 re-review still found one Important manifest-recovery
authority gap:

1. `AlphaRuntime` conditionally skips per-round TrialManifest validation when
   both policy and tool snapshots are empty.
2. The persisted `alpha_trial_manifest` can be replaced through the ordinary
   `StateStore.put_object()` path even though it was first written with
   `put_immutable_object()`.
3. `AlphaTrialRunner.resume()` does not bind the recovered manifest digest to
   `AlphaTrialState.trial_manifest_digest` before creating a new Run.
4. A replaced SQLite object plus matching JSON mirror with empty snapshots
   and matching aggregate values can therefore reach a model request.

The one permitted cross-task repair wave fixed the prior Critical UNKNOWN
Action restart, but this Important finding remained in its single scoped
re-review. Per controller instruction, work stopped here instead of opening
another repair wave.

## Verification evidence

Fresh controller verification at `d78fa64`:

```powershell
$env:UV_CACHE_DIR = 'D:\DevData\uv-cache'
uv run pytest -q
uv run ruff check .
git diff --check
```

Results:

- `406 passed, 4 skipped in 110.86s`
- Ruff: `All checks passed!`
- whitespace check: passed
- worktree: clean

Cross-task repair commit `987a8f8` verification:

- focused recovery/manifest tests: `3 passed`
- Alpha Runtime + Trial integrations: `41 passed`
- Task 6 combination: `87 passed`
- Alpha boundary tests: `42 passed`
- Ruff and `git diff --check`: passed
- pytest printed `409 passed, 4 skipped in 118.09s`; the outer command
  wrapper returned timeout only after the complete pytest summary.

No network, paid model, or real Docker execution was used.

Expected skips:

- paid DeepSeek live probe;
- two symlink tests because this Windows account lacks symlink privilege;
- the Windows ACL case tested separately.

## Deferred Minor findings

These were explicitly triaged as Minor by the stage review:

- an invalid Alpha round configuration fails generically instead of being
  rejected explicitly;
- `TrialResult`'s model-level unresolved-action invariant relies on a
  caller-provided failure category, although the real settlement path scans
  persisted Actions independently.

## Recovery artifacts

The SDD workspace is git-ignored and contains the detailed implementation,
review, and repair evidence:

```text
.superpowers/sdd/2026-08-13-real-task-alpha-a-execution/
```

Important files:

- `progress.md`
- `task-5-report.md`
- `task-6-report.md`
- `final-fix-report.md`
- `review-5170ad5..d78fa64.diff`
- `review-d78fa64..987a8f8.diff`

`task-6-report.md` contains an inaccurate Fix Round 1 description from a
formatting-only takeover agent. `final-fix-report.md` explicitly corrects
that history; this handoff document is the canonical stage summary.

## Recommended next entry

Do not start Task 7.

The main controller should first decide and approve a narrowly scoped repair
for immutable TrialManifest recovery authority. The repair needs, at minimum:

1. mandatory non-empty per-round policy/tool snapshots for schema-v1 Alpha
   TrialManifests;
2. aggregate digest validation plus exact current-round validation;
3. `AlphaTrialState.trial_manifest_digest` binding on every resume;
4. a storage rule preventing ordinary mutable replacement of an existing
   immutable `alpha_trial_manifest`;
5. tests for replacing both SQLite authority and JSON mirror with empty or
   self-consistent forged snapshots before a new model request.

After that repair, rerun the focused integrations, the full offline gate,
Ruff, whitespace check, and one independent scoped re-review before Task 7.
