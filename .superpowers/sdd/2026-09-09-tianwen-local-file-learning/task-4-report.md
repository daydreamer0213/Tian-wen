# Task 4 implementation report

Base supplied by root: `6399943b1157292fa873db5c2445a032560e228b`.
Workspace: `D:/DevData/tianwen-worktrees/tianwen-architecture-overview-v2-merge`.
Implementation owner: `local_file_study_integration`. No staging or commits.

## Result and scope

Task 4 connects the reviewed native executor to original-result review, feedback,
study selection and generation, all ten formal arms, both exploration arms, source
reference ordering, private receipt retention, cold acceptance recovery, and the
existing snapshot rollback chain. Historical text objects retain their absent
optional fields, hashes, quality contracts, and two-reviewer acceptance semantics.

Final source verification: 13 focused files, 327/327 passing; Evolution and runtime
bundle build passes. No commits created; root owns the independent review gate.

### Evolution/domain

- Optional study `evaluationMode: 'local-files'` requires `fileOutputKind`. Generated
  cases freeze parsed initial `files` with prompt, criteria and quality contract.
  Text study parsing inserts neither field. File request identity hashes normalized
  request text together with the parsed initial contract; the old text digest is
  unchanged.
- Optional `fileRules` shares the existing snapshot and version chain. Candidate
  validation constructs the single permitted successor and compares the whole
  snapshot, preserving unrelated families, output kinds, text rules, and map
  presence. `guidanceRule` is the central lookup and has no cross-mode fallback;
  external and subjective tasks receive no unevaluated rule.
- `study-file-trial-captured` is another private guidance record, containing the
  strict Task 3 receipt. Its formal target is caseId/role; its exploration target
  is the digest of the complete frozen exploration request plus arm. The wrapper
  binds study/material, enforces the legal phase and uniqueness, and reserves the
  execution Session. Only its matching arm may consume that reservation; all other
  Session independence checks remain active. Receipt-only history never becomes an
  arm. Existing public ledger exclusion and replay handle this data without a new
  store or Session event.
- Ledger support requires all three tasks' exact mode/outputKind, complete file
  captures, existing consent, quality, model, parent, family and support rules.
  Receipt retention and file arm/candidate writes recheck current source/consent
  and parent gates. File-only snapshots still require their stored artifact.
- Complete captured local-file original results may retain the two-reviewer met
  consensus. Missing capture remains inconclusive. No changes to v6 audit meaning.
- Actual activation predecessors are exposed by `activeStudyChain`. The existing
  retirement method can peel an active later head with `ancestor-invalidated`,
  bound to a verified unsupported/consent-invalid ancestor, then roll back that
  ancestor normally. Both ledger and domain validate actual ancestry; there is no
  snapshot-hash search or per-rule history replay. Regression evidence must also
  match the study's mode/output kind.

### Review and runtime consumers

- Original and method reviews project preimages as sources; assistant replies and
  only declared final output files are answer units. Deterministic `filePath` and
  `fileStage` metadata bind membership without altering the content. Input-only
  files and file-chat inputs are not extra answers. Actual empty output retains
  one explicit empty answer unit using the existing v2 null audit. Absent output
  and a missing file result cannot silently use the text-answer path.
- File review material excludes post-write tool readback/write-success sources,
  and file-specific instructions distinguish existence from factual truth. Quote
  choices contain original preimages plus actual outputs. Historical text quote
  order and review instructions remain unchanged.
- Observer injection uses mode-aware lookup. It attaches final entries only after
  Task 2 native-span recovery verifies the original file material. Feedback keeps
  exact original user feedback and conditionally adds those verified final bytes;
  ordinary text feedback requires no file evidence.
- Study selection verifies native file material before using it. Generated file
  cases can supply only bounded initial entries and exact output paths; the host
  supplies cwd/output kind/schema. Every file arm uses `runConversationFileTrial`.
  Its retain callback persists the wrapper after native proof and before either
  reviewer, while checking that the study is still current.
- Formal records and exploration observations use `sha256({ answer, files })`.
  Cold acceptance recovery obtains each private receipt, re-verifies Task 3 native
  execution, then binds both native blind reviews to its exact frozen material and
  complete output. Source-reference recovery uses the same complete outputs for
  both supported reference/exploration orders. No recovery path reads current
  replica bytes or runs a missing generation/review.
- Runtime resolves the existing core fallback root once and supplies that same
  actual root to the loop. Replica parents live beneath the explicit Evolution
  root, without an OS temporary-directory fallback.

## TDD and verification evidence

All commands ran in the workspace above with existing dependencies. Command
prefix: `& D:/hermes/node/node.exe node_modules/vitest/vitest.mjs run`.

### RED observations before their implementations

1. `tests/dsh-migration/conversation-guidance-files.spec.ts`
   - `Test Files 1 failed (1); Tests 5 failed (5)`.
   - Existing snapshot parser rejected `fileRules`; `guidanceRule` was absent;
     local-file study/receipt contracts were unavailable. Historical text checks
     preceding the new-field assertions still passed.
2. Same domain file, after adding the ancestor interleaving test:
   - `Tests 1 failed | 5 passed (6)`; `state.activeStudyChain is not a function`.
3. `tests/dsh-migration/conversation-guidance-ledger.spec.ts -t 'selects compatible file'`
   - `Tests 1 failed | 50 skipped (51)`;
     `task review disagrees with its independent check consensus`, reproducing the
     non-text downgrade that prevented any successful file counterexample.
4. `tests/dsh-migration/conversation-claim-review.spec.ts -t 'preimages|actual empty output|post-write|file chat'`
   - Four new assertions failed: file outputs were unprojected, real empty output
     could not be audited, and changed file output digests were ignored. One
     initial fixture lacked `isError: false`; that fixture was corrected before
     implementation and `-t 'post-write'` rerun failed with `invalid-judgment` from
     the absent file projection (not a fixture error).
5. `tests/dsh-migration/conversation-file-learning.spec.ts -t accepted`
   - Original result expected `[not-met, not-met, met]`, received
     `[not-met, not-met, inconclusive]`.
   - After fixing original review, the next RED was `expected undefined to be
     defined` for the study: the text-only selection had not admitted file sources.
6. `tests/dsh-migration/conversation-file-learning.spec.ts`
   - Initial integrated run: `Tests 1 failed | 5 passed (6)`. Cold recovery left
     activation undefined because it still checked answer-only hashes. Other five
     file formal/exploration/retention paths already passed.
7. `tests/dsh-migration/conversation-file-learning.spec.ts -t feedback`
   - `Tests 1 failed | 6 skipped (7)`; expected retained original output
     `pilot original 1`, received undefined from feedback material.
8. `tests/dsh-migration/conversation-guidance-ledger.spec.ts -t 'withdraws inherited'`
   - After file activation, later text activation, and real source-feedback
     retraction, the expected parent snapshot was not restored. Both inherited
     fileRules and the later text head incorrectly remained active.
9. Same interleaving test, expanded during self-review:
   - `expected [Function] to throw an error`: two later text failures could be
     passed as regression evidence against file guidance. Fixed by matching mode
     and output kind in ledger and loop regression gates.
10. `tests/dsh-migration/conversation-claim-review.spec.ts -t 'actual empty output'`
    - `expected [Function] to throw an error`: file task material without a
      fileResult still admitted a text-only reply projection. Added the missing
      capture guard, then reran the complete claim-review/file-learning pair.

### GREEN checkpoints

- Domain/ledger checkpoint:
  `tests/dsh-migration/conversation-guidance-files.spec.ts tests/dsh-migration/conversation-guidance.spec.ts tests/dsh-migration/conversation-guidance-ledger.spec.ts`
  returned `Test Files 3 passed (3); Tests 104 passed (104)`.
- Projection/text-material checkpoint:
  `tests/dsh-migration/conversation-claim-review.spec.ts tests/dsh-migration/conversation-task-material.spec.ts`
  returned `Test Files 2 passed (2); Tests 40 passed (40)`.
- File-chat and both source/exploration cold orders:
  `tests/dsh-migration/conversation-file-learning.spec.ts -t 'chat|recover-source'`
  returned `Tests 3 passed | 7 skipped (10)`, duration 14.91s.
- Retention consent race, incomplete-review cold restart, and changed native proof:
  `tests/dsh-migration/conversation-file-learning.spec.ts -t 'consent-retention|recover-incomplete|recover-changed-native'`
  returned `Tests 3 passed | 10 skipped (13)`, duration 6.34s.
- Final missing-capture guard coverage:
  `tests/dsh-migration/conversation-claim-review.spec.ts tests/dsh-migration/conversation-file-learning.spec.ts`
  returned `Test Files 2 passed (2); Tests 50 passed (50)`, duration 34.57s.
- Interleaving was strengthened to start with a genuinely accepted ten-arm text
  rule, then file activation, then later text activation and file support
  withdrawal. Its final focused run passed `1 passed | 51 skipped (52)` and
  retained that earlier independently tested text rule. The first fixture
  expansion used decreasing same-Session turn numbers and was rejected by the
  existing lifecycle gate; corrected to monotonically increasing turns.
- An earlier 13-file regression returned `321 passed (321)`, duration 132.04s.
  A later in-flight regression encountered the newly added missing-capture RED
  assertion before its fix was loaded (`326 passed, 1 failed`); it is not claimed
  as GREEN. The source/test set was frozen for the final full rerun below.

### Final verification

Build command:

```powershell
& D:/hermes/node/node.exe node_modules/typescript/bin/tsc -b packages/tianwen-evolution packages/tianwen-runtime-bundle --pretty false
```

Build output: no diagnostics, exit 0.

Stable focused regression command:

```powershell
& D:/hermes/node/node.exe node_modules/vitest/vitest.mjs run tests/dsh-migration/conversation-guidance.spec.ts tests/dsh-migration/conversation-guidance-files.spec.ts tests/dsh-migration/conversation-guidance-ledger.spec.ts tests/dsh-migration/conversation-guidance-loop.spec.ts tests/dsh-migration/conversation-learning.spec.ts tests/dsh-migration/conversation-observer.spec.ts tests/dsh-migration/conversation-feedback.spec.ts tests/dsh-migration/conversation-claim-review.spec.ts tests/dsh-migration/conversation-claim-recovery.spec.ts tests/dsh-migration/conversation-file-learning.spec.ts tests/dsh-migration/conversation-file-observer.spec.ts tests/dsh-migration/conversation-file-trial.spec.ts tests/dsh-migration/conversation-task-material.spec.ts
```

Output (exit 0):

```text
Test Files  13 passed (13)
     Tests  327 passed (327)
  Start at  14:13:41
  Duration  150.84s (transform 2.33s, setup 0ms, import 8.27s, tests 138.52s, environment 2ms)
```

After that source-stable run, the native pair test was strengthened to compare
both persisted execution Session cwd values, explicitly proving separate replica
directories in addition to different Sessions, retained baseline output and intact
original bytes. Final command and output (exit 0):

```powershell
& D:/hermes/node/node.exe node_modules/vitest/vitest.mjs run tests/dsh-migration/conversation-file-learning.spec.ts
```

```text
Test Files  1 passed (1)
     Tests  13 passed (13)
  Start at  14:16:48
  Duration  33.45s (transform 1.56s, setup 0ms, import 2.21s, tests 30.86s, environment 0ms)
```

Status: DONE. Ready to commit: yes, after root's independent gate. No known
unresolved implementation failure remains; no further source/test edits are
pending from this owner.

## Changed files

Source:

- `packages/tianwen-evolution/src/conversation-guidance.ts`
- `packages/tianwen-evolution/src/conversation-learning.ts`
- `packages/tianwen-evolution/src/ledger.ts`
- `packages/tianwen-evolution/src/index.ts`
- `packages/tianwen-runtime-bundle/src/conversation-guidance-loop.ts`
- `packages/tianwen-runtime-bundle/src/conversation-claim-review.ts`
- `packages/tianwen-runtime-bundle/src/conversation-observer.ts`
- `packages/tianwen-runtime-bundle/src/conversation-task-material.ts`
- `packages/tianwen-runtime-bundle/src/conversation-feedback-assessment.ts`
- `packages/tianwen-runtime-bundle/src/conversation-judgment.ts`
- `packages/tianwen-runtime-bundle/src/runtime.ts`

Tests:

- New `tests/dsh-migration/conversation-guidance-files.spec.ts`.
- New `tests/dsh-migration/conversation-file-learning.spec.ts`.
- Extended `tests/dsh-migration/conversation-guidance-ledger.spec.ts`.
- Extended `tests/dsh-migration/conversation-claim-review.spec.ts`.
- `tests/dsh-migration/conversation-file-observer.spec.ts`: one integration
  expectation changes from the former unconditional inconclusive to met with
  complete verified file capture and two met reviews.

## Coverage and self-review

The new native integration uses genuine AgentPresets file-tool composition,
LocalFs and persistent Sessions with a scripted model adapter. It verifies
accepted/rejected/inconclusive decisions, file-chat, ten formal arms, exploration
consumption, both source-reference orders, retained baseline output, unchanged
original bytes, consent races, receipt failure before reviews, incomplete review
restart, native-proof tampering, true host/ledger/native cold recovery with zero
model calls, and no repeated study after restart. Private-ledger tests additionally
verify receipt deduplication/public exclusion and complete replay; pure domain
tests cover changed/missing/cross-target proofs, material and output digests,
illegal phases, mode mismatches, and unrelated reserved reviewer Sessions.

Self-review fixed the two reproduced consumer gaps described in RED items 9-10.
The existing large ledger and loop remain in place; no unrelated restructuring,
new store, independent version system, parser replacement, or dependency was
introduced. The reviewed Task 3 executor and Task 2 capture/recovery implementation
were reused unchanged. Test/generated data and build output stayed on D:.

No real-model/network calls, Daily reads/writes, installs, browser operations,
releases or large cleanup were performed. This report establishes implementation
and focused deterministic integration evidence, not real-model product acceptance.
Root owns the independent correctness/scope gate and all Git work on the final
stable file set.
