# Tianwen Live Goal Minimal Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove offline, then with one separately approved fresh live Goal, that the already-selected `update_goal` call can finish encoding and complete the Goal without weakening any receipt, tool, retry, request-count, or governance boundary.

**Architecture:** Keep the installed public DSH AgentLoop, Goal service, tool surface, authority section, adapter, and strict assessor unchanged. Raise only the existing per-request output ceiling from `64` to `128`, after a cap-sensitive scripted regression has reproduced the observed truncation. The same installed-product E2E must reject any request that does not carry `max_tokens: 128`.

**Tech Stack:** TypeScript 6, Node.js 22, DeepSeek Harness `0.1.0-rc.6` public package roots, Vitest 4, the existing Runtime Bundle installer, and the existing Python Alpha gates.

## Global Constraints

- The durable live trace is Runtime integration evidence, not an Alpha-C `LearningSignal`.
- The prior Goal has consumed its only round. Never resume, replay, extend, or mutate it.
- No paid provider call is allowed in Tasks 1-3. Task 4 starts only after the controller obtains one cumulative numeric token/CNY approval.
- Production behavior changes only at `LIVE_GOAL_LIMITS.maxOutputTokensPerRequest`: `64` becomes `128`.
- Keep `maxRequests: 3`, `maxTotalTokens: 32768`, `maxCostCny: 0.25`, `timeoutMs: 90000`, and `maxRetries: 0` unchanged.
- Keep the exact authority text, two-tool surface, execution guard, durable tool-result ordering, marker check, usage validation, receipt schema, sanitization, and governance checks unchanged.
- Use only public installed DSH roots. Do not add `tool_choice`, injection, a custom adapter, a DSH fork, a private `src` import, or a general Runtime framework.
- All heavy gates run serially. Caches, environments, installed Profiles, receipts, and test data stay under `D:\DevData`. Do not run real Docker.
- Preserve history: no rebase, squash, force-push, or rewriting of existing branches.

---

### Task 1: Lock the observed truncation into an offline RED test

**Files:**
- Modify: `tests/dsh-migration/goal-live-smoke.spec.ts`

**Interfaces:**
- Reuse the function-valued `ScriptEntry` already accepted by `ScriptedAdapter`.
- Feed the actual AgentLoop a second response containing `block-start`, an `update_goal` `tool-call-delta`, usage with `outputTokens: 64`, and `finish: max-tokens`, deliberately without `block-end`.

- [ ] **Step 1: Add a reusable truncated-response fixture**

Import the public `CallId` and `StreamChunk` types through `@tianwen/dsh-compat` if exported there; otherwise use the public `@deepseek-ai/dsh-llm` package root already installed. The fixture must contain the tool name `update_goal`, a synthetic partial argument delta, valid usage, and no raw production arguments or live trace text:

```ts
function truncatedUpdateGoalResponse(): readonly StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    {
      type: 'tool-call-delta', index: 0,
      id: CallId('live-complete-truncated'), name: 'update_goal',
      argumentsDelta: '{"partial":"' + 'x'.repeat(48),
    },
    { type: 'usage', usage: { inputTokens: 126, outputTokens: 64, cacheReadTokens: 1536 } },
    { type: 'finish', reason: { kind: 'max-tokens' } },
  ]
}
```

The exact synthetic delta length is not a product contract. The contract is: a named, unfinished call without `block-end` must never become a durable `tool/call`.

- [ ] **Step 2: Add the permanent safe-failure characterization**

Run the existing persisted Goal/resume harness with:

```ts
[
  withUsage(toolCallResponse('live-action', 'tianwen_smoke_action', {}), 100),
  truncatedUpdateGoalResponse(),
]
```

Expect `status: failed`, `failureCode: usage-invalid`, `requestCount: 2`, `retryCount: 0`, and no third provider request. Inspect durable events and require exactly one tool call/result pair, both for `tianwen_smoke_action`; require no `update_goal` `tool/call`. Resume read-only for inspection and require the Goal to remain `active`, `disarmed`, with `roundsStarted: 1`.

- [ ] **Step 3: Add a cap-sensitive success regression**

Use a function for response two:

```ts
request => request.maxTokens === 128
  ? withUsage(toolCallResponse('live-complete', 'update_goal', {
      goal_id: String(goal.id), revision: 2, action: 'complete',
    }), 126)
  : truncatedUpdateGoalResponse()
```

Response one is the fixed action and response three is the fixed marker. Expect the existing strict success contract: three requests, action call/result then update call/result, exact marker, Goal `complete`, two Evidence items, unchanged governance, and sanitized receipt.

- [ ] **Step 4: Run RED before product code changes**

```powershell
& 'D:\hermes\node\node.exe' 'D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs' exec vitest run tests/dsh-migration/goal-live-smoke.spec.ts -t "cap-sensitive"
```

Expected: failure because request two still carries `maxTokens: 64`, takes the truncated branch, and the strict receipt is `usage-invalid` rather than passed. Preserve the command and failure summary in the worker report; do not weaken the expectation.

### Task 2: Apply the one-value fix and prove both source and installed paths

**Files:**
- Modify: `packages/tianwen-runtime-bundle/src/goal-live-smoke.ts`
- Modify: `tests/dsh-migration/goal-live-smoke.spec.ts`
- Modify: `tests/dsh-migration/fixtures/deepseek-goal-round-fetch.cjs`
- Modify: `tests/dsh-migration/tianwen-startup.e2e.spec.ts`

- [ ] **Step 1: Change only the fixed output ceiling**

```ts
export const LIVE_GOAL_LIMITS = {
  maxRequests: 3,
  maxOutputTokensPerRequest: 128,
  maxTotalTokens: 32768,
  maxCostCny: 0.25,
  timeoutMs: 90000,
  maxRetries: 0,
} as const
```

Do not change `resume-runner.ts`, authority text, tools, guards, request hooks, assessor rules, receipt fields, or another limit.

- [ ] **Step 2: Update exact contract assertions**

Change every live Goal receipt/request expectation in `goal-live-smoke.spec.ts` from `64` to `128`. Do not alter the separate ordinary model live-smoke limit.

- [ ] **Step 3: Make the fake installed transport enforce the wire value**

In `deepseek-goal-round-fetch.cjs`, reject before returning a response unless:

```js
if (body.max_tokens !== 128) fail('unexpected max_tokens')
```

Retain all existing URL, method, streaming-usage, tool-list, Goal-authority, revision, request-count, and sanitization checks.

- [ ] **Step 4: Update the installed receipt assertion**

Change only the live Goal `maxOutputTokensPerRequest` expectation in `tianwen-startup.e2e.spec.ts` to `128`. The sanitized trace must continue to prove three requests and `max_tokens: 128` without persisting prompts, arguments, response bodies, or credentials.

- [ ] **Step 5: Run focused GREEN and commit atomically**

```powershell
& $node $pnpm --filter '@tianwen/runtime-bundle' build
& $node $pnpm exec vitest run tests/dsh-migration/goal-live-smoke.spec.ts
& $node $pnpm run typecheck
git diff --check
```

Expected: every command exits `0`; the cap-sensitive test now takes the complete-call branch and the characterization still proves an unfinished call is never executed. Stage only the four Task 2 files and commit:

```powershell
git commit -m "fix: allow complete live Goal update call"
```

### Task 3: Independent reviews and complete offline release gates

**Files:**
- Verify: the entire branch diff from `33008cd388e5cb1655aa9d5ade862daedbb7ed93`
- Do not create live state or receipts.

- [ ] **Step 1: Run independent correctness and Ponytail/YAGNI reviews**

The correctness reviewer must verify the durable-root-cause match, RED validity, public DSH boundary, exact one-value production diff, strict no-fabrication behavior, and unchanged receipt/governance gates. The Ponytail reviewer must look only for unnecessary code, abstraction, dependency, or policy. Any Critical/Important finding blocks live authorization; verify findings before fixing and re-review the focused diff.

- [ ] **Step 2: Run all offline gates serially with D-drive storage**

Set `CI=true`, `COREPACK_HOME=D:\DevData\corepack-home`, `PNPM_HOME=D:\DevData\pnpm-home`, `PNPM_STORE_DIR=D:\DevData\pnpm-store`, `UV_CACHE_DIR=D:\DevData\uv-cache`, `UV_PROJECT_ENVIRONMENT=D:\DevData\tianwen-goal-cap-128\python-env`, `TEMP/TMP=D:\DevData\tianwen-goal-cap-128\temp`, and `TIANWEN_DSH_PROBE_ROOT=D:\DevData\tianwen-dsh-probe`. Then run in this order:

```powershell
& $uv sync --frozen --offline --python 3.11
& $node $pnpm install --offline --frozen-lockfile --trust-lockfile --store-dir 'D:\DevData\pnpm-store'
& $node $pnpm --filter '@tianwen/runtime-bundle' build
& $node $pnpm run check:dsh-install
& $node $pnpm run check:no-private-dsh-imports
& $node $pnpm run typecheck
& $node $pnpm exec vitest run tests/dsh-migration/goal-live-smoke.spec.ts tests/dsh-migration/goal-resume.spec.ts tests/dsh-migration/model-live-smoke.spec.ts tests/dsh-migration/runtime-bundle.spec.ts
& $node $pnpm exec vitest run
```

Run the existing installed E2E once with `TIANWEN_DSH_PHASE2_STARTUP=1` and `TIANWEN_E2E_DATA_DIR=D:\DevData\tianwen-goal-cap-128\test-data\installed-e2e`, clearing both variables in `finally`. Then run `pnpm run test:dsh:sandbox`, Python A1-A5, full pytest, Ruff, `git diff --check 33008cd388e5cb1655aa9d5ade862daedbb7ed93..HEAD`, and `git status --short`. No command may enable a real provider or real Docker.

- [ ] **Step 3: Re-review the final offline commit**

Require clean correctness and Ponytail verdicts after any fix. Record exact command counts, pass counts, branch HEAD, and clean status. Only then tell the controller the live gate is ready.

### Task 4: Create one fresh Goal, validate live, and archive the stage

**Files:**
- Create after the attempt: `docs/operations/tianwen-deepseek-v4-pro-live-goal-minimal-fix-handoff.md`
- Modify after the stage branch is pushed: `docs/architecture-master-session-memory.md`

- [ ] **Step 1: Ask once for the cumulative live-stage ceiling**

The controller proposes a concrete cumulative token/CNY limit after offline gates. Approval covers only freshly created fixed one-round Goals within that cumulative ceiling; it never authorizes replay of the prior Goal, automatic retry, a larger Goal, or a broader tool surface.

- [ ] **Step 2: Recheck current official pricing and install exact reviewed HEAD**

Verify pricing against the official provider page and stop if the offline cost assumptions are stale. Install the reviewed commit under a fresh `D:\DevData` root, select the fixed model without a request, create a brand-new exact Goal with `maxGoalRounds: 1`, and prove pristine zero-request preflight.

- [ ] **Step 3: Execute the new chain once**

Launch the installed strict resume once and wait on that same process handle. Success requires the honest durable sequence `tianwen_smoke_action` success → `update_goal` call/result → Goal complete → exact marker, three requests, zero retries, valid usage/cost, two Evidence items, and unchanged governance. A process ambiguity is a consumed attempt, not permission to replay.

- [ ] **Step 4: Restore offline and write canonical evidence**

Restore the saved model to offline in `finally`. Persist only the already-sanitized canonical receipt bytes and SHA-256 under `D:\DevData`. Record the fresh Goal/Session ids only where the existing handoff policy permits. State explicitly that this is Runtime repair evidence, not continual-learning evidence.

- [ ] **Step 5: Close Git without rewriting history**

After independent correctness and Ponytail review, commit the handoff, push `codex/tianwen-real-goal-minimal-fix` normally, and verify the remote branch SHA equals local HEAD. Then make a docs-only canonical memory update on current `main`, push normally, and verify local main, `origin/main`, and GitHub main at exact SHAs. The next entry is Runtime freeze followed by Alpha-B; Alpha-C and Alpha-D remain gated.
