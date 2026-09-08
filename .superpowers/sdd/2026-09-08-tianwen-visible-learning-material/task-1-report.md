# Task 1: visible learning material versioning

## Scope and result

Implemented only the explicit `ConversationTaskSource.materialProjection` marker and its existing material-consumer path.  New native admissions freeze `surface-text.v1`; an omitted marker preserves the prior native-content projection.  No threshold, raw native request/result digest, tool-result evidence, consent, provider, desktop, package, or frozen real-use artifact changed.

`surface-text.v1` filters only assistant message content to `text` blocks.  It retains user content, assistant message ids and roles, including an assistant message whose projected content is empty.  Recovery, observer review, and feedback answer reconstruction read the marker from the frozen task source rather than inferring it from a hash.

## TDD evidence

The initial RED command loaded `D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1` and used `D:/hermes/node/node.exe` with `D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs`:

```powershell
pnpm exec vitest run tests/dsh-migration/conversation-learning.spec.ts tests/dsh-migration/conversation-task-material.spec.ts
```

It had two meaningful behavioral failures (not compilation or fixture failures):

1. A `task-started` source with the new exact marker was rejected by the strict parser because the marker was not an allowed field.
2. A real native `Session` with visible assistant text, reasoning above 96 KiB, and a native tool call still retained the reasoning/tool-call blocks when the requested projection was supplied.

The raw RED log is external test evidence at `E:/待清理/D盘迁移-2026-09-08/Tianwen-自然入口复用-022/visible-material-fix/task-1-red.log`.

An early observer-suite run initially used the stale workspace `@tianwen/evolution` dist, so its old runtime parser rejected the new source field.  A narrow `pnpm --filter @tianwen/evolution build` refreshed that one ignored test runtime artifact; it was not committed.  A temporary scripted-fixture mismatch while injecting an incomplete artificial assistant tool-call was removed rather than treated as a product failure.  The final integration uses the normal scripted streaming path and its persisted native receipt.

## GREEN verification

All commands used the same gate environment, Node and pnpm paths above:

```powershell
pnpm --filter @tianwen/evolution build
pnpm exec vitest run tests/dsh-migration/conversation-learning.spec.ts tests/dsh-migration/conversation-task-material.spec.ts tests/dsh-migration/conversation-observer.spec.ts tests/dsh-migration/conversation-feedback.spec.ts tests/dsh-migration/conversation-guidance-loop.spec.ts tests/dsh-migration/conversation-guidance-ledger.spec.ts
pnpm run typecheck
git diff --check
```

- The focused run passed 6 files / 185 tests.
- TypeScript package typecheck passed.
- `git diff --check` passed.

Logs are retained under `E:/待清理/D盘迁移-2026-09-08/Tianwen-自然入口复用-022/visible-material-fix/`.

## Coverage boundary

- Parser coverage proves markerless sources still parse as legacy and that explicit `null`, `undefined`, and an unknown version are rejected.
- The native Session projection test proves the legacy call path still contains the original reasoning/tool-call blocks, while `surface-text.v1` preserves only user content, assistant text, role and identity; the existing eight-turn context test still passes.
- The observer integration creates a normal streamed assistant reasoning block above 96 KiB.  It proves the next admission, recovered task material, and both independently persisted native review materials retain visible text but exclude that reasoning.
- The feedback integration creates the same oversized streamed reasoning, records native feedback, and recovers the actual feedback judgment material; its answer and persisted judgment material exclude hidden reasoning.
- The focused guidance-loop and guidance-ledger suites did execute their existing persisted recovery matrix (including `recover`, `recover-formatting`, feedback recovery and tamper paths).  They are regression coverage for downstream recovery, not a newly added marker-specific study scenario.  No study, feedback, or historical ledger was manufactured or rewritten for this task.

Remaining work is intentionally outside Task 1: independent diff review, current full gates, artifact rebuild/delivery, and any bounded corrected-version real-use decision remain main-agent work.
