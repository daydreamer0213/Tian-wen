# Task 3 native runtime integration report

Status: DONE. Implementation and scripted native integration verified; this is not real-model natural occurrence or evidence of stable improvement.

## Owned changes

- `packages/tianwen-runtime-bundle/src/conversation-guidance-loop.ts`
- `packages/tianwen-runtime-bundle/src/conversation-judgment.ts`
- `tests/dsh-migration/conversation-guidance-loop.spec.ts`
- `tests/dsh-migration/conversation-judgment.spec.ts`
- This report. No other files are included in the commit. The concurrently modified plan belongs to the parent and is preserved.

The native proposal schema has an object root, optional closed properties, and no unsupported union/minProperties/maxProperties. Existing `CONVERSATION_PROPOSAL_SCHEMA` and direct `{guidance}` responses remain valid. The host rejects empty/mixed choices, blank/oversized strings, and malformed/non-distinguishing exploration using the shared preparation validator.

An initial native proposal can choose guidance, insufficient evidence, or one immutable exploration intent. Only a fresh intent append in the active invocation executes control then treatment. Execution and blind review share the same helper with formal trials. The second proposal receives the unchanged initial sources and source IDs, study identity, parent guidance, frozen exploration proposal, actual answers, separate review checks, and ledger-derived observation/classification. Its schema cannot request exploration. Insufficient evidence stops with its own completed proposal proof. The five-case/ten-arm formal acceptance path and formula are unchanged.

Accepted restart recovery now inspects the initial exploration proposal and every exploration execution/review Session in the existing proof loop. It re-verifies exploration audited review bindings with the frozen material/output/model digests using the existing audit helper. Incomplete studies still stop on initialization without replenishment.

## RED and GREEN evidence

Working directory for every command: `D:/DevData/tianwen-worktrees/tianwen-architecture-overview-v2-merge`.

Every gate uses this exact prefix (no installs, live models, browser, external source, Desktop build or old cohorts):

```powershell
. 'D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1'
& 'D:/hermes/node/node.exe' 'D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs' <arguments below>
```

RED arguments:

```text
exec vitest run tests/dsh-migration/conversation-judgment.spec.ts tests/dsh-migration/conversation-guidance-loop.spec.ts -t 'offers native-supported|gates future behavior: explored|gates future behavior: insufficient|gates future behavior: empty-proposal|gates future behavior: mixed-proposal'
```

Actual RED output, exit 1 (16:11:34):

```text
Test Files  2 failed (2)
Tests       5 failed | 36 skipped (41)
explored: Target cannot be null or undefined (no exploration state)
insufficient: expected 'model-unavailable' to be 'insufficient-evidence'
empty-proposal / mixed-proposal: expected 'model-unavailable' to be 'invalid-judgment'
schema: TypeError: conversationProposalSchema is not a function
```

Initial scoped typecheck exposed TS2339 (mutable union narrowing in callback) and TS2322 (source ID string/template type). Fixed by capturing the narrowed exploration choice and retaining the validated source identity type. Subsequent `--filter @tianwen/runtime-bundle typecheck` exited 0.

Initial GREEN arguments:

```text
exec vitest run tests/dsh-migration/conversation-judgment.spec.ts tests/dsh-migration/conversation-guidance-loop.spec.ts
```

Actual output, exit 0 (16:14:39): `Test Files 2 passed (2); Tests 41 passed (41); Duration 26.54s`.

Expanded fixture run initially failed 10 cases because a newly added test callback was asynchronous, while the existing ScriptEntry contract consumes synchronous arrays. Root cause confirmed in `scripted-adapter.ts`; corrected the fixture to synchronous responses and moved asynchronous actual feedback invalidation into the existing native request event hook. No production retry or adapter changes. Then `exec vitest run tests/dsh-migration/conversation-guidance-loop.spec.ts -t 'explored'` exited 0: `13 passed | 27 skipped (40)`.

An additional genuine native but substituted-material exploration audit recovery test passed independently: `exec vitest run tests/dsh-migration/conversation-guidance-loop.spec.ts -t 'recover-explored-substituted-material'`, exit 0, `1 passed | 40 skipped (41)`.

Final sequential GREEN arguments:

```text
--filter @tianwen/runtime-bundle typecheck
exec vitest run tests/dsh-migration/conversation-guidance-loop.spec.ts tests/dsh-migration/conversation-judgment.spec.ts tests/dsh-migration/conversation-guidance-ledger.spec.ts tests/dsh-migration/learning-exploration.spec.ts
```

Actual output, exit 0 (16:22:40):

```text
$ tsc -b --pretty false
Test Files  4 passed (4)
Tests       114 passed (114)
Duration    51.95s
```

`git diff --check` also exited 0. The final four-file gate includes current ledger integration guards and retained legacy summary exploration integration.

## Tested material and proof boundaries

- Ordinary natural user messages and observer events automatically reach exploration, without slash commands or a manual study call in the main scenario table.
- Direct accepted path keeps the existing 48 native requests including the subsequent normal user turn; explored accepted path has 55 (exactly seven more: two workers, four independent checks, one final proposal).
- Exploration has two distinct slots, formal evaluation ten. Initial proposal, two executions, four reviews, and final proposal have eight unique actual persisted native Session proofs. Digests and native subagent/parent lineage match persisted records, and actual request headers preserve temperature 0.25.
- Initial source IDs align with the opened study and unchanged sources. Exploration workers receive exact original request/context only. Reviewer material equals the full frozen source material; no hypothesis, temporary instruction, competing review, or prediction is fed into review. Final proposal sources, IDs, study identity, and frozen proposal remain exact.
- Both allowed source slots are exercised (ordinary-source scenario selects first, raw-feedback scenario selects second). Selecting counterexample is rejected by native capture with zero arms. Native schema validation covers extra exploration fields and forbidden second exploration. Host tests cover empty/mixed native-captured choices, blank guidance, oversized UTF-8 insufficient explanation and non-distinguishing predictions.
- Separate attributed raw feedback and derived standards reach both proposals and blind reviewers unchanged, preserving actor/negation/timing/source binding. Workers do not receive these later standards or old answers outside the original frozen context. Feedback is excluded from factual quote/evidence whitelists.
- Initial and post-exploration insufficient/refusal branches stop without candidate/formal arms; post-insufficient carries a distinct final proposal proof. An attempted second pair stops with exactly two exploration receipts. Ordinary native schema rejection can consume its own correction response; no controller-level pair retry exists.
- Consent disabled during execution and actual supporting-source positive feedback inserted during a native request prevent review/receipt and further execution. Provider failure produces a safe stop with no fabricated verdict/proof/receipt.
- A missing stop append after one completed exploration arm leaves an undecided study. Reinitialization appends cancellation and makes zero additional model calls.
- Intact accepted explored recovery activates with zero additional model calls. Missing initial exploration proposal, changed exploration execution, changed exploration review, and a genuine native review bound to substituted material each prevent activation with zero recovery model calls. Existing formal recovery tests remain passing.

## Self-review and limits

Reviewed the production diff against the brief. Legacy request/digest/parser/summary route, source eligibility, quality criteria and formal acceptance formula are untouched. No Run, SkillUse, SkillVersionId, outcome, scheduler, database, retry loop, dependencies, or test platform was added. All evidence comes from existing one-shot/trial/audited-review primitives; preparation is pure and the ledger owns immutable identities, uniqueness, current-quality validation and derived classification. Duplicate intent is explicitly refused as execution authorization.

The first post-observation draft needed the frozen hypothesis/predictions alongside its classification to make that classification interpretable in a new independent Session; self-review added the original proposal only to that final proposal material. Workers and blind reviewers remain isolated.

Limits: scripted native harness evidence does not demonstrate spontaneous real-model exploration or stable improvement. No live/browser/R11/old-cohort test was run. The new ordinary integration scenarios start from the baseline parent snapshot; a separately populated prior-guidance chain is not added as another native fixture. Existing request-material size limits remain in force, including the final expanded proposal, with existing safe-stop behavior rather than truncation. Duplicate-intent refusal is implemented and ledger idempotency is covered by the guard suite; no synthetic concurrent duplicate-return mock is added to the single-lane integration fixture.
