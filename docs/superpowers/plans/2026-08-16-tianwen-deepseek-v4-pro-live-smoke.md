# Tianwen DeepSeek V4 Pro Live Smoke Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add and execute one explicit, budget-bounded DeepSeek V4 Pro request through Tianwen's installed DSH Profile.

**Architecture:** Extend the existing `tianwen model` path instead of adding a second provider client. The existing model patch boots the installed Profile; one new `smoke` operation calls the public hand-built `llm.stream` seam exactly once and emits a sanitized receipt. All implementation and review are offline; only the controller may execute the paid command, once, after every gate passes.

**Tech Stack:** TypeScript 6, Node.js 22, DeepSeek Harness `0.1.0-rc.6` public package roots, Vitest 4, existing Tianwen Runtime Bundle installer.

## Global Constraints

- Paid route is exactly `deepseek-official/deepseek-v4-pro`.
- Fixed user text is exactly `Reply with exactly TIANWEN_SMOKE_OK and nothing else.`; no system prompt and no tools.
- The request carries `reasoningEffort: ReasoningEffortId('off')` and `maxTokens: 64`.
- One invocation may call `llm.stream` exactly once; no AgentLoop, Goal round, retry, second request, or fallback route.
- Wall-clock timeout is 90 seconds; total reported-token ceiling is 512; cost ceiling is CNY 0.01.
- Price constants for this run are CNY 3 / 1M cache-miss input, CNY 0.025 / 1M cache-hit input, and CNY 6 / 1M output. `cacheWriteTokens`, if reported, use the cache-miss input rate. `reasoningTokens` are informational and must not be double-counted beyond `outputTokens`.
- Credential reference is only `DEEPSEEK_API_KEY`; never print or persist its value, pass it in argv, or add another credential store.
- Existing `model status` and `model use` remain zero-request operations with their existing receipt schema and behavior.
- Product code prints one sanitized JSON receipt; it does not write receipt files or arbitrary prompts.
- Default tests are offline. The paid execution is not an automated test;
  implementers and reviewers must not read the API key value or make a provider
  request.
- The controller installs and runs the paid command only under `D:\DevData\tianwen-live-model-smoke`; normal Tianwen data is untouched.
- No paid model other than the one controller-owned smoke; no live web, Docker, private DSH `src` import, dependency upgrade, UI, generic billing system, or unrelated refactor.

---

## File map

- `packages/tianwen-runtime-bundle/src/model-runner.ts`: fixed smoke request, stream validation, budget calculation, sanitized receipt, and existing status/use operations.
- `packages/tianwen-runtime-bundle/src/model.ts`: accept `smoke` as a fixed installed-Profile operation without adding secret-bearing argv.
- `packages/tianwen-runtime-bundle/src/cli.ts`: parse the exact user command and preserve existing command boundaries.
- `tests/dsh-migration/model-live-smoke.spec.ts`: focused offline stream, budget, failure, and process-boundary tests.
- `tests/dsh-migration/model-configuration.spec.ts`: existing status/use regression plus CLI and invocation assertions for `smoke`.
- `tests/dsh-migration/runtime-bundle.spec.ts`: update model-runner public-root/metafile expectations only if the compiled import set changes.
- `docs/operations/tianwen-deepseek-v4-pro-live-smoke-handoff.md`: controller-owned final evidence after the single paid run.
- `docs/architecture-master-session-memory.md`: main-branch docs-only pointer after the feature branch is pushed.

### Task 1: Implement the offline single-request contract

**Files:**
- Modify: `packages/tianwen-runtime-bundle/src/model-runner.ts`
- Modify: `packages/tianwen-runtime-bundle/src/model.ts`
- Modify: `packages/tianwen-runtime-bundle/src/cli.ts`
- Create: `tests/dsh-migration/model-live-smoke.spec.ts`
- Modify: `tests/dsh-migration/model-configuration.spec.ts`
- Modify if required by the real build output: `tests/dsh-migration/runtime-bundle.spec.ts`

**Interfaces:**
- Consumes: existing installed DSH Profile services `agentDefaultModel`, `credentials`, `llm`, `loader`, and `appExit`.
- Produces: `ModelOperation = 'status' | 'use' | 'smoke'` and exported `runModelSmoke(ctx, signal?, now?) => Promise<ModelSmokeReceipt>` from `model-runner.ts`.
- Produces: a `ModelSmokeReceipt` discriminated by `status: 'passed' | 'failed'`; failure receipts contain only stable `failureCode` values.

- [ ] **Step 1: Add one focused failing smoke-contract test file**

Create `tests/dsh-migration/model-live-smoke.spec.ts`. Use a runtime-generated credential sentinel and a fake public service context. The fake `llm.stream` must record the single `GenerateOptions` and return scripted `StreamChunk` values.

The first happy-path test must expect:

```ts
expect(llm.stream).toHaveBeenCalledTimes(1)
expect(llm.stream).toHaveBeenCalledWith(expect.objectContaining({
  provider: 'deepseek-official',
  model: 'deepseek-v4-pro',
  reasoningEffort: 'off',
  maxTokens: 64,
  tools: undefined,
  system: undefined,
  messages: [expect.objectContaining({
    role: 'user',
    source: { kind: 'user' },
    content: [{ type: 'text', text: 'Reply with exactly TIANWEN_SMOKE_OK and nothing else.' }],
  })],
}))
expect(receipt).toMatchObject({
  schemaVersion: 'tianwen.model-smoke.v1',
  status: 'passed',
  provider: 'deepseek-official',
  model: 'deepseek-v4-pro',
  requestCount: 1,
  markerMatched: true,
  limits: { maxOutputTokens: 64, maxTotalTokens: 512, maxCostCny: 0.01, timeoutMs: 90000 },
})
```

Use usage `{ inputTokens: 20, outputTokens: 8, cacheReadTokens: 5 }`. Expect total tokens `33` and estimated cost CNY `0.000108125`. The visible response must be exactly `TIANWEN_SMOKE_OK` and must not appear verbatim in the receipt; only `markerMatched: true` is retained.

- [ ] **Step 2: Add failing preflight and stream-rejection cases**

Add table-driven tests that prove all of these return `status: 'failed'` without a second stream call:

```ts
[
  ['selection-mismatch', { provider: 'tianwen-offline', model: 'phase2-smoke' }, true, 0],
  ['credential-missing', { provider: 'deepseek-official', model: 'deepseek-v4-pro' }, false, 0],
  ['missing-usage', 'stream-without-usage', true, 1],
  ['duplicate-usage', 'stream-with-two-usage-chunks', true, 1],
  ['missing-finish', 'stream-without-finish', true, 1],
  ['duplicate-finish', 'stream-with-two-finish-chunks', true, 1],
  ['unexpected-tool-call', 'stream-with-tool-call', true, 1],
  ['unexpected-reasoning', 'stream-with-reasoning', true, 1],
  ['unexpected-response', 'wrong-visible-text', true, 1],
  ['token-budget-exceeded', { inputTokens: 449, outputTokens: 64 }, true, 1],
  ['provider-error', { finish: { kind: 'error', failure: { code: 'AUTH', message: 'secret-sentinel' } } }, true, 1],
  ['timeout', 'already-aborted-signal', true, 1],
]
```

The cost ceiling is mathematically dominated by the 512-token ceiling at the
frozen rates: even 512 output-rate tokens cost only CNY `0.003072`. Do not add
an artificial unreachable `cost-budget-exceeded` fixture. Instead, assert the
calculated happy-path cost and the maximum theoretical accepted cost are both
within CNY `0.01`.

For every receipt, assert `JSON.stringify(receipt)` excludes the runtime-generated credential and provider-error sentinels. A stream that throws must become `provider-error`, not escape raw text.

- [ ] **Step 3: Add failing process and CLI boundary tests**

Extend CLI tests for the exact accepted command:

```ts
['model', 'smoke', '--model', 'deepseek-v4-pro', '--data-dir', dataDir, '--json']
```

Reject missing `--model`, Flash, offline, arbitrary prompt/Goal/round flags,
relative data directories, and smoke data directories outside
`D:\DevData` before launching DSH. Existing `status`/`use` path acceptance is
unchanged. Assert the child invocation remains `process.execPath`, fixed DSH
bin, fixed `model.patch.yml`, `shell: false`, and contains no key in argv.
Assert `apply()` waits for `loader.await()`, prints exactly one sanitized JSON
line, exits `0` only for `passed`, and exits `1` for a failed receipt without
printing an exception message.

- [ ] **Step 4: Run RED**

Run:

```powershell
& 'D:\hermes\node\node.exe' 'D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs' exec vitest run tests/dsh-migration/model-live-smoke.spec.ts tests/dsh-migration/model-configuration.spec.ts
```

Expected: failures because `smoke`, `runModelSmoke`, and its receipt do not yet exist. Setup/import failures unrelated to those missing behaviors do not count as RED.

- [ ] **Step 5: Implement the minimal runner**

In `model-runner.ts`, reuse the existing service lookup and add only the constants and receipt union needed by the tests. Use public imports:

```ts
import { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm'
```

The call must be structurally equivalent to:

```ts
const options: GenerateOptions = {
  provider: 'deepseek-official',
  model: 'deepseek-v4-pro',
  reasoningEffort: ReasoningEffortId('off'),
  maxTokens: 64,
  messages: [createUserMessage({
    source: { kind: 'user' },
    content: [{ type: 'text', text: FIXED_PROMPT }],
  })],
  signal,
}
for await (const chunk of llm.stream(options)) {
  // accept one text response, one usage, and one terminal stop; reject every other terminal ambiguity
}
```

Do not add a retry loop, Agent, Session, Goal, generic parser, price service, or file writer. Compute:

```ts
const totalTokens = usage.inputTokens + usage.outputTokens
  + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0)
const estimatedCostCny = (
  usage.inputTokens * 3
  + (usage.cacheReadTokens ?? 0) * 0.025
  + (usage.cacheWriteTokens ?? 0) * 3
  + usage.outputTokens * 6
) / 1_000_000
```

Treat all counts as non-negative safe integers. `reasoningTokens` must be non-negative when present but is already included in output and is not added again.

- [ ] **Step 6: Wire the existing model command path**

Add `smoke` to `ModelOperation`. `preflightModelCommand` accepts it only with `deepseek-v4-pro`. Reuse `model.patch.yml` and the existing fixed child invocation. Add one usage line to `MODEL_USAGE`; do not add arbitrary budget or prompt flags.

At the process boundary, `status` and `use` retain `tianwen.model-config.v1`. Only `smoke` emits `tianwen.model-smoke.v1`. Do not change `modelRequestsDelta: 0` for the configuration operations.

- [ ] **Step 7: Run GREEN and build-boundary checks**

Run, in order:

```powershell
& $node $pnpm exec vitest run tests/dsh-migration/model-live-smoke.spec.ts tests/dsh-migration/model-configuration.spec.ts
& $node $pnpm --filter '@tianwen/runtime-bundle' build
& $node $pnpm exec vitest run tests/dsh-migration/runtime-bundle.spec.ts
& $node $pnpm run typecheck
```

Expected: all exit `0`. Update `runtime-bundle.spec.ts` only to reflect the real public-root import/metafile set produced by the minimal code.

- [ ] **Step 8: Commit Task 1**

Stage only the Task 1 files, run `git diff --cached --check`, and commit:

```powershell
git commit -m "feat: add budgeted deepseek live smoke"
```

The implementer must not run the paid command and must write its full RED/GREEN report to the SDD workspace.

### Task 2: Review, run once, and hand off

**Files:**
- Create after the live attempt: `docs/operations/tianwen-deepseek-v4-pro-live-smoke-handoff.md`
- Modify on main after feature push: `docs/architecture-master-session-memory.md`

**Interfaces:**
- Consumes: reviewed Task 1 command and isolated installer.
- Produces: one sanitized live receipt, one canonical handoff, pushed feature SHA, and a main docs-only memory pointer.

- [ ] **Step 1: Independent scoped review before any paid request**

Review the Task 1 diff against this plan and the approved design. Open Critical or Important findings block the paid run. Fixes require focused RED/GREEN and one scoped re-review. Minor findings are recorded and do not trigger unrelated framework work.

- [ ] **Step 2: Run every offline preflight gate serially**

Use D-drive cache/temp paths. Resolve the tools once without printing secrets:

```powershell
$node = 'D:\hermes\node\node.exe'
$pnpm = 'D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs'
$uv = (Get-Command uv -ErrorAction Stop).Source
$env:UV_CACHE_DIR = 'D:\DevData\uv-cache'
$env:UV_PROJECT_ENVIRONMENT = 'D:\DevData\tianwen-live-model-smoke\python-env'
$env:TEMP = 'D:\DevData\tianwen-live-model-smoke\temp'
$env:TMP = $env:TEMP
```

Then run:

```powershell
& $node $pnpm install --offline --frozen-lockfile --trust-lockfile --store-dir 'D:\DevData\pnpm-store'
& $node $pnpm run check:dsh-install
& $node $pnpm run check:no-private-dsh-imports
& $node $pnpm run typecheck
& $node $pnpm exec vitest run tests/dsh-migration/model-live-smoke.spec.ts tests/dsh-migration/model-configuration.spec.ts tests/dsh-migration/runtime-bundle.spec.ts
& $node $pnpm exec vitest run
& $node $pnpm --filter '@tianwen/runtime-bundle' build
$env:TIANWEN_DSH_PHASE2_STARTUP = '1'
& $node $pnpm exec vitest run tests/dsh-migration/tianwen-startup.e2e.spec.ts
Remove-Item Env:TIANWEN_DSH_PHASE2_STARTUP
& $uv run pytest tests/alpha/test_task_packages.py -q
& $uv run pytest -q
& $uv run ruff check .
git diff --check 4567eca10f88cc264d006bc8537d0a870db3999c..HEAD
```

The startup E2E must use its existing explicit environment gate and isolated D-drive directory. No gate may contact DeepSeek.

- [ ] **Step 3: Install the reviewed branch into the isolated live directory**

Run the existing installer for exactly:

```text
D:\DevData\tianwen-live-model-smoke\data
```

Verify installed Runtime Bundle files resolve outside the source worktree and the installed `model status --json` reports no request. Load the API key only from the Windows user environment into the one controller process; check only that it is non-empty and never print it.

- [ ] **Step 4: Select V4 Pro without a model request**

Run the installed command once:

```powershell
tianwen model use --model deepseek-v4-pro --data-dir 'D:\DevData\tianwen-live-model-smoke\data' --json
```

Require exit `0`, exact selected route, configured credential, and `modelRequestsDelta: 0` before arming the paid attempt.

- [ ] **Step 5: Execute the only paid command**

Execute exactly once with a single long-lived process handle; if it outlives the first tool yield, wait on that same process and never reissue the command:

```powershell
tianwen model smoke --model deepseek-v4-pro --data-dir 'D:\DevData\tianwen-live-model-smoke\data' --json
```

Regardless of success, timeout, tool transport ambiguity, or provider failure, mark the authorization spent and do not call it again. Capture only the sanitized JSON line. Validate request count `1`, total tokens at most `512`, estimated cost at most `0.01`, finish `stop`, and marker match for success.

- [ ] **Step 6: Return the isolated Profile to offline**

Run `model use --model offline` once. This is a zero-request operation and runs even when the paid smoke fails. Confirm the resulting status is `tianwen-offline/phase2-smoke` with `modelRequestsDelta: 0`.

- [ ] **Step 7: Persist evidence and write the handoff**

Save the sanitized receipt under `D:\DevData\tianwen-live-model-smoke\receipts` as canonical UTF-8 JSON plus LF. The handoff must record:

- exact branch/base/code/live-attempt SHAs;
- official price URL and frozen run rates;
- one-attempt authorization and whether it was spent;
- receipt SHA-256, route, request count, usage, estimated CNY cost, finish, and marker result;
- offline gates and review verdicts;
- proof that the Profile was restored to offline;
- no key value, raw headers/body, reasoning, or arbitrary model text;
- next recommendation: only a separate user-approved Goal round may follow.

Commit with:

```powershell
git commit -m "docs: hand off deepseek live smoke"
```

- [ ] **Step 8: Final review and GitHub archive**

Run a fresh whole-branch correctness review and a ponytail complexity review. Open Critical/Important findings block push; the ponytail verdict must not require speculative billing, retry, or chat frameworks. Re-run focused tests, typecheck, Ruff, `git diff --check`, and status after any docs-only fix.

Push normally to `codex/tianwen-live-model-smoke`, verify `ls-remote` equals local HEAD, and never force-push or merge main.

- [ ] **Step 9: Update master memory on main**

Add a short docs-only entry to `docs/architecture-master-session-memory.md` with the feature branch SHA, live receipt result, exact spend estimate, retained one-attempt boundary, and next recommended phase. Commit and push main normally after confirming main has no unrelated worktree changes.
