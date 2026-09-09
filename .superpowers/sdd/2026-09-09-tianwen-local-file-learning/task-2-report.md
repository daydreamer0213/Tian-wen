# Task 2 report: native local-file task capture

## Result

Implemented the Task 2 capture and replay boundary without opening Task 3/4 review, trial, or study-selection behavior. Root `read`/`write`/`edit` calls can now contribute immutable local UTF-8 file evidence; capture failure only makes that learning evidence unavailable and does not fail or alter the already-authorized file operation. Successful `local-files` model reviews remain top-level `inconclusive` in this task.

The local-file admission identity is frozen before the answer as `fileOutputKind: 'files' | 'chat'`. Historical non-file admission and completion objects omit all new optional fields, preserving their shapes and hashes.

## Implementation

- Moved the pure entry contracts, bounds, parser, and BOM-preserving behavior into Evolution, and re-exported them from the runtime helper.
- Added strict, data-only file material/result contracts. File output requires a nonempty exact output subset; chat output requires no output paths and at least one readable captured input.
- Extended the private conversation-learning record union and projections with first-input capture, unavailability, and optional completion file results. Domain checks freeze the first case-insensitive path/call identity and enforce admission, timing, count/byte, digest, path, output-kind, and completed-status bindings.
- Added the native observer before the ordinary conversation observer. It observes only root native file calls at around-dispatch, shares concurrent capture promises, checks consent before and after reads, appends the preimage before delegation, freezes final bytes at awaited turn stopping, and disposes all hooks/state with the service.
- Added data-only recovery from the recorded native event span. Recovery verifies cwd, call identity/arguments/path, successful results, output kind, mutation coverage, capture boundary, and digest. It never reads current files, and invalid file replay only omits `files` while retaining request/context recovery.
- Updated admission schema/instructions and completion binding. No model call, foreground steering, argument rewrite, guessed-file read, new work tool, file-result review, trial, or study selection was added.

## TDD and debugging evidence

Focused RED commands used while introducing the contracts:

```text
D:/hermes/node/node.exe node_modules/vitest/vitest.mjs run tests/dsh-migration/conversation-learning.spec.ts -t "freezes the first file preimage" --reporter=dot
```

Result: failed because `local-files` was not accepted by the admission parser.

```text
D:/hermes/node/node.exe node_modules/vitest/vitest.mjs run tests/dsh-migration/conversation-file-material.spec.ts -t "parses strict file and read-to-chat material" --reporter=dot
```

Result: failed because the Evolution-owned strict material parser did not yet exist; the following domain RED also rejected neither a missing final output nor the new result binding.

```text
D:/hermes/node/node.exe node_modules/vitest/vitest.mjs run tests/dsh-migration/conversation-file-observer.spec.ts --reporter=dot
```

Initial results: first failed on the missing observer module, then the genuine native write reached disk but `fileInputs` was absent. Tracing the real dispatch/session event showed the root filter imported a nonexistent local controlled-preset symbol. Importing the canonical runtime preset fixed that binding. The initial runtime-bundle noEmit check then reported five `exactOptionalPropertyTypes` assignments to `undefined`; deleting the optional pending snapshot instead fixed all five.

Focused GREEN after the final unsafe-path and mixed read/write cases:

```text
D:/hermes/node/node.exe node_modules/vitest/vitest.mjs run tests/dsh-migration/conversation-file-observer.spec.ts --reporter=dot
```

```text
Test Files  1 passed (1)
Tests       9 passed (9)
Duration    3.86s
```

These native cases use the genuine local filesystem plugin and native read/write tools under unique `D:/DevData/tianwen-conversation-tests` child roots. They cover actual mutation with retained preimage, read/write/reread, concurrent same-path capture, successful read-to-chat, failed read, mixed chat write, missing output, oversized and durable-append capture failures, unsafe path, interruption, consent withdrawal, restart recovery, and cross-turn snapshot isolation. Expected capture warnings are explicitly intercepted and asserted.

## Final verification

Relevant observer/domain/material/feedback regression group:

```text
D:/hermes/node/node.exe node_modules/vitest/vitest.mjs run tests/dsh-migration/conversation-learning.spec.ts tests/dsh-migration/conversation-file-material.spec.ts tests/dsh-migration/conversation-file-observer.spec.ts tests/dsh-migration/conversation-task-material.spec.ts tests/dsh-migration/conversation-observer.spec.ts tests/dsh-migration/conversation-judgment.spec.ts tests/dsh-migration/conversation-feedback.spec.ts tests/dsh-migration/message-feedback-bridge.spec.ts --reporter=dot
```

```text
Test Files  8 passed (8)
Tests       124 passed (124)
Duration    24.15s
```

Package type checks and whitespace validation:

```text
D:/hermes/node/node.exe node_modules/typescript/bin/tsc -p packages/tianwen-evolution/tsconfig.json --noEmit --pretty false
D:/hermes/node/node.exe node_modules/typescript/bin/tsc -p packages/tianwen-runtime-bundle/tsconfig.json --noEmit --pretty false
git diff --check
```

All exited 0 with no output.

## Changed files

- `packages/tianwen-evolution/src/conversation-files.ts`
- `packages/tianwen-evolution/src/conversation-learning.ts`
- `packages/tianwen-evolution/src/index.ts`
- `packages/tianwen-runtime-bundle/src/conversation-file-observer.ts`
- `packages/tianwen-runtime-bundle/src/conversation-file-material.ts`
- `packages/tianwen-runtime-bundle/src/conversation-observer.ts`
- `packages/tianwen-runtime-bundle/src/conversation-judgment.ts`
- `packages/tianwen-runtime-bundle/src/conversation-task-material.ts`
- `packages/tianwen-runtime-bundle/src/runtime.ts`
- `tests/dsh-migration/conversation-file-observer.spec.ts`
- `tests/dsh-migration/conversation-file-material.spec.ts`
- `tests/dsh-migration/conversation-learning.spec.ts`
- `.superpowers/sdd/2026-09-09-tianwen-local-file-learning/task-2-report.md`

## Concerns and handoff

No known Task 2 correctness blocker remains. File evidence is intentionally not a positive review or study candidate yet: Task 3/4 must consume the separately bound original final artifacts and replay material under their own review/selection contracts. Composite/Code Mode and any non-native work tool remain deliberately ineligible.
