# Tianwen Model Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship installed `tianwen model status` and `tianwen model use`
commands that switch between the fixed offline model and DSH's two DeepSeek V4
models, persist the selection through DSH settings, report credential readiness
without exposing a key, and make zero model requests.

**Architecture:** Reuse the installed DSH Profile launcher and public
`agentDefaultModel`, `llm`, `credentials`, settings-file and credentials-local
services. Add one model-only patch and runner inside the existing Runtime Bundle;
do not create a settings store, credential vault or provider adapter.

**Tech Stack:** Node.js 22, TypeScript, Vitest, esbuild, public DeepSeek Harness
`0.1.0-rc.6` package-root APIs, pnpm offline/frozen, existing installed Profile
E2E.

## Global Constraints

- Exact DSH version remains `0.1.0-rc.6`.
- Fixed choices are `offline`, `deepseek-v4-flash`, and `deepseek-v4-pro`.
- `offline` maps only to `tianwen-offline/phase2-smoke`; DeepSeek choices map
  only to provider `deepseek-official`.
- Credential reference is exactly `DEEPSEEK_API_KEY`; no secret value may enter
  argv, JSON receipts, logs, Goal/Session/Evidence/Evolution/Champion state or
  repository files.
- Every model command must send zero model requests and create no Agent/Session.
- Use public package-root imports only; no DSH private `src/*` imports.
- No paid model, live web, real Docker, arbitrary provider framework, UI,
  daemon, scheduler, database, automatic resume or Runtime cutover.
- Run heavy gates serially with caches, temp data and generated artifacts on
  `D:\DevData`.

---

### Task 1: CLI, launcher and public model runner

**Files:**

- Create: `packages/tianwen-runtime-bundle/src/model.ts`
- Create: `packages/tianwen-runtime-bundle/src/model-runner.ts`
- Create: `packages/tianwen-runtime-bundle/model.patch.yml`
- Modify: `packages/tianwen-runtime-bundle/src/cli.ts`
- Test: `tests/dsh-migration/model-configuration.spec.ts`

**Interfaces:**

- Produces `ModelChoice = 'offline' | 'deepseek-v4-flash' |
  'deepseek-v4-pro'`.
- Produces `preflightModelCommand(operation, model, dataDir)` and
  `buildModelInvocation(preflight, json)` in `model.ts`.
- Produces `runModelCommand(ctx, config)` and `ModelConfigReceipt` in
  `model-runner.ts`.
- Receipt schema is exactly `tianwen.model-config.v1` and always includes
  `modelRequestsDelta: 0`.

- [ ] **Step 1: Write the focused CLI and launcher tests**

Create `tests/dsh-migration/model-configuration.spec.ts` with cases proving:

```ts
await expect(main(['model', 'status', '--data-dir', dataDir, '--json']))
  .resolves.toBe(0)
await expect(main(['model', 'use', '--model', 'deepseek-v4-pro',
  '--data-dir', dataDir, '--json'])).resolves.toBe(0)
```

Before mocking launch, cover missing subcommand, unsupported model, `--model`
on status, missing model on use, relative data-dir and unrelated Goal/create
flags. Assert usage exit 2 and no new file under the supplied data-dir.

For `buildModelInvocation`, assert fixed `process.execPath`, installed DSH bin,
`--profile tianwen`, the packaged `model.patch.yml`, `shell: false`, inherited
stdio, exact operation/model environment values, and no secret-like variable
added by Tianwen.

- [ ] **Step 2: Run focused tests and obtain a valid RED**

Run:

```powershell
pnpm exec vitest run tests/dsh-migration/model-configuration.spec.ts
```

Expected: failure because `src/model.js` / model command behavior does not yet
exist, not because dependencies or generated `dist` are missing.

- [ ] **Step 3: Implement the minimal CLI and launcher**

Implement a fixed mapping:

```ts
const MODEL_SELECTIONS = {
  offline: { provider: 'tianwen-offline', model: 'phase2-smoke' },
  'deepseek-v4-flash': {
    provider: 'deepseek-official', model: 'deepseek-v4-flash',
  },
  'deepseek-v4-pro': {
    provider: 'deepseek-official', model: 'deepseek-v4-pro',
  },
} as const
```

Extend the existing `parseArgs` grammar for exactly two positionals after
`model`. Keep existing create/list/status/resume branches unchanged. Launch the
installed DSH bin through one fixed patch with inherited environment,
`shell: false`, and `stdio: 'inherit'`.

- [ ] **Step 4: Test the runner through public service stubs**

Provide test Context services with:

```ts
agentDefaultModel: { currentSelection, saveSelection }
credentials: { describe }
llm: { listModels }
```

Assert status is read-only; use validates either DeepSeek catalog entry before
calling `saveSelection`; a missing DeepSeek catalog item fails before save;
offline uses its fixed Tianwen mapping without provider discovery; all three
mappings are exact; returned source/configured/writable values are copied but no
credential value exists in the receipt. Use a sentinel fake key in
`process.env.DEEPSEEK_API_KEY` and assert it is absent from JSON and stderr.

- [ ] **Step 5: Implement the model runner and fixed patch**

The runner must call only:

```ts
ctx.agentDefaultModel.currentSelection()
ctx.agentDefaultModel.saveSelection(selection)
ctx.llm.listModels(selection.provider)
ctx.credentials.describe(credentialRef('DEEPSEEK_API_KEY'))
```

The patch disables `headless-startup`, `headless-runner`, and
`goal-round-driver`, then inserts `@tianwen/runtime-bundle/model-runner` with
operation/model/json config from fixed Tianwen environment fields. Print one
receipt and exit through `appExit`; never create an Agent.

- [ ] **Step 6: Run focused GREEN and commit**

Run the focused file until all behavior is green, then:

```powershell
git add -- packages/tianwen-runtime-bundle/src/model.ts `
  packages/tianwen-runtime-bundle/src/model-runner.ts `
  packages/tianwen-runtime-bundle/model.patch.yml `
  packages/tianwen-runtime-bundle/src/cli.ts `
  tests/dsh-migration/model-configuration.spec.ts
git commit -m "feat: configure tianwen model selection"
```

### Task 2: Package surface and installed persistence proof

**Files:**

- Modify: `packages/tianwen-runtime-bundle/package.json`
- Modify: `tests/dsh-migration/runtime-bundle.spec.ts`
- Modify: `tests/dsh-migration/tianwen-startup.e2e.spec.ts`

**Interfaces:**

- Consumes `model.ts`, `model-runner.ts`, and `model.patch.yml` from Task 1.
- Produces packaged export `./model-runner`, executable `dist/model-runner.js`,
  launcher code inside `dist/cli.js`, and fixed patch `model.patch.yml`.

- [ ] **Step 1: Write failing package allowlist tests**

Extend Runtime Bundle tests to require:

```text
@deepseek-ai/dsh-credentials = 0.1.0-rc.6
exports["./model-runner"]
files: dist/model-runner.js and model.patch.yml
```

Add metafile allowlists for `src/model.ts` in the CLI and only
`src/model-runner.ts` in the runner. Assert the runner's only non-node package
externals are the public roots it actually imports and no `@deepseek-ai/*/src/*`
string appears.

- [ ] **Step 2: Run Runtime Bundle tests and obtain RED**

Run:

```powershell
pnpm --filter @tianwen/runtime-bundle build
pnpm exec vitest run tests/dsh-migration/runtime-bundle.spec.ts
```

Expected: package/export/files/metafile assertions fail because the new entry
has not been added to the manifest/build yet.

- [ ] **Step 3: Add the minimal build and package entries**

Add exact dependency `@deepseek-ai/dsh-credentials: 0.1.0-rc.6`; add one esbuild
entry for `src/model-runner.ts`; publish the runner and patch. Do not add a new
workspace package, bin, dependency version or generic command framework.

- [ ] **Step 4: Add installed Profile persistence tests**

In the existing repeatable installed E2E, after the offline create/resume proof:

1. set a fake `DEEPSEEK_API_KEY` only in child environment;
2. run installed `model status --json` and prove offline selection, credential
   configured from `env`, and 0 requests;
3. run installed `model use --model deepseek-v4-pro --json`;
4. start a fresh process and prove V4 Pro remains selected;
5. assert every stdout/stderr/receipt excludes the fake-key sentinel;
6. run installed `model use --model offline --json` and prove a fresh process
   sees `tianwen-offline/phase2-smoke` again;
7. compare Goal/Session/Evolution/Champion authority bytes before and after the
   model-only sequence.

- [ ] **Step 5: Build, run focused GREEN and commit**

Run the package build, model focused tests, Runtime Bundle tests and installed
E2E serially. Then:

```powershell
git add -- packages/tianwen-runtime-bundle/package.json `
  tests/dsh-migration/runtime-bundle.spec.ts `
  tests/dsh-migration/tianwen-startup.e2e.spec.ts
git commit -m "test: prove installed model configuration"
```

### Task 3: Independent review, release gates and handoff

**Files:**

- Create: `docs/operations/tianwen-model-configuration-handoff.md`
- Modify after branch acceptance:
  `docs/architecture-master-session-memory.md` on `main` only

**Interfaces:**

- Consumes the complete Task 1–2 branch.
- Produces a canonical phase handoff, exact remote branch SHA and a docs-only
  main memory update.

- [ ] **Step 1: Dispatch bounded current-turn reviews**

Send one correctness reviewer the design, plan and base-to-HEAD diff. Send one
ponytail reviewer the same diff with the narrow question “what can be deleted or
replaced by DSH/stdlib?” Accept no open Critical or Important correctness issue
and no medium/high needless-complexity issue. Apply only evidence-backed, in-
scope fixes with focused RED/GREEN.

- [ ] **Step 2: Run serial final gates**

In order, using existing audited D-drive pnpm/UV/cache/temp configuration:

1. offline frozen pnpm install with zero downloads;
2. DSH closure and private-import checks;
3. workspace typecheck;
4. focused model and Runtime Bundle tests;
5. complete default Node suite;
6. one installed Profile E2E;
7. explicit Windows local sandbox gate;
8. Python A1–A5 author proof;
9. foreground full pytest;
10. Ruff, base-to-HEAD `git diff --check`, and clean status.

Do not parallelize heavy gates and do not run a real DeepSeek request.

- [ ] **Step 3: Write and verify canonical handoff**

Record exact base/final SHAs, commits, RED/GREEN, command contracts, DSH seams,
receipt examples without a key, installed persistence/reset proof, request count
0, review outcome, final gate counts, retained risks and explicit non-effects.
Run `git diff --check`, then commit:

```powershell
git add -- docs/operations/tianwen-model-configuration-handoff.md
git commit -m "docs: hand off tianwen model configuration"
```

- [ ] **Step 4: Push and update master memory**

Push `codex/tianwen-model-config` by ordinary fast-forward, then use fresh
`ls-remote` to prove the remote SHA equals local HEAD. Only after branch
acceptance, update `docs/architecture-master-session-memory.md` on `main` with
the completed phase, exact branch/SHA/handoff, current product capability,
remaining next step and unchanged restrictions; commit and push that docs-only
memory update separately.
