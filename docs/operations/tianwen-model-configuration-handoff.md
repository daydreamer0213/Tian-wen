# Tianwen model configuration handoff

**Status:** complete on the feature branch; no live DeepSeek request was sent.

## Authority

- Branch: `codex/tianwen-model-config`
- Base: `2d2777524a9feef0cb314ce46160ae40bd435e32`
- Accepted code HEAD before this handoff:
  `6a23d2e7297de9d28a53f3e68586c0e748e9ea68`
- DSH release: exact `0.1.0-rc.6`
- Design:
  `docs/superpowers/specs/2026-08-16-tianwen-model-configuration-design.md`
- Plan:
  `docs/superpowers/plans/2026-08-16-tianwen-model-configuration.md`

## Product result

The installed Tianwen CLI now exposes two explicit model commands:

```powershell
tianwen model status --data-dir 'D:\TianwenData' --json
tianwen model use --model deepseek-v4-pro --data-dir 'D:\TianwenData' --json
```

The fixed choices are:

| Tianwen choice | DSH provider | DSH model |
|---|---|---|
| `offline` | `tianwen-offline` | `phase2-smoke` |
| `deepseek-v4-flash` | `deepseek-official` | `deepseek-v4-flash` |
| `deepseek-v4-pro` | `deepseek-official` | `deepseek-v4-pro` |

The selection is persisted by DSH's existing default-model/settings services.
A fresh process observes the saved selection. The user can always return to the
offline smoke model with:

```powershell
tianwen model use --model offline --data-dir 'D:\TianwenData' --json
```

Model commands are configuration-only. They do not create an Agent or Session,
do not resume a Goal, and do not send a model request.

## Credentials

DeepSeek uses DSH's existing credential reference `DEEPSEEK_API_KEY`. Tianwen
does not implement another credential store. Status reports only:

- reference name;
- configured or not configured;
- safe source label such as `env`;
- whether the source is writable.

It never returns the credential value. This phase deliberately does not add a
`--key` argument, stdin protocol, repository secret, Session field, Goal field,
receipt field, desktop form, vault, daemon, or database.

Example receipt, with no credential value:

```json
{
  "schemaVersion": "tianwen.model-config.v1",
  "operation": "status",
  "selection": {
    "provider": "deepseek-official",
    "model": "deepseek-v4-pro"
  },
  "credential": {
    "reference": "DEEPSEEK_API_KEY",
    "configured": true,
    "source": "env",
    "writable": false
  },
  "modelRequestsDelta": 0
}
```

## DSH seams reused

The implementation uses public package-root services from the installed DSH
Profile:

- `agentDefaultModel.currentSelection()` and `saveSelection()`;
- `llm.listModels()` for the fixed DeepSeek provider;
- `credentials.describe(credentialRef('DEEPSEEK_API_KEY'))`;
- DSH settings-file and credentials-local behavior already mounted by the
  base Profile;
- the public one-shot lifecycle pattern
  `await ctx.get('loader')?.await()` used by published `dsh-headless`.

The model runner's generated metafile has exactly
`src/model-runner.ts` as its local input. Its only non-Node external is the
public root `@deepseek-ai/dsh-credentials`. It does not bundle Goal, Session,
Evidence, Evolution, or other Tianwen runtime code.

## Installed proof

The installed E2E first completed the existing offline create/resume path. It
then used a runtime-generated fake credential only in child environment and:

1. read offline status;
2. selected `deepseek-v4-pro`;
3. read V4 Pro from a fresh process;
4. selected `offline`;
5. read `tianwen-offline/phase2-smoke` from a fresh process.

The test preloaded a runtime-generated fetch guard into model-command child
processes. Any call to global `fetch` would write a marker and fail the child.
The guard was actively self-tested first; no marker appeared during any model
command. The test also compared the Session path set and Goal, Session,
Evolution and Champion authority bytes before and after the model-only
sequence. They were unchanged.

The final installed E2E at code HEAD `6a23d2e` passed `1/1` in `43.39s`
(`42.65s` test time). No paid provider request, API-key transmission, live web,
or Docker action occurred.

## Lifecycle defect found and resolved

The first independent-proof run exposed an rc.6 one-shot timing defect: the
very fast model runner printed a valid receipt but called `appExit` while DSH
was still completing Profile loader/watch setup, so Node exited `13` with an
unsettled top-level-await warning.

A test-only fetch guard was ruled out by an A/B command: guarded and unguarded
commands both produced the same valid receipt and exit `13`, and no request
marker existed.

An initial `setImmediate` workaround passed focused tests but failed the real
installed E2E and was superseded. The final fix mirrors published
`@deepseek-ai/dsh-headless@0.1.0-rc.6`: wait for public `loader.await()` before
one-shot work and `appExit`. A direct installed command then exited `0`, and
the complete E2E passed.

One later E2E attempt stopped at its opening smoke because the earlier failed
run had left the isolated Profile selected on V4 Pro. This was generated test
state, not a product regression. An explicit installed offline reset exited
`0`; the subsequent clean E2E passed.

## Commits before handoff

| Commit | Purpose |
|---|---|
| `e2dd348` | design the minimal DSH-backed model configuration |
| `30ebd33` | add the explicit offline rollback contract |
| `1007ac7` | add the implementation plan |
| `8ad1fe5` | implement model status/use and fixed Profile runner |
| `c9f19fe` | keep errors safe and reject unsupported saved selections |
| `b645391` | bind the mechanical lockfile importer change |
| `e92f9e7` | package the runner and prove installed persistence |
| `e992116` | add runtime credential/request observations and exact runner boundary |
| `179596a` | record the failed event-loop deferral hypothesis |
| `6a23d2e` | use DSH's public loader lifecycle boundary |

## TDD and review

Task 1 focused RED covered missing CLI/model behavior. Task 2 package RED
covered missing manifest/export/metafile/packlist entries. Review fixes obtained
behavioral RED for:

- committed credential-shaped fixture literals;
- the broad runner input/external closure;
- missing independent request observation;
- model execution before loader settlement.

Task 1 review closed two Important findings around error leakage and unsupported
saved selections. Its one deferred Minor is deliberate: direct exported helper
callers do not duplicate the installed CLI's model-choice membership check.

Task 2 initial review found three Important items. The narrow re-review marked
all three addressed with `0 Critical / 0 Important / 0 Minor`.

The whole-feature correctness review found no product-code issue; its only
open Important was the then-missing final gate record and this handoff. The
independent ponytail review concluded `Lean already. Ship.`

## Final serial gates

All generated data and caches remained on `D:`. Heavy commands were not run in
parallel.

| Gate | Result |
|---|---|
| offline frozen pnpm install | exit `0`; already up to date; pnpm `11.20.0` |
| DSH closure | exit `0`; 187 exact rc.6 packages; 15 public surfaces |
| private-import scan | exit `0`; 0 violations |
| workspace typecheck | exit `0` |
| Runtime Bundle build | exit `0`; model runner `4.3kb` |
| focused model + Runtime Bundle | 2 files, 37 passed |
| default Node suite | 19 files passed, 2 skipped; 165 passed, 7 planned skips |
| installed Profile E2E | 1 passed in 43.39s |
| Windows local sandbox | 3 passed in 1.08s |
| A1-A5 author proof | 10 passed in 4.10s |
| foreground Python suite | 424 passed, 4 planned skips in 156.01s |
| Ruff | all checks passed |
| base-to-HEAD diff check | exit `0` |
| Git status before handoff | clean |

Sandbox report SHA-256 remained:
`ddcc714a9b30896f380cba20a29530cc633cfa874ec4dea890c4a7c3ef498ef1`.
Windows local enforcement remains `partial`; this result is not a strong
isolation claim.

## Retained limits and next step

- DSH is still Developer Preview `0.1.0-rc.6`.
- No live DeepSeek request has been authorized or tested.
- The user must provide `DEEPSEEK_API_KEY` through DSH-supported environment or
  credential management before a future explicit live run.
- Model choice is fixed to three known values; arbitrary provider/model routing
  is intentionally absent.
- The CLI remains the trusted ingress. No desktop UI, daemon, scheduler,
  database, generic secret framework, or second runtime was added.
- Windows local sandbox remains partial. High-risk execution still requires a
  container, remote sandbox, or microVM.
- Python and A1-A5 remain unchanged as the independent evaluator/research
  baseline.

The recommended next phase is an explicit, user-controlled live-model smoke
contract with a hard cost boundary and no automatic request. It must remain
separate from this configuration-only phase and requires user authorization
before any paid request.
