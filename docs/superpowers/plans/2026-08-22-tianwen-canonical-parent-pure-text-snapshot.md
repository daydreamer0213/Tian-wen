# Canonical Parent Pure-Text Snapshot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to carry out this plan task by task, use `test-driven-development` for every behaviour change, and use `verification-before-completion` before reporting a gate as green.

**Goal:** Let a natural Run use a real, self-contained filesystem incumbent parent Skill without allowing its filesystem transport fields to diverge from the parent frozen in the governance ledger.

**Architecture:** In the natural-trial pre-Turn seam, resolve the incumbent through the actual Agent-scoped registry, prove that it is one directory containing exactly one regular `SKILL.md`, project only the governance-relevant pure-text fields, and register that snapshot only in the same Agent scope. Bind the Run with that same scoped registry. The filesystem definition remains the root winner; the scoped snapshot disappears with the Agent.

**Tech stack:** TypeScript, DSH 0.1.0-rc.7 public Context/SkillRegistry/filesystem APIs, Vitest, existing DSH migration/runtime harnesses, existing Python repository-surface contract.

## Global constraints

- Approved design ancestor is `4eb54d7b25098439cd801931e8f14b1849eebb33`; current main is `a008686b0f1629225e36e8aa16b16b2851052249`.
- An implementation release must provide its exact reviewed design+plan commit through `TIANWEN_PLAN_SHA`. A missing, non-commit, non-ancestor, or tree-incomplete value is a stop; do not guess a moving branch tip or implement from the design-only ancestor.
- Create the implementation branch `codex/tianwen-canonical-parent-pure-text-snapshot` from the supervisor-provided `TIANWEN_PLAN_SHA` only after the implementation release is received. Reuse `D:\DevData\tianwen-worktrees\tianwen-explicit-feedback-intake` and its sole existing `node_modules`.
- Use the existing D: pnpm store/cache. Do not create a worktree, clone, node_modules tree, virtual environment, profile, probe project, download, install, relink, Provider call, paid model call, Docker, Alpha, runtime-profile, Goal, or resume during implementation Tasks 1–3.
- Set `pnpm_config_verify_deps_before_run=false` only in the process environment for local pnpm gates; do not write an `.npmrc`.
- DSH `0.1.0-rc.7` remains the only product Agent Runtime. Do not add a Tianwen Agent loop, Runtime/service injection, Provider wrapper, registry service, store, event, queue, scheduler, logger, retry, error-code, budget, or price mechanism.
- Do not add `@deepseek-ai/dsh-fs` as a direct dependency or change any package manifest or lockfile. If the current public Context type cannot expose filesystem capability without doing so, stop at the type/build evidence rather than silently widening dependencies.
- Candidate remains inert and unregistered. This seam applies only to the incumbent parent in a single natural-trial Agent scope; it does not enable Candidate, B/C evaluation, Shadow, pointer, promotion, rejection, rollback, or Artifact/Dynamic Cordis paths.
- Snapshot-resolution failures occur before either ledger formal write and must produce the existing source-owned pre-Turn result only. The existing binding sequence remains two formal writes: `recordRunBinding` first, then `recordRunSkillManifest`; an unknown persistence failure may have committed the first write and must not be described as zero Evolution writes.
- Do not change the public eight-event whitelist, safe-receipt schema/failure-code set, ordinary resume, live smoke, v1/v2 replay, or Stage 1–7 semantics except for the incumbent-parent representation required here.

## Current bearing baseline

The existing TypeScript CI focused Vitest command carries these 20 files:

`evidence`, `research-preview-demo`, `learning-intake`, `learning-intake-runtime`, `explicit-correction-demo`, `outcome-intake`, `outcome-intake-runtime`, `repeated-outcome-demo`, `skill-governance`, `skill-governance-runtime`, `governed-skill-candidate-demo`, `skill-evaluation`, `skill-evaluation-runtime`, `paired-skill-evaluation-demo`, `skill-shadow`, `skill-shadow-eligibility-demo`, `skill-promotion`, `skill-promotion-readiness-demo`, `natural-run-evidence-runtime`, and `natural-run-evidence-demo`.

The Stage 7 local bearing set adds `tests/dsh-probe/evolution.spec.ts`, `tests/dsh-migration/goal-resume.spec.ts`, `tests/dsh-migration/runtime-bundle.spec.ts`, and `tests/dsh-migration/runtime-composition.spec.ts`, for 24 files total. The eight existing demo commands are the full demo baseline. Extend the existing `natural-run-evidence-runtime.spec.ts`, which is already in CI, rather than adding a CI workflow step or a test-framework layer.

## Workspace setup and baseline stop gate

1. Require the release-supplied SHA before reading or switching branches:

```powershell
$planSha = $env:TIANWEN_PLAN_SHA
if ([string]::IsNullOrWhiteSpace($planSha)) { throw 'supervisor release must set TIANWEN_PLAN_SHA' }
git rev-parse --verify "$planSha^{commit}"
git merge-base --is-ancestor 4eb54d7b25098439cd801931e8f14b1849eebb33 $planSha
if ($LASTEXITCODE -ne 0) { throw 'reviewed design+plan SHA does not descend from the approved design ancestor' }
git cat-file -e "${planSha}:docs/superpowers/specs/2026-08-22-tianwen-canonical-parent-pure-text-snapshot-design.md"
git cat-file -e "${planSha}:docs/superpowers/plans/2026-08-22-tianwen-canonical-parent-pure-text-snapshot.md"
```

2. Verify the D: implementation worktree is clean; the sole `node_modules/.modules.yaml` exists; and the specified fixture roots are absent or contain zero files and zero bytes. With the source design/plan branch still checked out, verify `git rev-parse HEAD`, `git rev-parse '@{u}'`, and `git ls-remote origin refs/heads/codex/tianwen-canonical-parent-pure-text-snapshot-design` all exactly equal `$planSha`. Unknown fixture content, a SHA mismatch, or a missing source ref is a stop, not cleanup or fetch.
3. Read the exact design and this plan from `$planSha` in full, then read the current natural runner, learning-intake binding, skill-governance preparer, DSH public package declarations, current natural runtime tests, Stage 3/Stage 7 canonical specifications, current handoff, public contract, and CI command.
4. Create/switch `codex/tianwen-canonical-parent-pure-text-snapshot` exactly at `$planSha`. Verify main local/tracking/remote remains `a008686b0f1629225e36e8aa16b16b2851052249` without fetching.
5. Establish the baseline with the current runtime-bundle dependency build, repository typecheck, DSH rc.7 closure, private-import gate, the focused natural runtime spec, and `git diff --check`. A baseline failure outside the future diff is a stop with preserved evidence.

## Task 1: Scope-local pure-text snapshot and durable identity proof

**Files:**

- Modify `packages/tianwen-runtime-bundle/src/resume-runner.ts`.
- Modify `tests/dsh-probe/natural-run-evidence-runtime.spec.ts`.
- Modify `tests/dsh-probe/skill-governance-runtime.spec.ts` only if the existing formal-write tests need one durable-state assertion; do not create a new test layer.

### RED

1. In `natural-run-evidence-runtime.spec.ts`, mount the real public `LocalFileSystem`, `SkillRegistry`, and the full `@deepseek-ai/dsh-skill-filesystem` ESM module namespace with `watch: false`, a temporary custom Skill directory, and the same public filesystem configuration form used by the previous resolver evidence. Do not hand-craft a definition with `resourceBase` as the principal contract.
2. Put a real `single-parent/SKILL.md` in that test-only directory and resolve it from the actual filesystem provider in the real resumed Agent scope. Confirm the raw resolved definition is filesystem-sourced and contains its transport form (`path` and directory `resourceBase`) before calling the existing natural-run seam.
3. Drive the unchanged runner with the valid filesystem parent and assert the current exact failure is `run-binding-precondition-failed`, before `goals.resume`, with zero Agent Turn, model requests, tool calls, and Evolution writes. This is the bearing RED; it proves the real provider path rather than a hand-made object.
4. Add RED assertions for the eventual Green contract in the same focused test:
   - a real `skill` tool call returns content exactly equal to `renderSkillContent()` for the frozen parent and provider recorded by the Run manifest;
   - `recordSkillUse` is `recorded` and its version/content digest matches the frozen parent/manifest relationship;
   - the private manifest, public event projection, safe receipt, and serialized demo-safe projection contain no `path`, `resourceBase`, or `metadata` keys;
   - after the `inject` callback completes but before `handle.dispose`, the Agent-scoped registry resolves the pure snapshot; after disposal, root resolution is still the filesystem winner and the scoped snapshot is no longer visible;
   - no Candidate registration occurs.
5. Add the real filesystem sidecar/multi-file directory rejection before binding, with zero Evolution writes, Turn, Provider, or tool call. This and the valid one-file filesystem parent are the principal provider-bearing cases. Test URL/opaque resource bases and directory/path target mismatch only as clearly labelled secondary synthetic provider-shape cases through the narrow injected capability; they are expected one-file/shape refusals. Test a resolving/listing throw separately as an untagged unexpected error that remains `pre-turn-internal-error`. Do not call those synthetic cases natural filesystem-provider cases or construct a VFS/provider framework merely to produce them.
6. In `skill-governance-runtime.spec.ts`, retain the existing separate failure injections for `recordRunBinding` and `recordRunSkillManifest`. Add only the assertion needed to make the corrected durability wording explicit: the first failure has no binding write, while the second preserves its existing commit-unknown/source-owned semantics and is never claimed to have zero writes.

Run the focused RED command with existing dependencies only:

```powershell
$env:pnpm_config_verify_deps_before_run = 'false'
pnpm exec vitest run tests/dsh-probe/natural-run-evidence-runtime.spec.ts tests/dsh-probe/skill-governance-runtime.spec.ts
```

Expected result: the real one-file filesystem case fails at the old strict parent projection with `run-binding-precondition-failed`; no test should write product data or contact a Provider.

### GREEN

1. Keep the change local to `resume-runner.ts`, adjacent to the existing natural-trial preflight/binding seam. Do not create a generic snapshot package or adapter.
2. Define only the narrow local structural capability required by the public Context shape, for example a filesystem target with an opaque `targetKey`, a directory entry `{ name, type, target }`, and `resolve()`/`listDir()` methods. Obtain it through the already-authorized Agent Context and validate it with a type guard; use no `any`, no global escape, and no new direct DSH filesystem import.
3. After `handle.agent` exists but before `bindRunWithSkill()` and before `ctx.goals.resume()`, enter `handle.agent.ctx.inject(['skills', 'fs'], async injectedCtx => ...)`. Within that callback:
   - resolve the raw incumbent through `injectedCtx.skills.get(parentSkillName, { scope: handle.agent })`; the Agent itself is the rc.7 ScopeKey;
   - require a model-invocable filesystem parent with a directory resource base;
   - resolve the directory resource base and raw Skill path with the public filesystem capability;
   - list that exact directory, require exactly one regular entry named `SKILL.md`, and require its opaque target identity to equal the resolved raw Skill target;
   - project precisely `name`, `description`, optional `whenToUse`, `invocation`, `source`, `provider`, and `content`. Reject path, resource base, metadata, URL/opaque bases, sidecars, and mismatched targets without logging their values;
   - immediately register the projected pure snapshot with `injectedCtx.skills.register(snapshot)` in that Agent scope;
   - pass the same `injectedCtx.skills` registry to `bindRunWithSkill()`.
4. Preserve the existing binding method’s `prepareRunBinding`, scoped `skills.get`, canonical parent preparation, second pre-Turn session check, and two formal Evolution writes. Do not alter `TianwenLearningIntakeService.inject`; Stage 2 `consumeOutcome` and `recordSkillUse` must remain usable without a SkillRegistry dependency.
5. In `resume-runner.ts` define one private, local `NaturalParentSnapshotError` (or an equivalently local helper) whose only structured field is an existing closed code. Its constructor accepts exactly `'skill-unavailable' | 'skill-not-model-invocable' | 'run-binding-precondition-failed'`, has only a fixed non-sensitive message, and never carries path, resourceBase, metadata, raw cause, or an arbitrary message. Throw it only for expected snapshot outcomes, so the existing `runSkillBindingFailureCode()` catch preserves the exact mapping: raw parent missing → `skill-unavailable`; raw parent non-model-invocable → `skill-not-model-invocable`; one-file/resource target/shape rejection → `run-binding-precondition-failed`. Do not catch or retag unexpected `skills.get`, filesystem, registration, or programming errors: the existing runner catch must continue mapping those to `pre-turn-internal-error`. Do not add a failure code, generic error framework, logger, Runtime-root import, or service injection.
6. Make the lifetime assertion executable without a product hook. In the existing harness, spy on the already-called synchronous `ctx.goals.resume` method, capture its Agent and arguments, signal a test-only deferred `resumeEntered` promise, and temporarily withhold its original invocation. Start `runGoalResume()` and await `resumeEntered` after the runner’s scoped-registration callback has returned. Do not monkey-patch `inject` or attempt to capture the runner callback’s local `injectedCtx`. Instead, enter the captured Agent’s own public Context only for a read: `await capturedAgent.ctx.inject(['skills'], async testCtx => { observed = await testCtx.skills.get(snapshotName, { cwd: capturedAgent.session.header.cwd, scope: capturedAgent }) })`. Assert `observed` is the pure snapshot while the first Turn has not started. Then invoke the saved original `goals.resume` with the captured arguments and await the runner. After its existing `handle.dispose()`, re-enter the root/global resolver to assert the filesystem winner is still present. Query the disposed Agent scope for absence only when its current public declaration permits that query; otherwise prove scope cleanup through completed existing handle disposal plus root/provider snapshot count showing only the filesystem winner, without invoking a disposed object. This test-only barrier must only query; it must not register/unregister. It uses the existing Goal-drive seam and adds no product callback, diagnostics API, store, or reusable test framework.
7. Lock the four actual source-owned branches in focused tests: raw missing parent, raw non-model-invocable parent, expected one-file/shape refusal, and an untagged unexpected throw. Assert respectively `skill-unavailable`, `skill-not-model-invocable`, `run-binding-precondition-failed`, and `pre-turn-internal-error`, always before `goals.resume` with zero Turn/Provider/tool. Keep the persistence failure test separate because it retains its existing formal-write semantics.

Run the focused GREEN gate above. Then run the existing natural demo and require its current safe mechanism claims to remain truthful; it must not claim natural efficacy:

```powershell
$env:pnpm_config_verify_deps_before_run = 'false'
pnpm run demo:natural-run-evidence
```

Commit only the Task 1 files:

```powershell
git add packages/tianwen-runtime-bundle/src/resume-runner.ts tests/dsh-probe/natural-run-evidence-runtime.spec.ts tests/dsh-probe/skill-governance-runtime.spec.ts
git commit -m "feat: snapshot one-file natural parent Skills"
```

## Task 2: Narrow canonical wording and permanent public boundary

**Files:**

- Modify `docs/superpowers/specs/2026-08-20-tianwen-governed-skill-candidate-design.md`.
- Modify `docs/superpowers/specs/2026-08-21-tianwen-natural-run-evidence-trial-design.md`.
- Modify `docs/operations/tianwen-stage7-natural-run-evidence-trial-handoff.md` only for durable operational facts.
- Modify `tests/contracts/test_public_repository_surface.py` only if a compact permanent wording assertion prevents regression. Do not rewrite historical plans or add a workflow change.

### RED

1. Add a focused static public-contract expectation for the permanent handoff only when it can assert the required truth without exposing content: a self-contained single-file incumbent parent is governed as a pure-text scoped snapshot; `path`, `resourceBase`, and `metadata` are excluded; Candidate remains unregistered; multi-file parents remain unsupported. The old handoff/spec wording lacks this closed boundary, so the assertion must fail before document edits.
2. Verify that the current Stage 3 wording still implies a raw resolved definition has no resource base, and that the Stage 7 sequence does not yet state filesystem resolve → validate/project → scoped register → frozen binding → render/use proof. Record this as the documentation RED, not a product behaviour claim.

### GREEN

1. Make the smallest precise changes permitted by approved design §9:
   - Stage 3 distinguishes raw filesystem transport data from the frozen pure incumbent snapshot, retains Candidate’s non-registration rule, and does not broaden resource governance;
   - Stage 7 names the exact pre-Turn data flow and same-Agent-scope lifecycle, says one-file only, and says multi-file/sidecar parents refuse before binding;
   - the handoff records the permanent boundary without publishing local paths, resource bases, metadata, Skill text, prompt, session content, or receipt internals;
   - the public contract locks only the permanent phrases that have public value.
2. State the correct durability order: filesystem resolve, one-file validation, pure projection, scoped registration, and parent preparation failures have zero ledger writes; successful bind first writes existing Run binding, then private RunSkillManifest; second-write persistence failure retains current commit-unknown semantics; Turn-later facts remain separate.
3. Do not modify budget/price rules, Stage 5/6 status machines, historical implementation plans, public event types, or failure codes.

Run the compact documentation/public boundary gate:

```powershell
$tianwenPython = 'D:\DevData\conda-envs\asset-intel\python.exe'
if (Test-Path -LiteralPath $tianwenPython -PathType Leaf) {
  & $tianwenPython tests/contracts/test_public_repository_surface.py
} else {
  Write-Output 'local Python contract unavailable; exact-main CI remains the bearing gate'
}
git diff --check
```

Commit only the Task 2 files:

```powershell
git add docs/superpowers/specs/2026-08-20-tianwen-governed-skill-candidate-design.md docs/superpowers/specs/2026-08-21-tianwen-natural-run-evidence-trial-design.md docs/operations/tianwen-stage7-natural-run-evidence-trial-handoff.md tests/contracts/test_public_repository_surface.py
git commit -m "docs: govern one-file parent Skill snapshots"
```

## Task 3: Fresh bearing gates, reviews, and feature handoff

**Files:** No new product files. Touch only a previously listed file if a fresh gate proves a reachable Critical or Important defect; first reproduce it RED, make the narrowest correction, and rerun the affected test plus all final gates.

### Fresh final gates

Run with existing dependencies and `pnpm_config_verify_deps_before_run=false`:

```powershell
pnpm --filter @tianwen/runtime-bundle build
pnpm run typecheck
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
pnpm exec vitest run tests/dsh-probe/evidence.spec.ts tests/dsh-probe/research-preview-demo.spec.ts tests/dsh-probe/learning-intake.spec.ts tests/dsh-probe/learning-intake-runtime.spec.ts tests/dsh-probe/explicit-correction-demo.spec.ts tests/dsh-probe/outcome-intake.spec.ts tests/dsh-probe/outcome-intake-runtime.spec.ts tests/dsh-probe/repeated-outcome-demo.spec.ts tests/dsh-probe/skill-governance.spec.ts tests/dsh-probe/skill-governance-runtime.spec.ts tests/dsh-probe/governed-skill-candidate-demo.spec.ts tests/dsh-probe/skill-evaluation.spec.ts tests/dsh-probe/skill-evaluation-runtime.spec.ts tests/dsh-probe/paired-skill-evaluation-demo.spec.ts tests/dsh-probe/skill-shadow.spec.ts tests/dsh-probe/skill-shadow-eligibility-demo.spec.ts tests/dsh-probe/skill-promotion.spec.ts tests/dsh-probe/skill-promotion-readiness-demo.spec.ts tests/dsh-probe/natural-run-evidence-runtime.spec.ts tests/dsh-probe/natural-run-evidence-demo.spec.ts tests/dsh-probe/evolution.spec.ts tests/dsh-migration/goal-resume.spec.ts tests/dsh-migration/runtime-bundle.spec.ts tests/dsh-migration/runtime-composition.spec.ts
pnpm run demo:research-preview
pnpm run demo:explicit-correction
pnpm run demo:repeated-outcome
pnpm run demo:governed-skill-candidate
pnpm run demo:paired-skill-evaluation
pnpm run demo:shadow-eligibility
pnpm run demo:promotion-readiness
pnpm run demo:natural-run-evidence
```

Run Python/Ruff only through the existing D: interpreter if available; do not use bare `uv` or create an environment:

```powershell
$tianwenPython = 'D:\DevData\conda-envs\asset-intel\python.exe'
if (Test-Path -LiteralPath $tianwenPython -PathType Leaf) {
  & $tianwenPython -m ruff check .
  & $tianwenPython tests/contracts/test_public_repository_surface.py
} else {
  Write-Output 'local Python/Ruff unavailable; record as pending for exact-main CI'
}
git diff --check
```

Verify every prescribed fixture root, `.dsh-probe`, and temporary single-file test root end at zero files/zero bytes; do not delete unknown content. Verify `.modules.yaml` identity is unchanged. Ensure no Provider, paid token/CNY, Docker, Alpha, install, download, or relink occurred.

### Independent reviews

Request three read-only reviews against `a008686b0f1629225e36e8aa16b16b2851052249`:

1. Correctness/replay: real filesystem RED, same registry for registration/binding, one-file identity, persistence semantics, ordinary/live-smoke/v1/v2 regressions.
2. Architecture/privacy/DSH: public API-only capability, no new dependency/service/store/error code, scoped lifetime, immutable Candidate, raw transport/content privacy, and public eight-event boundary.
3. Ponytail/YAGNI: prove the local helper and structural filesystem shape are smaller than a resource copier, direct dependency, registry layer, or generalized snapshot framework.

Any verified Critical or Important review finding requires a new narrow RED/GREEN correction and rereview. Do not repair speculative edge cases. Final review threshold is Critical 0, Important 0, with an explicit Ready result.

### Feature delivery

1. Audit planned versus unplanned files with `git diff --name-only a008686b0f1629225e36e8aa16b16b2851052249..HEAD` plus the worktree diff. There must be no package, lockfile, workflow, runtime-service, ledger-schema, or dependency change.
2. Verify clean worktree and `git diff --check`.
3. Push exactly once with a normal non-force push, then verify local, upstream tracking, and `git ls-remote origin refs/heads/codex/tianwen-canonical-parent-pure-text-snapshot` resolve to the same final SHA.
4. Report commits, file audit, RED/GREEN facts, 24-file and eight-demo gates, Python availability, fixture/resources, reviews, and exact refs to the supervisor. Stop before Task 4.

## Task 4: Supervisor-only mainline integration

Do not execute this task without a separate exact-feature approval. The supervisor must independently inspect the feature SHA, clean refs, file audit, and fresh gates. Only after approval may the main worktree perform one `--no-ff` merge, verify merge parents and tree equality to the approved feature, run `git diff --check`, push once without force, and wait for the exact automatic push CI. Python, TypeScript, and `installer-windows` must all succeed. A CI failure is evidence-only: collect the narrow safe log and stop without rerun, patch, or second push.

## Task 5: Separately authorized fresh operational evidence

This task is not part of feature implementation and needs a separate approval after exact-main CI is green. Before any configured Provider operation, rerun `verification-before-completion` against the selected parent and require the one-directory/one-regular-`SKILL.md` condition using public filesystem facts. Choose one agent-authored, independently useful Goal with an existing self-contained single-file Skill, preferring `verification-before-completion` or `receiving-code-review` only after the actual filesystem check. Do not reuse the old `systematic-debugging` Goal or manifest.

If the selected parent is not exactly one self-contained `SKILL.md`, stop at zero Provider. Do not switch to a backup Skill in the same authorization, construct a fake answer, retry, manufacture a Ticket, or make an efficacy claim. A later operation may run at most one normal fresh Goal attempt under its own authorization, use the product safe receipt only, and report only safe IDs/enums/counters/digests/usage. It must not enter Candidate, evaluation, Shadow, pointer, promotion, rollback, or price/budget work.

## Plan self-review before handoff

1. Compare every task with the approved design’s scope, durability correction, data flow, privacy boundary, one-file limitation, and explicit deferred operation. Confirm the setup treats `4eb54d7b25098439cd801931e8f14b1849eebb33` only as the approved design ancestor; requires a supervisor-provided `TIANWEN_PLAN_SHA`; verifies source branch local/tracking/remote exact equality to that SHA; verifies the ancestor and both canonical files in that SHA’s tree; and creates the implementation branch at that SHA rather than an unreviewed moving tip.
2. Re-read current source signatures: `bindRunWithSkill(agent, input, skillName, skills)` remains the binding interface; DSH rc.7 calls use the Agent itself as `scope: handle.agent` / `scope: agent`; the runner must use its injected scoped registry; and the new local filesystem structure must not rely on a package-only type.
3. Confirm Task 1 is a real-provider RED and includes registration lifetime beyond the injection callback via the existing `goals.resume` barrier. Its observer must enter `capturedAgent.ctx.inject(['skills'], async testCtx => ...)` and call `testCtx.skills.get(..., { cwd: capturedAgent.session.header.cwd, scope: capturedAgent })`; it must not monkey-patch inject or claim access to the runner’s local callback value. Confirm render/manifest/use identity, raw-field absence, Candidate non-registration, and zero-write rejection cases. Confirm the only expected snapshot mappings are missing → `skill-unavailable`, non-invocable → `skill-not-model-invocable`, one-file/shape → `run-binding-precondition-failed`, while untagged exceptions remain `pre-turn-internal-error`.
4. Confirm the 24-file set is the 20 current CI focused specs plus four established Stage 7 local bearing specs; confirm all eight existing demos are retained and no workflow expansion is proposed.
5. Confirm the plan names every implementation/document/test file, gives each deliverable a RED, minimal GREEN, focused gate, and commit boundary, and leaves no unexplained file or dependency change.
6. Run:

```powershell
$planPath = 'docs/superpowers/plans/2026-08-22-tianwen-canonical-parent-pure-text-snapshot.md'
$forbidden = @('TO' + 'DO', 'TB' + 'D', 'FIX' + 'ME', 'PLACE' + 'HOLDER', 'implement' + ' later', 'fill in' + ' details')
foreach ($needle in $forbidden) {
  if (Select-String -LiteralPath $planPath -SimpleMatch $needle -Quiet) { throw "plan contains placeholder: $needle" }
}
git diff --check
```

7. Record correctness, architecture/privacy/DSH, and Ponytail/YAGNI self-review as Critical 0 / Important 0 / Minor 0 only if the checks above support it. The exact supervisor-only next entry is review of the pushed plan, not implementation.
