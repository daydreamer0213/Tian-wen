# Tianwen Conversation Goal Feedback Implementation Plan

Date: 2026-08-31

Status: ready for implementation

Design:
[`2026-08-31-tianwen-conversation-goal-feedback-design.md`](../specs/2026-08-31-tianwen-conversation-goal-feedback-design.md)

## Objective

Make the original DSH conversation tell the user whether a continuous Goal is
planning, running, paused, blocked, or complete. Ordinary progress is a compact
zero-model Goal bar above the composer. A terminal or blocked transition gets
one read-only natural summary in the same conversation when the bound control
Agent is available.

This plan does not change the v3 Goal/Task data model, add polling, add a second
UI, or wake the model after every Task.

## Baseline

- Branch: `codex/goal-chat-feedback`.
- Design commit: `f3f49db`.
- Runtime baseline: `@tianwen/runtime-bundle@0.1.5` on DSH `0.1.1-rc.2`.
- The repository-wide `pnpm run check` baseline was run once. TypeScript and
  install/import checks passed; the remaining failures require external probe
  environment variables or controlled-worktree identities and are not feature
  regressions. Do not repeat the whole gate after every small edit.

## Task 1: Pure Goal-bar projection

**Files**

- Add: `packages/tianwen-runtime-bundle/src/conversation-goal-feedback.tsx`
- Modify: `tests/dsh-migration/learn-loop-client.spec.ts`

1. Add RED table tests for selecting a v3 summary by the current control
   Session. Active/planning/blocked/paused work beats historical completion;
   otherwise use the newest completed v3 record. V1/v2 never appear.
2. Add RED table tests for the compact presentation model: planning, running,
   paused, blocked, complete, and unavailable. Require objective, current or
   latest Task, current-plan counts, and user-attention copy; reject internal
   IDs, percentages, raw errors, and full Task replies.
3. Implement the smallest pure selectors and presentation mapper.
4. Run:

   ```powershell
   pnpm exec vitest run tests/dsh-migration/learn-loop-client.spec.ts
   ```

## Task 2: Event-driven `conversation.input.dock`

**Files**

- Modify: `packages/tianwen-runtime-bundle/src/conversation-goal-feedback.tsx`
- Modify: `packages/tianwen-runtime-bundle/src/client.tsx`
- Modify: `tests/dsh-migration/learn-loop-client.spec.ts`
- Modify: `tests/dsh-migration/learn-loop-client-module.spec.ts`

1. Add RED tests that `apply()` keeps the existing sidebar registration and
   also registers exactly one `conversation.input.dock` entry.
2. Add RED lifecycle tests for mount refresh, framework snapshot invalidation,
   Session-list invalidation, burst coalescing, abort on Session switch or
   unmount, and rejection of late stale responses. Assert no timer exists.
3. Implement `ConversationGoalDock` with the current `session.sessionId`, the
   existing list/detail RPCs, one in-flight request, and a generation guard.
4. Render a single compact row using DSH theme variables. Do not add mandatory
   controls. A details affordance may open the existing Long Goal panel only if
   this reuses an existing callback without adding another state flow.
5. Register Chinese and English strings through the existing locale namespace.
6. Run the two focused client test files.

## Task 3: Bounded terminal settlement notice

**Files**

- Add: `packages/tianwen-runtime-bundle/src/continuous-goal-feedback.ts`
- Add: `tests/dsh-migration/continuous-goal-feedback.spec.ts`

1. Add RED tests for a complete multi-Task Goal, a blocked current Task, an
   abandoned Task, missing final replies, malicious instructions inside Task
   output, and enough output to cross both limits.
2. Implement one deterministic builder with a 12,000-character total ceiling
   and 2,000-character per-reply ceiling. Preserve objective and phase before
   reply text, prefer newest results, and state the omitted older-result count.
3. Emit a DSH `source.kind=plugin`,
   `plugin=tianwen-continuous-goal`, `form=notice` message. Label all Task
   replies untrusted historical execution data. Include no internal identities.
4. Keep the module pure: it builds the settlement notice but does not own Agent
   scheduling, retries, or persistence.
5. Run its focused test file.

## Task 4: Host terminal and blocked delivery

**Files**

- Modify: `packages/tianwen-runtime-bundle/src/continuous-goal-host.ts`
- Modify: `packages/tianwen-runtime-bundle/src/long-goal-host.ts`
- Modify: `tests/dsh-migration/continuous-goal-host.spec.ts`

1. Add RED Host tests proving:
   - `goal/changed complete` still flushes and continues exactly once;
   - a continued Goal that is now complete schedules one delivery intent;
   - `goal/changed block` flushes, rereads the blocked projection, does not
     continue the Planner, and schedules one attention delivery;
   - duplicate callbacks deduplicate within the live Host;
   - the per-Goal lane is released before delivery waits for control-Agent
     idle, so a simultaneous `goal_control` call cannot deadlock;
   - missing Agent or failed delivery does not reclassify the durable Goal.
2. Extend the public listener only for exact `complete` and `block` operations.
   Keep all persistence/continuation work inside the existing lane. Record a
   process-local delivery key after the authoritative commit, then start the
   idle wait outside the lane.
3. Wire delivery in `long-goal-host.ts`: find the exact bound control Agent,
   wait for idle, recheck Session binding and durable revision/state, inspect
   settled Task Sessions through the existing public persistence path, and
   build the notice from Task 3.
4. Immediately before the terminal `followup`, install an Agent-scoped DSH tool
   guard that denies every tool for this summary Turn. Await Turn end and flush,
   then dispose the guard in `finally`. Add tests proving one followup, one
   natural summary Turn, zero tool execution, and no `goal_control` mutation.
5. Do not call `inject`, do not append a synthetic assistant message, and do
   not add a retry or persistent notification ledger.
6. Run:

   ```powershell
   pnpm exec vitest run tests/dsh-migration/continuous-goal-feedback.spec.ts tests/dsh-migration/continuous-goal-host.spec.ts
   ```

## Task 5: Focused integration and Runtime 0.1.6

**Files**

- Modify version-bound Runtime/Desktop/installer scripts and their existing
  tests from Runtime `0.1.5` to `0.1.6`.
- Modify: `docs/tianwen-architecture-overview-v2.md`
- Add: `docs/operations/tianwen-conversation-goal-feedback-handoff.md`

1. Run the focused feature suite, Runtime bundle tests, TypeScript, Runtime
   build, installer tests, and Desktop host/artifact tests. Re-run only a test
   whose failure is causally related to the change; retain unrelated
   environment failures honestly.
2. Review the diff for private DSH imports, new polling, extra data stores,
   accidental tool access in the summary Turn, and UI duplication.
3. Bump the local Runtime to `0.1.6` and update the existing exact archive-name
   seams mechanically. Build one archive under `D:\DevData`; do not put caches
   or artifacts on `C:`.
4. Upgrade the existing official product root at
   `D:\DevData\tianwen-experience` with the official installer path, preserving
   its Sessions and configuration. Verify the installed Runtime version and
   launch the Desktop from its existing shortcut/product entry.
5. Execute one useful continuous Goal with the configured DeepSeek exactly
   once. Confirm at least one Task boundary changes the original conversation's
   Goal bar and that terminal or blocked state appears there. Do not rerun to
   select a better model answer. Provider usage and cost remain external facts.
6. Record deterministic results separately from the one real product-path
   result. Update the architecture overview so future work does not rediscover
   the old “feedback deferred” state.

## Task 6: Review and integration

1. Ask an independent reviewer for correctness and over-engineering findings.
   Fix only concrete Critical/Important issues and rerun only affected tests.
2. Commit the implementation and release/handoff evidence in reviewable units.
3. Push the feature branch for recovery. Merge to `main` only after focused
   gates and installed-product acceptance pass; then push exact `main`.
4. Check exact-main CI once after the push. CI may finish later and does not
   justify blocking unrelated local work or creating a repeated monitor unless
   the user asks for one.

## Completion contract

The stage is complete when the installed Desktop's original control
conversation visibly reports continuous-Goal progress and terminal/blocked
state, terminal summary Turns cannot mutate tools or Goal state, focused gates
pass, current product documentation matches the code, and the accepted commits
are pushed. No DSH upstream change or external package release is required.
