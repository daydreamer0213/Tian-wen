# Final review fix report — frozen proposal inputs and native review boundary

Completed one bounded fix wave on reviewed base `94994421a3dfeace967c9a8e4072d8569db7753b`, after explicit root write release. Only the two assigned production files, two assigned tests and this report were changed. The resulting commit SHA is returned separately because the commit cannot embed its own hash.

## Preserved baseline and scope

Root's release message records the first unchanged-source full-gate baseline at the base above: TypeScript 2262 passed / 18 skipped in 645s; Python 609 passed / 4 skipped in 264s; build, typecheck and imports passed; `receipt.sourceUnchanged` true. These are root-provided base-SHA results, preserved without rerunning or relabeling them as fixed-SHA results. This worker ran only the assigned checks below. Root still owns the single scoped re-review and final fixed-SHA full gates.

No domain/ledger implementation, shared framework, configuration, dependencies, version/constants, prior evidence, Daily, model/provider/browser/network, packaging or release actions were changed or invoked. All model responses in these tests are scripted responses through the existing native harness.

## Changes and self-review

- Source-backed accepted recovery now validates selection, final candidate and any exploration proposal against the opened study. Exactly two complete source materials must match the corresponding `source1`/`source2` material hashes and `sourceTaskIds` order. Hashing includes complete original feedback. Parent guidance must equal `parentSnapshot.rules[family] ?? ''`; family and failure category must equal the opened values.
- The existing native capture, model, source catalog/admission, read digest, source-use, complete exploration observation, bounded source/exploration order, formal review and current-support checks remain. No recovery model, snapshot or get call was added.
- Shared claim review accepts an optional `beforeCall` callback and awaits it before each native requirements/grounding judgment, with abort checks retained on both sides. Method study supplies its existing `assertCurrent`. Ordinary review callers omit the callback; review instructions, two-review consensus, criteria, thresholds and retry behavior remain unchanged.
- Self-review traced the optional callback into the existing judgment runner: only task material is serialized; the callback is not supplied as model data. The local frozen-input guard adds no state or generalized recovery machinery. Production diff is 16 added lines in total.

## Regression evidence

Final meaningful RED was run before any production edit: **13 failed / 104 skipped**, two files, exit 1, 22.11s, start 2026-09-08 20:56:46 local.

1. Eight genuine native replacement fixtures consistently substitute sources/order, parent guidance, family or failure category across selection/final/exploration in both bounded orders. Replacement source reads and candidate source-use digests are correctly rebound; exploration request digest is recomputed by the existing constructor. Captures recover successfully; the ledger replays without failure; opened study, formal arms and accepted decision stay unchanged. Before the fix all eight wrongly activate on restart. After the fix all reject with `invalid-judgment`, zero model requests and zero registry snapshot/get calls.
2. One genuine natural correction fixture changes only the exact original feedback message text, preserving other feedback fields, original task material and all frozen/formal evidence. Both source selection and final capture carry the changed text with a correctly rebound read/source-use receipt. Original natural feedback assessments are verified active on restart. Before the fix recovery activates; after the fix it rejects with zero model/snapshot/get calls. A distinct restart parent preserves the actual original persisted feedback Session.
3. Two native method-study fixtures withdraw source support during the first requirements response stream, complete actual message-feedback reconciliation, then allow that review to finish. They cover formal and exploration arms. Before the fix grounding starts; after the fix grounding never starts, no arm or activation is appended, the study stops with `scope-changed`, and each fixture has exactly 16 total requests.
4. Two shared-review callback cases reject before the first or second native call, establishing zero/one invocation boundaries. Existing normal two-review and consent cancellation cases remain green.

Final four-file GREEN: **187 passed / 0 failed**, four files, exit 0, 98.95s, start 2026-09-08 20:57:51 local. Existing direct/explored no-source totals remain 48/55; corresponding source totals remain 49/56 including the future user turn. Both intact source/exploration recovery orders retain zero additional model/snapshot/get calls. Runtime typecheck exited 0 with no diagnostics. Final `git diff --check` and staged diff check exited 0.

## Exact commands and logs

All commands ran from `D:/DevData/tianwen-worktrees/tianwen-architecture-overview-v2-merge` with this prefix:

```powershell
. 'D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1'
$env:TEMP='D:/DevData/twfftmp'; $env:TMP='D:/DevData/twfftmp'; $env:TIANWEN_DSH_PROBE_ROOT='D:/DevData/twffx'
```

New logs reside under `E:/待清理/D盘迁移-2026-09-08/Tianwen-自然入口复用-022/final-fix-20260908-2300/`. Temporary and probe roots are short D: paths; the existing tests create fresh unique `loop-*`, `feedback-loop-*` and `claim-review-*` fixture directories on D: and clean their own fixtures. No completed full-gate fixture root was reused.

Final RED, log `red-final.log`:

```powershell
& 'D:/hermes/node/node.exe' 'D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs' exec vitest run tests/dsh-migration/conversation-guidance-loop.spec.ts tests/dsh-migration/conversation-claim-review.spec.ts -t 'frozen-|support-withdrawn-during-review|before-first|before-second'
```

Final GREEN, log `green-four-files.log`:

```powershell
& 'D:/hermes/node/node.exe' 'D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs' exec vitest run tests/dsh-migration/conversation-guidance-loop.spec.ts tests/dsh-migration/conversation-claim-review.spec.ts tests/dsh-migration/conversation-judgment.spec.ts tests/dsh-migration/conversation-guidance-ledger.spec.ts
```

Typecheck, log `runtime-typecheck.log`:

```powershell
& 'D:/hermes/node/node.exe' 'D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs' --filter '@tianwen/runtime-bundle' typecheck
git diff --check
git diff --cached --check
```

All test/typecheck commands redirected stdout and stderr to their named new logs, saved `$LASTEXITCODE`, displayed the log and exited with the saved code. No failure output was overwritten. Preparation runs are retained separately:

- `red.log`: first fixture preparation, 14 failed / 104 skipped plus two errors; async script callback was unsupported by the existing synchronous adapter. This is not defect RED evidence.
- `red-fixture-corrected.log`: 14 failed / 104 skipped; review-boundary defects reproduced, but source replacement exploration request digests still needed rebinding. These source failures are not defect evidence.
- `red-valid-native.log`: 14 failed / 104 skipped; valid native defects reproduced. Two synthetic feedback-addition variants were then replaced by the more precise genuine natural-feedback-only case.
- `red-exact-feedback.log`: focused natural feedback preparation, 1 failed / 83 skipped; reusing the old parent ID replaced its lifecycle and failed current assessment checks. Corrected by creating a distinct restart parent and explicitly verifying the original assessments remain active.

These preparation issues were confined to tests and corrected before the final meaningful RED and production changes. No unresolved concern is known within the two requested findings. This report establishes scripted source correctness only; it does not establish real-model usefulness, release readiness or a live activation outcome.
