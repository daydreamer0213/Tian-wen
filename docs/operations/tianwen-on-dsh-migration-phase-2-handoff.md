# Tianwen-on-DSH Migration Phase 2 handoff

## Status: PRODUCT COMPLETE; NO CUTOVER

Phase 2 is complete on its dedicated migration branch. It proves one fixed,
fully offline Tianwen startup through the public DSH Profile and headless path.
This is not a production cutover: nothing was merged to `main`, no Python
runtime was deleted, and no UI was built or released.

## Branch and audit identity

- Worktree: `D:\DevData\tianwen-worktrees\phase2`
- Branch: `codex/tianwen-dsh-migration-phase-2`
- Product base: `cffc8e51ad829adf016967491830402b0ed91bd5`
- Pre-handoff reviewed product HEAD: `cebd3152920fbd915f08e211d447493a31379ef1`
- Task 1: `6bea67a` (`feat: add fixed tianwen startup smoke entry`) and
  `5b6c255` (`fix: complete phase two smoke in one headless turn`)
- Task 2: `563eb68` (`test: prove the formal tianwen headless startup`) and
  `cebd315` (`fix: follow dsh profile peer closure`)
- Whole-phase review: Approved, **C0 / I0 / M0**, ready for final gates.

This document is committed after the reviewed product, so it cannot contain
its own future commit SHA. The final branch receipt is the post-push
`git ls-remote` result, which must equal the local handoff commit SHA.

## What the product now proves

The formal `tianwen` Profile has exactly these three layers, in order:

1. `@deepseek-ai/dsh-base@0.1.0-rc.6`
2. `@deepseek-ai/dsh-headless@0.1.0-rc.6`
3. The current `@tianwen/runtime-bundle` tarball

The public headless command is the fixed Profile invocation:

```text
dsh --profile tianwen "run the Tianwen phase 2 smoke task"
```

The installed Profile dump is asserted to select the fixed offline model route,
plain JSONL Session configuration, the public Cordis host runner, the trusted
Runtime evolution root, and the Runtime Bundle smoke export. The Profile has
no probe Bundle, workspace link, fourth layer, or private DSH import.

The runtime archive is
`D:\DevData\tianwen\packs\tianwen-runtime-bundle-0.0.0.tgz` with SHA-256
`111DA908F5173E37B4D9523975961E9C8F7026EFD13BEEC1136E551344127C1E`.
Its exact six published files are:

- `cordis.patch.yml`
- `dist/index.d.ts`
- `dist/index.js`
- `dist/runtime.js`
- `dist/smoke.js`
- `package.json`

The smoke metafile has only `src/smoke.ts` as its bundled input. Its approved
non-Node DSH externals are `@deepseek-ai/dsh-llm` and
`@deepseek-ai/dsh-tools`; the manifest also keeps the public Cordis dependency.

## Final startup receipt

The final formal E2E was a strict-offline run in one execution session
(`63111`): Corepack networking was disabled, pnpm/npm were offline, and the
registry was `http://127.0.0.1:9/`. Vitest reported **1 file / 2 passed** in
**41.28 s**, exit 0.

- Receipt: `D:\DevData\tianwen\receipts\phase2-startup-receipt.json`
- Receipt SHA-256: `4B54B087D6059D58F32DCCB29B8D5EDC4533AFB1764AC216D00F0014565279DD`
- Schema: `tianwen.phase2-startup.v1`
- Session: `session-792961ba-9eb5-4273-a480-a674bbd70579`
- Command result: exit 0; stdout `TIANWEN_PHASE2_OK`
- Model steps: 4
- Goal: `complete`, `activation=disarmed`, `roundsStarted=0`
- Complete Evidence actions: `create_goal`, `tianwen_smoke_action`,
  `update_goal`
- Evolution: no transition; Champion unchanged
- Forbidden-effect counts: paid model 0, live web/search 0, Docker 0,
  credential variables 0

The receipt is this-run acceptance evidence, not a portable semantic hash.
The Session JSONL remains the authority for conversation, Goal, and tool
events; Evidence is the compact replay projection; the Evolution ledger and
Champion remain the governance authority.

## Historical cache incident: resolved environment preparation

The old D-drive store was incomplete after lockless Profile resolution selected
three exact public AWS packages that were not yet cached:
`@aws-sdk/core@3.977.8`, `@aws-sdk/credential-provider-node@3.972.80`, and
`@aws-sdk/eventstream-handler-node@3.972.33`. The old E2E attempts stopped at
the installation precondition, before product assertions executed. The
incremental proxy seeds are historical; they are not final acceptance evidence.

The final minimal recovery used
`D:\DevData\tianwen-phase2\profile-cache-seed`, containing exactly the base
rc.6 package, headless rc.6 package, and current Runtime Bundle tarball under
the same formal Profile policy. pnpm 11.20 with the official registry seeded
the full closure into `D:\DevData\pnpm-store`: 320 resolved, 253 reused, and
14 downloaded, with `--ignore-scripts`. With the registry then forced to
`127.0.0.1:9`, the frozen offline install completed with 0 downloads and exit
0. This prepared the environment; the independent formal E2E above is the
final gate.

## Final gate ledger

| Gate | Final evidence |
| --- | --- |
| Offline preflight | Frozen install/build/closure/private-import/typecheck recorded pass; closure: 187 exact rc.6 packages, 15 public surfaces, 0 violations. |
| Default Node | 13 files passed, 2 skipped; 82 tests passed, 8 skipped; exit 0. |
| Formal startup E2E | 1 file, 2 passed; 41.28 s; exit 0; strict offline receipt above. |
| Windows sandbox | 1 file, 3 passed; 997 ms; exit 0. Windows enforcement remains partial. |
| Python A1-A5 | 10 passed in 3.99 s; exit 0, run visibly in the foreground. |
| Full Python | 424 passed, 4 planned skips in 157.51 s; exit 0, same session `7559`. |
| Ruff | `All checks passed`. |
| Diff and tracked status | `git diff --check base..HEAD` exit 0; tracked worktree clean before this handoff. |

The earlier Python wrapper hang was a detached-output wrapper problem, not a
test failure. Its exact process chain was terminated; the final foreground
pytest result above is the accepted result.

## Scope explicitly not performed

There was no migration cutover, merge to `main`, Python deletion, UI/TUI/Web
delivery, real model call, Goal Graph, Candidate promotion, paid-model use,
live web/search, real Docker, credential injection, or private DSH source
import. The only model route was the fixed offline smoke adapter.

## Retained risks

- DSH `0.1.0-rc.6` is Developer Preview software.
- The upstream Windows Profile installer still has a narrow, fixed `shell:true`
  exception; Tianwen-owned build/run paths use fixed executable and argv with
  `shell:false`.
- Reviewed, versioned first-party plugins run in the trusted same-process
  model.
- Windows sandbox enforcement is partial, so this result is not elevated to a
  high-risk sandbox claim.
- The typed Python evaluator bridge remains A1-only.
- The JSONL governance ledger is not a multi-process database.

## Recommended next work

Build only a read-only `tianwen status --goal` control projection first. It
should project existing Goal, Session, Evidence, and Champion state without
automating UI work, cutover, promotion, or a new mutation path.
