# Tianwen Task 5A report

## Product boundary

- The existing Learn Loop sidebar panel remains an optional advanced-history
  entry; it does not open automatically and no second continuous-mode UI was
  added.
- Continuous v3 Goals now use the existing list and detail rows, including
  running, paused, blocked, and complete history projections.
- v3 details reuse the existing current/completed/next/abandoned Task groups.
  Legacy Continue, Guidance, and Abandon controls are hidden; the panel points
  users back to the original DSH conversation for continuous control.
- Settled v3 Task feedback and safe learning-clue projection reuse the existing
  v2 paths with exact v2/v2 or v3/v3 schema matching.

## RED/GREEN

- RED: 5 focused assertions failed before implementation: v3 list/detail was
  rejected by the Host and strict client parser, settled feedback returned an
  empty list, v3 learning-clue sources were omitted, and the compiled client
  could not open a v3 history row.
- GREEN: the same four focused test files pass after the minimal structural
  compatibility change: 89 passed, 0 failed.

## Verification

- `pnpm --filter @tianwen/runtime-bundle typecheck` — passed.
- Focused Task 5A run — 4 files, 89 tests passed.
- Runtime bundle build, including the compiled DSH client module — passed.
- `git diff --check` — passed.
- No Provider or model request was made.

## Review fix round 1

- Review reproduced a transport-only escape: a caller could send the legacy
  `continue-progress` RPC for a v3 Goal, letting the generalized service start
  Planner/Task work before the v2 response adapter rejected the result.
- RED: the new Host regression showed all three legacy mutation transports
  (`add-guidance`, `continue-progress`, and `abandon-current-task`) calling their
  operations for a v3 record.
- GREEN: one shared RPC guard now reads the target record and requires exact v2
  before invoking any legacy mutation operation. Internal continuous Host calls
  still use the generalized service directly and are unchanged.
- Focused Host result after the fix: 42 passed, 0 failed.

## Review fix round 2

- Review found that the shared transport guard depended on Task runner services,
  which broke a valid standalone v2 Host configured with only status reads and
  Goal-first operations.
- RED: all three v2 legacy mutations failed with `mutation dependencies are
  unavailable` when `runDependencies` was absent.
- GREEN: the guard now uses the RPC handler's existing status reader and
  requires exact v2 before dispatch. Standalone v2 mutations remain available,
  while v3 mutations still reject before any operation is called.
- Focused Host result after the compatibility fix: 43 passed, 0 failed.

## Deliberate omissions

- No dashboard, Goal composer, Task editor, polling loop, scheduler, retry, or
  new default entry was added.
- v2 manual Goal behavior and its existing panel controls remain unchanged.
