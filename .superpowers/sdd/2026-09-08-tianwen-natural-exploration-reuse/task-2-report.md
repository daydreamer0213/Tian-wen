# Task 2 — natural exploration guidance ledger

## Scope

Implemented the persisted natural-exploration checkpoint inside the existing
`conversation-guidance-recorded` ledger path. No scheduler, database, runtime
loop, live-model execution, Desktop packaging, or external source was changed.

## RED / GREEN evidence

RED command (after adding the focused disk-replay tests, before implementation):

```powershell
. D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1; D:/hermes/node/node.exe D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs exec vitest run tests/dsh-migration/conversation-guidance.spec.ts tests/dsh-migration/conversation-guidance-ledger.spec.ts
```

RED result: exit 1; 63 passed and 2 failed. Both failures were the expected
`TypeError: unknown guidance record kind` at
`parseConversationGuidanceRecord` for `exploration-requested`.

GREEN command (same focused command):

```powershell
. D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1; D:/hermes/node/node.exe D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs exec vitest run tests/dsh-migration/conversation-guidance.spec.ts tests/dsh-migration/conversation-guidance-ledger.spec.ts
```

GREEN result: exit 0; 2 files passed, 68 tests passed, 0 failed.

Typecheck command:

```powershell
. D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1; D:/hermes/node/node.exe D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs --filter @tianwen/evolution typecheck
```

Typecheck result: exit 0 (`tsc -b --pretty false`). `git diff --check` also
completed with exit 0.

## Implemented boundaries

- Added immutable request and control/treatment arm records, exact parsing,
  per-slot duplicate lookup, and a separate `GuidanceStudy.exploration`
  projection.
- Reused the shared request parser, frozen hypothesis/prediction classifier,
  quality-review parser, and review consensus. The projection derives the
  observation from the two stored review receipts; callers cannot persist a
  classification or arm verdict.
- Binds an intent to an opened study's two source cases only, exact parent,
  source material, model/environment digest, and frozen quality digest.
- Reserves proposal, execution, review, and insufficient-evidence Sessions in
  the existing global native-session set, enforcing independence across slots
  and studies.
- Prevents a candidate after starting exploration until both exploration arms
  exist. Formal `study.arms`, ten-arm decision derivation, and activation path
  are unchanged.
- Adds the proof-required `study-stopped: insufficient-evidence` shape while
  leaving historical stopped-record shapes unchanged.
- Applies current quality, consent, active support, and frozen-current-parent
  checks only to new explored-study mutations; replay continues through the
  existing chronological validation without imposing current quality on old
  records.
- Focused tests cover actual-shaped task IDs, frozen quality contracts,
  disk replay, derived observation, duplicate versus replacement, source and
  frozen-fact rejection, incomplete-exploration candidate blocking, native
  Session reuse, and the evidence-limited stop.

## Files changed

- `packages/tianwen-evolution/src/conversation-guidance.ts`
- `packages/tianwen-evolution/src/ledger.ts`
- `packages/tianwen-evolution/src/index.ts`
- `tests/dsh-migration/conversation-guidance.spec.ts`
- `tests/dsh-migration/conversation-guidance-ledger.spec.ts`
- this report

## Limitations / concerns

This is intentionally a control-plane persistence checkpoint only. It does not
make a runtime automatically request or execute exploration, and an exploration
observation remains neither acceptance evidence nor causal proof. The scoped
tests and evolution-package typecheck were run; no whole-repository, live-model,
or Desktop-packaging test was run by design.

## Fix round 1 — replay and authorization boundaries

The initial review found that the current-quality check for explored-study
mutations lived in `#validateConversationGuidance`, which is also used by
chronological disk replay. The check now lives only in
`recordConversationGuidance`, after exact duplicate resolution. Replay retains
the frozen historical contract; a new request, arm, or explored-study candidate
still requires the current quality contract. Chronological consent, support, and
current-parent checks remain in the shared validator.

Covering files:

- `packages/tianwen-evolution/src/ledger.ts`
- `tests/dsh-migration/conversation-guidance.spec.ts`
- `tests/dsh-migration/conversation-guidance-ledger.spec.ts`

New RED command:

```powershell
. D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1; D:/hermes/node/node.exe D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs exec vitest run tests/dsh-migration/conversation-guidance.spec.ts tests/dsh-migration/conversation-guidance-ledger.spec.ts
```

RED result: exit 1; 68 tests passed and 1 failed. The new actual disk-replay
test failed as expected with `LedgerIntegrityError: new natural exploration
requires the current quality contract` from replay-shared validation.

GREEN command (same scoped command):

```powershell
. D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1; D:/hermes/node/node.exe D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs exec vitest run tests/dsh-migration/conversation-guidance.spec.ts tests/dsh-migration/conversation-guidance-ledger.spec.ts
```

GREEN result: exit 0; 2 files passed, 72 tests passed, 0 failed.

Additional typecheck command:

```powershell
. D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1; D:/hermes/node/node.exe D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs --filter @tianwen/evolution typecheck
```

Typecheck result: exit 0 (`tsc -b --pretty false`); `git diff --check` was
also exit 0.

The added cases use recomputed valid requests to reach frozen-study binding,
not parser-invalid edits. They cover wrong study/source/model/quality bindings,
historical-quality replay plus mutation rejection, disabled/stale consent,
withdrawn attributed support, stale current parent, cross-study native Session
reuse, and completion of all ten formal arms after a natural observation.
Self-review confirmed exact duplicates return before the mutation-only quality
gate, and no current-quality rule remains in replay-shared validation.

## Fix round 2 — isolated authorization and binding negatives

No production code changed. The focused tests now separately construct valid,
recomputed exploration requests for an opened counterexample source and for the
legitimate source with only its material digest changed. This ensures rejection
reaches frozen-study binding rather than the request parser or an unknown-source
shortcut. The ledger test also separately verifies an enabled v3 consent record
with revision `2` is rejected for an opened study frozen at revision `1`.

Covering files:

- `tests/dsh-migration/conversation-guidance.spec.ts`
- `tests/dsh-migration/conversation-guidance-ledger.spec.ts`

Command:

```powershell
. D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1; D:/hermes/node/node.exe D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs exec vitest run tests/dsh-migration/conversation-guidance.spec.ts tests/dsh-migration/conversation-guidance-ledger.spec.ts
```

Result: exit 0; 2 files passed, 72 tests passed, 0 failed.

Typecheck command:

```powershell
. D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1; D:/hermes/node/node.exe D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs --filter @tianwen/evolution typecheck
```

Result: exit 0 (`tsc -b --pretty false`); `git diff --check` was exit 0.
