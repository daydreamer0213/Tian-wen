# Tianwen DeepSeek V4 Pro Live Goal Round Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add and prove one explicit, budget-bounded Tianwen Goal round that uses DeepSeek V4 Pro, calls the fixed Tianwen smoke action, completes the same Goal, and leaves replayable Session/Evidence without changing evolution governance.

**Architecture:** Extend the existing explicit `tianwen resume` path with one fixed `--live-smoke --json` mode. The host performs immutable Goal/Session preflight, while the existing installed DSH AgentLoop owns the round; an agent-scoped section supplies the exact live Goal reference, an agent-scoped restriction exposes exactly two tools, and public request hooks enforce route, output, request-count, retry, and timeout boundaries. Ordinary create/list/status/resume/model behavior remains unchanged.

**Tech Stack:** TypeScript 6, Node.js 22, DeepSeek Harness `0.1.0-rc.6` public package roots, Vitest 4, existing Tianwen Runtime Bundle installer, Python 3.12/pytest/Ruff for retained closure gates.

## Global Constraints

- The only paid route is `deepseek-official/deepseek-v4-pro`; every automated test is offline.
- The fixed objective is exactly `Call tianwen_smoke_action exactly once. After it succeeds, mark this Goal complete with update_goal, then reply exactly TIANWEN_GOAL_ROUND_OK.` and `maxGoalRounds` is exactly `1`.
- The visible tool surface is exactly `tianwen_smoke_action` plus `update_goal`; `get_goal`, `create_goal`, filesystem, shell, web, subagent, workflow, job, and all other tools stay hidden.
- A fixed agent-scoped system-prompt section exposes only the current Goal id/revision and the frozen call order/marker; it does not expose credentials, arbitrary prompts, user files, pricing, or another capability.
- The request route is fixed, `reasoningEffort` is `off`, `maxTokens` is `64`, exactly three model requests are accepted, a fourth is rejected before provider dispatch, and no provider failure is retried or sent to a fallback.
- The whole resumed round is bounded to `90_000` ms and one Goal round.
- Reported disjoint token total is capped at `32_768`; the operator ceiling is CNY `0.25`; `reasoningTokens` are informational and are not double-counted beyond `outputTokens`.
- Success requires the action call/result, then `update_goal` call/result, then exact final marker, each at the expected count and order; text-only success fails.
- Product output is a sanitized `tianwen.goal-live-smoke.v1` JSON receipt. It never contains the key, headers, raw provider body, reasoning, model text, full system prompt, objective, raw tool arguments/results, or user-file data.
- Preflight failure causes zero model requests, zero Goal mutation, and zero new Session events. Once resume is accepted, genuine history is preserved; failures are not rolled back or replayed.
- Success or failure consumes the one live request chain. No worker, reviewer, test, or controller starts a second chain.
- Tests, caches, temporary files, package stores, Python environments, installed Profiles, and receipts stay under `D:\DevData`; no real Docker is invoked.
- DSH stays at `0.1.0-rc.6`; no fork, private `src` import, dependency upgrade, UI, daemon, scheduler, generic billing framework, policy DSL, or unrelated refactor is added.
- Realistic threat model: trusted installed Tianwen/DSH code and same-process reviewed plugins are in scope; a compromised host or same-user malicious process is not treated as a normal development blocker.

---

## File map

- `packages/tianwen-runtime-bundle/src/goal-live-smoke.ts`: frozen constants, receipt types/factories, strict Session/usage/tool/marker assessment, and agent-scoped policy helpers.
- `packages/tianwen-runtime-bundle/src/resume.ts`: immutable strict-mode host preflight and fixed child environment; ordinary resume remains byte-for-byte compatible at its public return shape.
- `packages/tianwen-runtime-bundle/src/resume-runner.ts`: existing resume orchestration plus the opt-in strict live branch.
- `packages/tianwen-runtime-bundle/src/cli.ts`: exact `--live-smoke --json` grammar and sanitized preflight-failure receipt.
- `packages/tianwen-runtime-bundle/resume.patch.yml`: pass one boolean mode flag to the existing runner.
- `tests/dsh-migration/goal-live-smoke.spec.ts`: focused offline RED/GREEN contract, failure, timeout, retry, sanitization, and CLI/preflight tests.
- `tests/dsh-migration/runtime-bundle.spec.ts`: compiled/metafile/tarball closure for the new internal source file.
- `tests/dsh-migration/fixtures/deepseek-goal-round-fetch.cjs`: test-only in-process fake DeepSeek SSE transport that rejects every unexpected fetch and persists only a sanitized request summary.
- `tests/dsh-migration/tianwen-startup.e2e.spec.ts`: extend the existing single-install tarball E2E with one strict Goal round under an environment-selected isolated D-drive root; do not duplicate the installer harness.
- `docs/operations/tianwen-deepseek-v4-pro-live-goal-round-handoff.md`: controller-owned canonical stage evidence after offline gates and the one live attempt.
- `docs/architecture-master-session-memory.md`: main-branch docs-only pointer after the stage branch is pushed.

### Task 1: Freeze the CLI and immutable preflight boundary

**Files:**
- Create: `packages/tianwen-runtime-bundle/src/goal-live-smoke.ts`
- Modify: `packages/tianwen-runtime-bundle/src/resume.ts`
- Modify: `packages/tianwen-runtime-bundle/src/cli.ts`
- Modify: `packages/tianwen-runtime-bundle/resume.patch.yml`
- Create: `tests/dsh-migration/goal-live-smoke.spec.ts`
- Regression test: `tests/dsh-migration/goal-resume.spec.ts`

**Interfaces:**
- Consumes: `DurableGoalSnapshot` from `status.ts` and the existing `ResumePreflight`/installed DSH resolver.
- Produces: `LIVE_GOAL_OBJECTIVE`, `LIVE_GOAL_MARKER`, `LIVE_GOAL_PROVIDER`, `LIVE_GOAL_MODEL`, `LIVE_GOAL_LIMITS`, and `GoalLiveSmokeReceipt` from `goal-live-smoke.ts`.
- Produces: `preflightGoalResume(goalId, dataDir, liveSmoke = false)`; ordinary calls return the existing six-field object, strict calls additionally return `liveSmoke: true`.
- Produces: `createGoalLiveSmokeFailure(failureCode, options = {})`, where `options.now` is injectable and Goal/Session facts are optional verified values; unverified CLI input is never copied into the receipt.

- [ ] **Step 1: Write failing CLI grammar tests**

In `goal-live-smoke.spec.ts`, spawn the built CLI and accept only:

```ts
[
  'resume', '--goal', goalId,
  '--data-dir', dataDir,
  '--live-smoke', '--json',
]
```

Add parse/grammar cases that expect exit `2`, no stdout, usage on stderr, and no state mutation for missing `--json`, missing `--goal`, relative data dir, `--live-smoke` on create/status/list/model, arbitrary `--objective`, arbitrary `--max-rounds`, and a second positional. Add separate validly parsed strict-preflight cases for data dir equal to `D:\DevData` and data dir outside `D:\DevData`; those expect exit `1`, exactly one sanitized failure JSON line, empty stderr, and no state mutation. Keep ordinary `resume --goal ... --data-dir ... [--json]` accepted.

- [ ] **Step 2: Write failing strict preflight tests**

Use `mountGoalHarness()` to persist exact Session fixtures with a Node `randomUUID()` value prefixed by `tianwen-goal-`. The valid fixture has one `goal/change` create event and no other event. Expect:

```ts
await expect(preflightGoalResume(goalId, dataDir, true)).resolves.toEqual({
  dataDir,
  evolutionRoot: join(dataDir, 'state', 'evolution'),
  goalId,
  revision: 1,
  sessionId,
  sessionsRoot: join(dataDir, 'dsh-home', 'sessions'),
  liveSmoke: true,
})
```

Add one fixture each for wrong objective, paused/blocked/complete phase, revision other than `1`, rounds started, max rounds other than `1`, a prior `request/header`, a prior `step/start`, and a prior tool event. Snapshot the data tree before every preflight and prove byte equality afterward.

- [ ] **Step 3: Write failing sanitized failure-receipt tests**

Expect a zero-request factory result shaped as:

```ts
expect(createGoalLiveSmokeFailure('preflight-rejected', { now: fixedNow })).toEqual({
  schemaVersion: 'tianwen.goal-live-smoke.v1',
  status: 'failed',
  failureCode: 'preflight-rejected',
  timestamp: '2026-08-16T12:34:56.789Z',
  provider: 'deepseek-official',
  model: 'deepseek-v4-pro',
  limits: {
    maxRequests: 3,
    maxOutputTokensPerRequest: 64,
    maxTotalTokens: 32768,
    maxCostCny: 0.25,
    timeoutMs: 90000,
    maxRetries: 0,
  },
  requestCount: 0,
  retryCount: 0,
  markerMatched: false,
})
```

Use a runtime-generated secret-shaped `--goal` value plus objective/key/error sentinels and assert none occur in `JSON.stringify(receipt)`. A valid Goal id is added only after durable inspection has matched and validated that Goal.
Add pure child-output parser cases for one canonical receipt line, two lines, invalid JSON, wrong schema, a 65,537-byte stdout, and arbitrary stderr sentinel. Only the first passes; every rejection produces a sanitized `internal-error` without copying stderr.

- [ ] **Step 4: Run RED for Task 1**

Run:

```powershell
& 'D:\hermes\node\node.exe' 'D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs' exec vitest run tests/dsh-migration/goal-live-smoke.spec.ts tests/dsh-migration/goal-resume.spec.ts
```

Expected: focused failures because `--live-smoke`, strict preflight, constants, and receipt factory do not exist. Existing ordinary resume assertions must remain green.

- [ ] **Step 5: Add the fixed contract module**

Create `goal-live-smoke.ts` with literal constants and a discriminated receipt union. Start with these exact values:

```ts
export const LIVE_GOAL_OBJECTIVE = 'Call tianwen_smoke_action exactly once. After it succeeds, mark this Goal complete with update_goal, then reply exactly TIANWEN_GOAL_ROUND_OK.' as const
export const LIVE_GOAL_MARKER = 'TIANWEN_GOAL_ROUND_OK' as const
export const LIVE_GOAL_PROVIDER = 'deepseek-official' as const
export const LIVE_GOAL_MODEL = 'deepseek-v4-pro' as const
export const LIVE_GOAL_TOOLS = ['tianwen_smoke_action', 'update_goal'] as const
export const LIVE_GOAL_LIMITS = {
  maxRequests: 3,
  maxOutputTokensPerRequest: 64,
  maxTotalTokens: 32768,
  maxCostCny: 0.25,
  timeoutMs: 90000,
  maxRetries: 0,
} as const
```

Use stable failure codes only: `preflight-rejected`, `selection-mismatch`, `credential-missing`, `request-limit-exceeded`, `provider-error`, `timeout`, `usage-invalid`, `token-budget-exceeded`, `tool-contract-violated`, `goal-not-complete`, `marker-mismatch`, `persistence-unavailable`, and `internal-error`.
Preflight failures use known counts `0`; runner failures use durable observed counts; only a malformed/missing child receipt may use `requestCount: null`, `retryCount: null`, and `usage: null` rather than inventing evidence.

- [ ] **Step 6: Implement immutable host preflight**

Add the optional third argument without adding fields to ordinary results. For strict mode require a strict child of resolved `D:\DevData`, a Session id matching `^tianwen-goal-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`, exact Goal fields, and an exact pristine create event log. A valid create-produced Session contains precisely one event: seq `0`, type `goal/change`, operation `create`, and the same Goal id/revision/objective/round count:

```ts
if (
  goal.objective !== LIVE_GOAL_OBJECTIVE || goal.phase !== 'active' ||
  goal.revision !== 1 || goal.maxGoalRounds !== 1 ||
  snapshot.folded.roundsStarted !== 0 ||
  snapshot.inspection.events.length !== 1 ||
  snapshot.inspection.events[0]?.seq !== 0 ||
  snapshot.inspection.events[0]?.type !== 'goal/change' ||
  snapshot.inspection.events[0].data.operation !== 'create'
) throw new GoalResumeUnavailableError('Goal is not eligible for live smoke')
```

Keep the existing installed DSH `0.1.0-rc.6` containment check. Pass only `TIANWEN_RESUME_LIVE_SMOKE=true|false`; never put the key, objective, price, or tool arguments in argv/environment.

- [ ] **Step 7: Wire exact CLI behavior and patch config**

Add a boolean `live-smoke` option. Update resume usage with a second line showing the strict command. Require `--json` when strict mode is present. The strict launcher verifies that the executing Runtime Bundle resolves inside this data directory's installed `dsh-home/profiles/tianwen` package before it starts DSH. Pass `liveSmoke`, the existing evolution root, and a parent start time through `resume.patch.yml`:

```yaml
liveSmoke: !!js process.env.TIANWEN_RESUME_LIVE_SMOKE === 'true'
evolutionRoot: !!js process.env.TIANWEN_RESUME_EVOLUTION_ROOT
startedAtMs: !!js Number(process.env.TIANWEN_RESUME_STARTED_AT_MS)
```

When strict preflight fails after valid parsing, print exactly one sanitized failure JSON line and return `1`; do not echo the thrown message. For a launched strict child, use pipes capped at 65,536 bytes each for stdout and stderr, accept only one valid receipt line, discard raw child/provider stderr, and forward only the validated/sanitized JSON. Overflow or malformed/missing child receipt terminates that same child and yields `internal-error`; failure fields that cannot be reconstructed honestly are `null`, never fabricated as zero. Ordinary `stdio: 'inherit'`, error messages, and exit codes stay unchanged.

- [ ] **Step 8: Run GREEN and commit Task 1**

Run focused tests, then:

```powershell
& $node $pnpm --filter '@tianwen/runtime-bundle' build
& $node $pnpm exec vitest run tests/dsh-migration/goal-live-smoke.spec.ts tests/dsh-migration/goal-resume.spec.ts
& $node $pnpm run typecheck
git diff --check
```

Expected: all exit `0`; ordinary preflight objects and receipts are unchanged. Stage only Task 1 files, run `git diff --cached --check`, and commit:

```powershell
git commit -m "feat: add strict live Goal preflight"
```

### Task 2: Implement the bounded AgentLoop round and receipt

**Files:**
- Modify: `packages/tianwen-runtime-bundle/src/goal-live-smoke.ts`
- Modify: `packages/tianwen-runtime-bundle/src/resume-runner.ts`
- Modify: `packages/tianwen-runtime-bundle/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `tests/dsh-migration/goal-live-smoke.spec.ts`
- Regression test: `tests/dsh-migration/goal-resume.spec.ts`

**Interfaces:**
- Consumes: Task 1 constants/receipt union, DSH `installModelSelection`, `ReasoningEffortId`, `credentialRef`, `llm.resolveCallConfig()`, agent-scoped `systemPrompt.section()`, `tools.presentAs()`, `tools.restrict()`, `tools.guard()`, `agent/request`, and `agent/request-error`.
- Produces: `runGoalResume(ctx, config, dependencies?)` with the existing ordinary receipt and a strict `GoalLiveSmokeReceipt` branch when `config.liveSmoke === true`.
- Produces: pure `assessLiveGoalEvents(sessionId, addedEvents, expectedGoal)` used by runner and focused tests.

- [ ] **Step 1: Add the three-request scripted success test**

Mount Goal, goal-round driver, goal tools, Tianwen smoke tool, persistence, and scripted adapter only from public package roots. Provide selected model `deepseek-official/deepseek-v4-pro` and a credential service whose `describe()` returns `{ configured: true, writable: false }` without returning a key.

Script three responses, each with one usage chunk before finish. Mount `toolGoal`, `TianwenEvidenceService`, and the fixed smoke tool explicitly on the focused harness before resuming:

```ts
[
  toolCallResponse('live-action', 'tianwen_smoke_action', {}),
  toolCallResponse('live-complete', 'update_goal', {
    goal_id: String(goal.id), revision: 2, action: 'complete',
  }),
  textResponse('TIANWEN_GOAL_ROUND_OK'),
]
```

Insert usage `{ inputTokens: 100 + index, outputTokens: 10, cacheReadTokens: 5 }` into each response. Expect exactly three captured requests, route/model fixed, `reasoningEffort === 'off'`, `maxTokens === 64`, and `request.tools?.map(tool => tool.name).toSorted()` exactly `['tianwen_smoke_action', 'update_goal']` on every request. Tool presentation order is not an authority contract. Assert the system prompt contains the exact current Goal id and revision `2` and does not contain a credential sentinel. Other trusted Profile prose may remain in the system prompt; capability visibility is decided by the exact two tool schemas plus execution restriction, not by searching prose for tool-name words.

- [ ] **Step 2: Assert the exact durable success contract**

For the success receipt expect:

```ts
expect(receipt).toMatchObject({
  schemaVersion: 'tianwen.goal-live-smoke.v1',
  status: 'passed',
  provider: 'deepseek-official',
  model: 'deepseek-v4-pro',
  requestCount: 3,
  retryCount: 0,
  markerMatched: true,
  goal: { id: String(goal.id), phase: 'complete', roundsStarted: 1 },
  session: { id: String(sessionId), eventCountDelta: expect.any(Number) },
  evidence: [
    { toolName: 'tianwen_smoke_action', outcome: 'complete' },
    { toolName: 'update_goal', outcome: 'complete' },
  ],
  governance: { evolutionUnchanged: true, championUnchanged: true },
})
```

Inspect Session events and prove action call/result precedes update call/result, every call occurs exactly once, there is no other call, all three `assistant/message` events carry valid usage, the final text is exact, Goal is complete/disarmed, and the receipt serialization excludes objective, model text, raw arguments/results, key sentinel, system prompt, and provider-error sentinel.

- [ ] **Step 3: Add strict failure cases without replay**

Add isolated table cases for: selected offline model, unresolved exact call config, missing credential, first provider failure, fourth requested model step, missing usage, negative/unsafe usage, token total `32_769`, action skipped, update before action, combined same-step tools, duplicate action, wrong Goal id/revision/action, action error result, missing update, wrong final marker, active/blocked/paused final Goal, persistence flush failure, and timeout. Each case asserts a stable failure code, no raw error text, request count never above three provider calls, retry count `0`, and no second invocation.

Install a global test `agent/request-error` listener that would return `{ kind: 'retry' }`; prove the strict agent-scoped listener registered with `{ prepend: true }` terminates the failure without delegating to it. For the request-limit case, let the script require a fourth response and assert the adapter captured only three requests.

- [ ] **Step 4: Run RED for Task 2**

Run:

```powershell
& $node $pnpm exec vitest run tests/dsh-migration/goal-live-smoke.spec.ts tests/dsh-migration/goal-resume.spec.ts
```

Expected: strict runner tests fail because the existing runner still exposes the ordinary tool surface and ordinary receipt, while all ordinary resume tests stay green.

- [ ] **Step 5: Install the scoped model authority and capability surface**

Before creating the Agent, require exact saved selection, configured credential reference, and a successful public `ctx.llm.resolveCallConfig()` for the fixed provider/model/reasoning/maxTokens. Catalog membership is advisory and is not the bearing check. Add `@deepseek-ai/dsh-system-prompt@0.1.0-rc.6` as a direct Runtime Bundle dependency because product code now calls that public service.

In the strict setup callback, retain a closure for the new ref returned by `ctx.goals.resume()` and register native presentation, inherited-surface restriction, and an execution guard:

```ts
agentCtx.tools.presentAs('native')
agentCtx.tools.restrict({ allow: [...LIVE_GOAL_TOOLS] })
agentCtx.tools.guard(execution => validateLiveToolExecution(execution, strictState))
agentCtx.on('tools/result', (execution, result) => {
  observeLiveToolResult(execution, result, strictState)
})
agentCtx.systemPrompt.section({
  name: 'tianwen:live-goal-authority',
  order: 99,
  text: context => renderLiveGoalAuthority(
    context.agent === undefined ? undefined : ctx.goals.get(context.agent)),
})
```

`validateLiveToolExecution()` allows the action only once with `{}`, then reads `ctx.goals.get(execution.agent)` and allows update only after the action's successful `tools/result`, only once, with that exact current Goal ref plus `action: 'complete'`; it denies every other name/argument/order before the tool body. `renderLiveGoalAuthority()` must fail when the ref is unset and render only the exact Goal id/revision, `tianwen_smoke_action` then `update_goal`, and `TIANWEN_GOAL_ROUND_OK`. The dynamic section reads `ctx.goals.get(context.agent)` at assembly time, after `ctx.goals.resume()` has changed create revision `1` to resume revision `2`; it never uses `config.revision`. After setup and before arming the Goal, assert `handle.agent.ctx.tools.schemas(handle.agent).map(tool => tool.name).toSorted()` equals the two fixed names. Do not add `get_goal`, modify the generic goal-round driver, or replace the complete system prompt.

- [ ] **Step 6: Enforce request, retry, and timeout limits with public hooks**

Set agent options to the selected fixed route and `maxTokens: 64`. Install model selection first, then a scoped request listener with `{ prepend: true }` that increments the request counter and rejects request four before calling `next()` or the provider. For the first three, call `next()` and return:

```ts
{
  ...resolved,
  provider: LIVE_GOAL_PROVIDER,
  model: LIVE_GOAL_MODEL,
  reasoningEffort: ReasoningEffortId('off'),
  maxTokens: LIVE_GOAL_LIMITS.maxOutputTokensPerRequest,
}
```

Install a scoped `agent/request-error` listener with `{ prepend: true }` that returns `undefined` without calling `next()`. Derive the remaining deadline from Task 1's parent `startedAtMs`; at expiry set `timedOut = true` and call `agent.cancel({ kind: 'hook', reason: 'tianwen-live-goal-timeout' })`. This is cooperative cancellation for the reviewed DeepSeek adapter/tools, not a claim that arbitrary same-process code can be hard-killed at exactly 90.000 seconds. Always clear the timer in `finally`, await idle, flush once, disarm through public Goal service when still armed, and dispose the same handle.

- [ ] **Step 7: Assess only durable, sanitized facts**

Aggregate usage from the three new `assistant/message` events. Validate every count is a non-negative safe integer, sum input/output/cache-read/cache-write as disjoint tokens, and calculate:

```ts
const estimatedCostCny = (
  inputTokens * 3
  + cacheReadTokens * 0.025
  + cacheWriteTokens * 3
  + outputTokens * 6
) / 1_000_000
```

Do not add reasoning again. Build Evidence summaries through the installed `tianwenEvidence.project(session)` service, retaining only `evidenceId`, `toolName`, and outcome. Snapshot the complete `evolutionRoot` tree before/after, including directory shape and `artifacts/**`, and separately compare `champion.json`; `evolutionUnchanged` therefore includes Artifact bytes rather than only the ledger. Convert every thrown/provider failure to the stable union; never insert the original message into the receipt.

- [ ] **Step 8: Preserve ordinary resume and process behavior**

When `liveSmoke !== true`, execute the existing ordinary code path and emit `tianwen.goal-resume.v1` unchanged. In strict mode, print one JSON receipt, exit `0` only for `status: 'passed'`, and exit `1` for `failed`; never print the underlying exception. Ensure a still-active Goal is disarmed before process exit while preserving its real phase/history.

- [ ] **Step 9: Run GREEN and commit Task 2**

Run serially:

```powershell
& $node $pnpm exec vitest run tests/dsh-migration/goal-live-smoke.spec.ts
& $node $pnpm exec vitest run tests/dsh-migration/goal-resume.spec.ts
& $node $pnpm --filter '@tianwen/runtime-bundle' build
& $node $pnpm run typecheck
git diff --check
```

Expected: all exit `0`. Stage only Task 2 files, check the staged diff, and commit:

```powershell
git commit -m "feat: run bounded live Goal round"
```

### Task 3: Prove the installed product chain without external network

**Files:**
- Create: `tests/dsh-migration/fixtures/deepseek-goal-round-fetch.cjs`
- Modify: `tests/dsh-migration/tianwen-startup.e2e.spec.ts`
- Modify: `tests/dsh-migration/runtime-bundle.spec.ts`
- Verify unchanged: `scripts/install-tianwen.mjs`

**Interfaces:**
- Consumes: Task 2 installed CLI and the real installed DeepSeek adapter.
- Produces: an offline fake transport that serves exactly three valid SSE responses and throws on request four or any non-DeepSeek fetch.
- Produces: the existing environment-gated startup E2E, with `TIANWEN_E2E_DATA_DIR=D:\DevData\tianwen-live-goal-round\test-data\installed-e2e` selecting this stage's isolated root. The installer runs only once.

- [ ] **Step 1: Write the failing bundle-closure assertions**

Update `isAllowedResumeRunnerInput()` so the compiled metafile accepts exactly `src/resume-runner.ts` and `src/goal-live-smoke.ts`. Update the manifest expectation for the direct public `@deepseek-ai/dsh-system-prompt: 0.1.0-rc.6` dependency and keep every external import at public package roots. Assert the archive still contains `dist/resume-runner.js`, `resume.patch.yml`, and no test fixture, source map, private DSH `src`, workspace absolute path, or credential text.

- [ ] **Step 2: Write the test-only DeepSeek fetch transport**

The CommonJS preload replaces `globalThis.fetch`. It parses the JSON request in memory, rejects a URL other than the configured DeepSeek `/chat/completions`, rejects missing streaming usage, rejects a tool list other than the exact two names, and extracts the Goal id/revision from the fixed system section. Return three SSE sequences:

```js
1 => tool call tianwen_smoke_action({}) + usage + finish tool_calls
2 => tool call update_goal({ goal_id, revision, action: 'complete' }) + usage + finish tool_calls
3 => text TIANWEN_GOAL_ROUND_OK + usage + finish stop
```

Every sequence ends with `data: [DONE]`. A fourth fetch throws. Write only a sanitized trace containing request ordinal, model, `max_tokens`, tool-name list, and whether authorization was non-empty; never persist authorization, messages, system text, arguments, response body, or key sentinel.

- [ ] **Step 3: Extend the existing single-install E2E**

Allow `tianwenRoot` to come from `TIANWEN_E2E_DATA_DIR`, retaining the existing default when unset. Reuse the current `run()`, `snapshotState()`, `bytesOrMissing()`, `childEnvironment()`, `requireWithinRoot()`, `requireDshBin()`, `assertInstalledBundle()`, and atomic receipt helper instead of copying the 900-line installer harness. In the existing V4 Pro selection block, the E2E must:

1. Verify the installed Runtime Bundle manifest, Profile bundle list, install-receipt digest, DSH `0.1.0-rc.6`, and installed CLI path before any fake fetch.
2. Set a runtime-generated fake `DEEPSEEK_API_KEY` only in child environment and preload the fake fetch transport with `NODE_OPTIONS=--require=...`.
3. Run zero-request `model use --model deepseek-v4-pro` and fresh `model status`.
4. Run installed `create` with the exact fixed objective/max rounds, then installed list/status and prove no request events.
5. Snapshot every Session file, the complete evolution tree including `artifacts/**`, champion, and receipt directories.
6. Run installed `resume --live-smoke --json` exactly once.
7. Validate the success receipt, three sanitized trace rows, exact Session tool/event/usage order, Goal complete/disarmed, exactly two complete Evidence records, unchanged full evolution/Artifact bytes, and unchanged champion.
8. Prove a second strict resume is rejected before fetch and leaves bytes unchanged.
9. Run `model use --model offline` and fresh status in `finally`.
10. Scan every receipt/log surfaced by the test and prove the fake key sentinel and raw response markers are absent where the schema forbids them.

The new assertions must fail before Task 2 is installed and must never permit real network fallback. Do not create a second installer E2E or change `scripts/install-tianwen.mjs`.

- [ ] **Step 4: Run RED for Task 3**

Run:

```powershell
$env:TIANWEN_DSH_PHASE2_STARTUP = '1'
$env:TIANWEN_E2E_DATA_DIR = 'D:\DevData\tianwen-live-goal-round\test-data\installed-e2e'
& $node $pnpm exec vitest run tests/dsh-migration/tianwen-startup.e2e.spec.ts tests/dsh-migration/runtime-bundle.spec.ts
Remove-Item Env:TIANWEN_E2E_DATA_DIR
Remove-Item Env:TIANWEN_DSH_PHASE2_STARTUP
```

Expected: failures at the new installed strict command or closure assertions, with the fake transport proving no real fetch.

- [ ] **Step 5: Make only package/E2E boundary changes**

Build the existing Runtime Bundle so the new internal module is folded into `dist/resume-runner.js`. Do not add it as a new public export or package file. Keep installer logic unchanged; the new feature must arrive through the existing tarball/Profile path.

- [ ] **Step 6: Run GREEN and installed regressions serially**

Run:

```powershell
& $node $pnpm --filter '@tianwen/runtime-bundle' build
& $node $pnpm exec vitest run tests/dsh-migration/runtime-bundle.spec.ts
$env:TIANWEN_DSH_PHASE2_STARTUP = '1'
$env:TIANWEN_E2E_DATA_DIR = 'D:\DevData\tianwen-live-goal-round\test-data\installed-e2e'
& $node $pnpm exec vitest run tests/dsh-migration/tianwen-startup.e2e.spec.ts
Remove-Item Env:TIANWEN_E2E_DATA_DIR
Remove-Item Env:TIANWEN_DSH_PHASE2_STARTUP
```

Expected: all exit `0`; the one installed E2E proves both the original flow and the new strict flow under one install. The original create/list/status/resume/model assertions remain unchanged.

- [ ] **Step 7: Commit Task 3**

Run `git diff --check`, stage only Task 3 files, verify no generated archive/dist/cache/receipt is staged, and commit:

```powershell
git commit -m "test: prove installed live Goal round offline"
```

### Task 4: Review, gate, run once, and archive the stage

**Files:**
- Create after the live attempt: `docs/operations/tianwen-deepseek-v4-pro-live-goal-round-handoff.md`
- Modify after stage push on main only: `docs/architecture-master-session-memory.md`

**Interfaces:**
- Consumes: committed Tasks 1-3, independent correctness review, Ponytail review, official DeepSeek price page, and one user-approved numeric budget.
- Produces: one sanitized live receipt plus SHA-256, canonical handoff, pushed stage SHA, and main docs-only memory pointer.

- [ ] **Step 1: Run two independent reviews before any paid request**

Dispatch one correctness/spec reviewer and one Ponytail/YAGNI reviewer. Reviewers are read-only, must not inspect the key or call a provider, and must verify public DSH roots, authority ordering, exact tool surface, failure preservation, receipt sanitization, ordinary regressions, and realistic threat model. Open Critical/Important findings block the live gate; verify each finding before changing code. Fixes use a focused RED/GREEN cycle and a scoped re-review.

- [ ] **Step 2: Run every offline gate serially with D-drive storage**

Set:

```powershell
$node = 'D:\hermes\node\node.exe'
$pnpm = 'D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs'
$env:COREPACK_HOME = 'D:\DevData\corepack-home'
$env:PNPM_HOME = 'D:\DevData\pnpm-home'
$env:PNPM_STORE_DIR = 'D:\DevData\pnpm-store'
$env:UV_CACHE_DIR = 'D:\DevData\uv-cache'
$env:UV_PROJECT_ENVIRONMENT = 'D:\DevData\tianwen-live-goal-round\python-env'
$env:TEMP = 'D:\DevData\tianwen-live-goal-round\temp'
$env:TMP = $env:TEMP
```

Then run in order:

```powershell
& $node $pnpm install --offline --frozen-lockfile --trust-lockfile --store-dir 'D:\DevData\pnpm-store'
& $node $pnpm --filter '@tianwen/runtime-bundle' build
& $node $pnpm run check:dsh-install
& $node $pnpm run check:no-private-dsh-imports
& $node $pnpm run typecheck
& $node $pnpm exec vitest run tests/dsh-migration/goal-live-smoke.spec.ts tests/dsh-migration/goal-resume.spec.ts tests/dsh-migration/model-live-smoke.spec.ts tests/dsh-migration/runtime-bundle.spec.ts
& $node $pnpm exec vitest run
$env:TIANWEN_DSH_PHASE2_STARTUP = '1'
$env:TIANWEN_E2E_DATA_DIR = 'D:\DevData\tianwen-live-goal-round\test-data\installed-e2e'
& $node $pnpm exec vitest run tests/dsh-migration/tianwen-startup.e2e.spec.ts
Remove-Item Env:TIANWEN_E2E_DATA_DIR
Remove-Item Env:TIANWEN_DSH_PHASE2_STARTUP
& $node $pnpm run test:dsh:sandbox
& uv run pytest tests/alpha/test_task_packages.py -q
& uv run pytest -q
& uv run ruff check .
git diff --check 53ae351509ab1209a1f0f396e135703580b3e39b..HEAD
git status --short
```

Expected: every command exits `0`, worktree is clean, no gate contacts DeepSeek, and no real Docker runs. Build, Node suites, installed Profile, Windows LocalSandbox, and Python suites are deliberately serial because they share `dist`, stores, Profiles, or test roots.

- [ ] **Step 3: Install the reviewed commit and run zero-request preflight**

Install exactly the reviewed HEAD into `D:\DevData\tianwen-live-goal-round\data`. Resolve the installed CLI outside the worktree. Check only that the Windows user `DEEPSEEK_API_KEY` reference is non-empty; do not print/read it into logs. Run installed model status, select V4 Pro, create the fixed Goal, then list/status. Require `modelRequestsDelta: 0` and a pristine Goal/Session before arming the live gate.

- [ ] **Step 4: Recheck official pricing and obtain one numeric approval**

Browse the current official DeepSeek pricing page immediately before the live attempt. Record the URL, retrieval time, and rates. If any billable category differs from the constants proven offline, stop the live gate, update the constants/tests, and repeat review plus offline gates; do not call the provider under stale prices. Otherwise confirm that the worst accepted `32_768` disjoint tokens remain within CNY `0.25`. Ask the user once: `是否批准本阶段唯一一次真实 Goal 请求链，上限 32,768 tokens / CNY 0.25？` The user's capability authorization does not replace this numeric approval.

- [ ] **Step 5: Execute the single live Goal chain**

After explicit numeric approval, create random stdout/stderr temporary paths on the same D-drive receipt volume and launch exactly one hidden child with `Start-Process -Wait -PassThru -RedirectStandardOutput ... -RedirectStandardError ... -WindowStyle Hidden`. Its exact argv is:

```powershell
& $node $installedCli resume --goal $goalId --data-dir 'D:\DevData\tianwen-live-goal-round\data' --live-smoke --json
```

If the process is still running, wait on the same process handle; never issue the command again. Success requires `status: passed`, request count `3`, retry count `0`, token/cost within limits, marker match, exact Evidence, Goal complete/disarmed, and unchanged governance. Any timeout, provider error, model deviation, receipt issue, or process ambiguity consumes the authorization and is recorded as failure without replay.

- [ ] **Step 6: Restore offline and persist only sanitized evidence**

In `finally`, run the zero-request installed `model use --model offline` and a fresh status. Do not reconstruct JSON from parsed fields. Validate that the already captured stdout file contains exactly one canonical sanitized receipt line, then atomically rename those exact bytes to:

```text
D:\DevData\tianwen-live-goal-round\receipts\deepseek-v4-pro-goal-round.json
```

Compute SHA-256 over the same exact bytes after rename. Remove the temporary stderr file after confirming it contains no required receipt evidence; never archive it. Do not persist the key, header, raw response, model text, objective, system prompt, or raw tool values.

- [ ] **Step 7: Write the canonical handoff**

The handoff records exact base/design/implementation/live-attempt SHAs, review verdicts, all serial gate counts/timings, official price URL/rates, numeric budget approval, one-attempt consumption, sanitized receipt fields/SHA, final Goal/Session/Evidence/governance facts, offline restoration, failure details if any, and the next recommendation. It states explicitly that the result is one real Goal round, not a complete continual-learning loop or model-quality benchmark.

Commit:

```powershell
git commit -m "docs: hand off live Goal round"
```

- [ ] **Step 8: Final review and GitHub archive**

Re-run focused tests, typecheck, Ruff, `git diff --check`, and a fresh whole-branch correctness/Ponytail review after any handoff edit. Push normally to `codex/tianwen-live-goal-round`, verify `git ls-remote origin refs/heads/codex/tianwen-live-goal-round` equals local HEAD, and never force-push or merge main.

- [ ] **Step 9: Update canonical master memory on main**

On the clean main worktree, add a docs-only pointer to the pushed stage SHA, live receipt result/cost, retained one-attempt boundary, offline-restored state, and next recommended phase. Commit and push main normally only after verifying main still descends from `542000a2f531f28dcd329712d3e4f35f80693b03` and contains no unrelated changes.
