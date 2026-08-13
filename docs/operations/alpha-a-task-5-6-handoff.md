# Alpha-A Tasks 5–6 Handoff

Date: 2026-08-14

## Status

- Tasks 5 and 6 are complete.
- The approved narrow TrialManifest recovery-authority repair **passed**.
- The prior blocking Important is closed; no Critical or Important finding
  remains in the scoped re-review.
- This handoff recommends that the main controller may start Task 7 after it
  independently accepts the evidence below.

## Branch and commits

- Intended branch: `codex/alpha-a-real-task`
- Repair starting point: `a371623caa0ef05829d2ade4db756ef1f9357b56`
- Repair implementation commits:
  - `9c5854d` — `fix: bind alpha trial manifest recovery`
  - `ab29dd3` — `fix: fail closed before alpha recovery effects`
- This Codex-managed worktree is detached. The handoff-document commit follows
  `ab29dd3`.

Earlier Task 5 and Task 6 commits remain:

- `938111a`, `12e1046`, `1e9863c`
- `edfc5de`, `7a20e3d`, `d78fa64`, `987a8f8`

## Repair outcome

The repair closes the complete authority chain:

```text
AlphaTrialState.trial_manifest_digest
= canonical SQLite alpha_trial_manifest digest
= canonical trial-manifest.json digest
= internally recomputed complete snapshot digests
```

Implemented:

- schema-v1 TrialManifest round policy/tool authorities must be non-empty;
- policy and tool round sets and order must match the frozen task bundle
  exactly;
- every round freezes round ID, complete prompt snapshot/digest, policy
  snapshot/digest, tool contract snapshot/digest, and allowed named check
  IDs;
- A5 freezes both rounds, while round 1 still contains no round-2 feedback or
  feedback-derived acceptance;
- construction/model loading validates aggregate policy and tool digests;
- AlphaRuntime has no empty-snapshot bypass and validates the current Run's
  prompt, policy, and tool authority against RunManifest and live config;
- every non-prepared resume validates State/SQLite/JSON/internal authority
  before Docker preflight, Run recovery/creation, model requests, Actions,
  checks, containers, or final verification;
- a confirmed prepared trial without a manifest now fails closed before
  effects;
- ordinary `StateStore.put_object()` cannot write or replace
  `alpha_trial_manifest`; `put_immutable_object()` exact replay remains valid;
- matching direct-DB and JSON forgeries with empty snapshots, or with a
  removed A5 round and all internal digests recomputed, fail before effects;
- `WAITING/unknown_action` recovery remains non-repeating: no new model
  request, Action, check/container call, or final-verifier effect.

No dependency, table, permission system, product scope, or unrelated
refactor was added.

## TDD and independent review

Strict RED evidence was recorded before production changes for:

- mutable `alpha_trial_manifest` replacement;
- empty round authority bypass;
- matching SQLite/JSON empty-authority recovery;
- frozen-bundle round removal with all internal digests recomputed;
- confirmed prepared recovery without a manifest.

The first scoped review found three Important items:

1. bundle-level round binding was too late;
2. prepared no-manifest recovery still reached Docker preflight;
3. original RED evidence was missing from the report.

Fix round 1 closed all three. Scoped re-review verdict:

- all findings addressed;
- no new Critical, Important, or Minor finding;
- independent focused recheck: `5 passed in 3.55s`;
- fix-range whitespace check: passed.

## Final verification evidence

Environment:

```powershell
$env:UV_CACHE_DIR = 'D:\DevData\uv-cache'
$env:UV_PROJECT_ENVIRONMENT = 'D:\DevData\uv-envs\tianwen-alpha-repair-f6f2'
```

Fresh controller results on implementation HEAD `ab29dd3`:

- focused store/runtime/trial: `77 passed in 45.58s`;
- Task 6 combination: `89 passed in 78.69s`;
- Alpha boundary: `43 passed in 13.94s`;
- full offline suite: `413 passed, 4 skipped in 123.47s`;
- `uv run ruff check .`: `All checks passed!`;
- `git diff --check a371623..HEAD`: passed.

Expected skips:

- paid DeepSeek live probe;
- two Windows symlink tests because this account lacks symlink privilege;
- the Windows ACL case tested separately.

No network, paid model, or real Docker execution was used.

## Deferred Minor findings

The two previously triaged Minor findings remain unchanged:

- an invalid Alpha round configuration fails generically instead of being
  rejected explicitly;
- `TrialResult`'s model-level unresolved-action invariant relies on a
  caller-provided failure category, although the real settlement path scans
  persisted Actions independently.

They are not part of this repair and do not block Task 7.

## Detailed repair artifacts

The git-ignored repair workspace is:

```text
.superpowers/sdd/2026-08-13-alpha-a-trial-manifest-repair/
```

It contains:

- `repair-brief.md`
- `repair-report.md`
- `progress.md`
- `review-a371623..9c5854d.diff`
- `review-fix-9c5854d..ab29dd3.diff`

## Recommended next entry

The main controller should independently verify the pushed SHA and this
handoff. If accepted, Task 7 may start in a new independent implementation
task. This repair session must not start Task 7 itself.
