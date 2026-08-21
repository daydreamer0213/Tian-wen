# Tianwen Explicit Skill Registry Run-Binding Design

**Date:** 2026-08-22
**Status:** Proposed for supervisor review
**Baseline:** `6e34755c663cc336abcce9dea3bff40d80b23b41`

## 1. Purpose

The one authorised configured-Provider natural Run stopped before its first
Turn with the safe code `pre-turn-internal-error`, zero model requests, and no
durable change. The resulting evidence and the approved rc.7 public-API
probes establish one concrete product cause:

- Cordis denies a service Context access to a service that is absent from its
  declared `inject` list.
- `TianwenLearningIntakeService` declares only `tianwenEvidence` and
  `tianwenEvolution`, but `bindRunWithSkill()` reads `this.ctx.skills`.
- the natural resume runner enters `ctx.inject(['skills'], ...)`, then calls
  the pre-existing learning service from that callback without passing the
  callback's authorised Context or registry capability.

The direct `this.ctx.skills` read occurs after the already-proven
`prepareRunBinding()` and initial Session digest checks, but before the
source-owned fixed Skill and Evolution-write classifications. It is therefore
the reachable, correctly observed cause of the former
`pre-turn-internal-error`.

This work repairs that dependency boundary only. It neither retries the Goal
nor changes the safe natural-trial receipt schema.

## 2. Product boundary

- DSH `0.1.0-rc.7` remains the only product Agent Runtime.
- DSH continues to own Agents, Sessions, Goals, Skills, provider selection,
  tool execution, and the current Run.
- Tianwen continues to own only its existing cross-Run Evidence/Evolution
  governance facts and ledger.
- There is no new Runtime, service, Skill loader, registry, store, logger,
  telemetry stream, queue, worker, retry loop, budget/price path, or error
  framework.
- The existing `pre-turn-failed` receipt union and closed failure codes stay
  exactly as they are. A successful code repair is not permission to rerun the
  existing natural Goal.
- Python Alpha, RepoTaskRuntime, AlphaRuntime, Dynamic Cordis activation,
  Candidate, Evaluation, Shadow, Promotion, rollback, and legacy Artifact or
  Champion paths remain out of scope.

## 3. Chosen design: caller-authorised read capability

`bindRunWithSkill()` gains one explicit final argument:

```ts
skills: Pick<Context['skills'], 'get'>
```

The method uses `skills.get(skillName, { cwd: session.header.cwd, scope:
agent })` for its one DSH Skill read. It keeps every other responsibility and
ordering unchanged:

1. digest and reject an already-started Turn;
2. prepare the same Run binding identity;
3. resolve the same scoped DSH Skill using the supplied capability;
4. preserve the model-invocable and canonical-manifest checks;
5. recheck the pre-Turn Session boundary;
6. persist the existing Run binding and Run Skill Manifest through the
   existing Evolution ledger; and
7. preserve the final Session and prepared-manifest checks.

The parameter is structural and read-only. It is deliberately not a new
Tianwen interface, adapter, service, or registry wrapper.

`TianwenLearningIntakeService.static inject` remains
`['tianwenEvidence', 'tianwenEvolution']`; `tianwen-runtime` retains its
current `dynamicCordisRunner` injection. The unrelated Stage 2
`consumeOutcome()` and `recordSkillUse()` paths must not acquire a hard
`skills` dependency merely because governed pre-Turn binding needs one.

## 4. Caller flow

Every existing direct caller supplies the `skills` capability it already owns:

- the natural resume runner changes its existing gate to
  `ctx.inject(['skills'], async injectedCtx => ...)` and passes
  `injectedCtx.skills` to `learning.bindRunWithSkill()`;
- the governed-candidate and paired-evaluation demos pass
  `harness.ctx.skills`;
- governed Skill runtime tests pass their harness registry, including every
  guarded/persistence/race invocation.

The runner's binding declaration is updated to require the fourth argument.
No caller reaches through `agent.ctx`, a global Context, or a service-private
Context to evade Cordis dependency isolation.

## 5. Why this is the smallest correct repair

The repair must use the capability already authorised at the caller. Four
alternatives are intentionally rejected:

1. **Hard-inject `skills` into `TianwenLearningIntakeService` or the whole
   runtime.** It makes all Learning Intake users require a Skill registry,
   including Stage 2 outcome intake that does not read Skills.
2. **Create another binding service.** One method needs one read capability;
   splitting it would add a second service and lifecycle without reducing any
   dependency.
3. **Create a generic DI adapter or registry wrapper.** `SkillRegistry.get`
   is already the public rc.7 seam and the structural parameter is smaller.
4. **Add logging, telemetry, or a diagnostic mode.** The root cause is
   established. New reporting would not make the binding authorised.

This preserves Cordis' declared-dependency contract rather than bypassing it.

## 6. Verification design

The regression must mount the actual `tianwen-runtime` module through
Cordis' plugin mechanism, not invoke its exported `apply()` directly. That
preserves the module's declared injection boundary and makes the old
implementation fail with the exact undeclared-`skills` access before any
Evolution write. The GREEN contract passes the caller's real registry and
records the normal governed Run binding without changing the Session.

The natural-runner regression must additionally prove that the existing
`ctx.inject(['skills'])` callback receives `injectedCtx` and passes its
`skills` value to `bindRunWithSkill()`. The product remains pre-Turn in that
test; it must make no Provider request and no Goal resume.

Focused runtime tests, both workspace builds, typecheck, DSH rc.7 closure,
private-import check, the existing natural evidence demo, and the current CI
focused suite provide the final proof. No workflow, dependency, lockfile, or
Python-contract change is required because the affected focused specs are
already on the TypeScript CI path.

## 7. Operational truth and stop line

This design repairs a deterministic pre-Turn product defect. It does not
claim that the configured model, verifier, natural task result, learning
decision, or later governance stages will succeed. A further operational
attempt may occur only after separate feature review, exact-main CI, installer
validation, and explicit supervisor release. If it is not separately
released, the correct result is no retry.

## 8. Review checklist

- **Correctness:** all existing callers pass their own authorised registry;
  old module-mounted code reproduces the isolation failure; the explicit
  capability path passes without Session change.
- **Architecture/privacy/DSH:** no service-wide Skill injection, Agent escape,
  global registry, raw error output, new ledger fact, or second Runtime.
- **Ponytail/YAGNI:** one structural `get` capability replaces one illegal
  service lookup; no adapter, wrapper, framework, or speculative diagnostics.
