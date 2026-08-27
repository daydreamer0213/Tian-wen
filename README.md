# Tianwen

[中文说明](README.zh-CN.md)

Tianwen is an auditable learning control plane for long-running agents.

**Research preview; Stage 7 complete.** DSH 0.1.1-rc.2 is the only product
Agent Runtime. Tianwen runs in the background as a non-interfering control
plane: it reads execution facts after a normal DSH run and does not replace or
hot-swap the running Agent. One fresh, configured-model natural task has now
completed through the installed product path: its Goal completed, all 45
Evidence records were complete, `Outcome=met`, learning correctly returned
`no-case`, and parent Skill use was recorded before the model was restored to
offline mode. This is project-owner, single-user product evidence—not external-
user validation or proof of general efficacy.

The Stage 7 project-owner natural task and official installer/status proof remain complete.
The five-task B/C, blind evaluator, isolated Shadow, and Promotion/Rollback/Restore product mechanisms are implemented and covered by a 0-external-Provider scripted full-chain fixture.
A fresh official installed configured-DeepSeek controlled lifecycle has now returned `passed`.
Activity-22 closed all 25 formal roles, including five evaluators, five Shadow runs, and three
transitions, then restored the product to offline. Its evidence remains
`naturalUserEvidence=not-claimed` and `externalUserEvidence=not-claimed`.

## Installed ingress readiness

The normal one-shot product flow now completes Profile shutdown before it returns:

```text
model activation → fresh status confirms selection → first controlled-lifecycle invocation begins formal evaluation → offline recovery → final status
```

This is a DSH/HMR shutdown-lifecycle repair, not receipt or security work. HMR owns the watcher-readiness promise created during Profile boot; the repair gives that owner a terminal outcome when shutdown arrives before readiness. Tianwen does not add a second shutdown controller, retry, delay, or forced exit.

Activity-03 remains historically consumed. Its DeepSeek model-use receipt persisted, but the process ended with exit 13 before any controlled-lifecycle invocation; `controlled-lifecycle invocation=0`, and offline recovery and final status succeeded. The historical classifications of Activity-01, Activity-02, and Activity-03 are not rewritten, and this repair does not claim real Provider success.

Model activation and its confirming status remain product setup and do not consume a formal Activity.
Activity-22 then used one official `controlled-lifecycle` invocation to complete the installed product
state machine and restored offline. This current success does not rewrite Activity-01, Activity-02,
or Activity-03, and it does not establish Provider-account request counts or user-effect claims.

The [Activity-22 handoff](docs/operations/tianwen-v0.1-controlled-real-activity-22-handoff.md)
records the current formal result and evidence limits. The
[one-shot Profile lifecycle repair handoff](docs/operations/tianwen-v0.1-one-shot-profile-lifecycle-repair-handoff.md)
and earlier [readiness](docs/operations/tianwen-v0.1-controlled-real-operation-readiness-handoff.md)
and [Activity-01](docs/operations/tianwen-v0.1-controlled-real-activity-01-handoff.md) handoffs remain
historical records.

## Why Tianwen exists

An Agent can finish one session without answering the longer-lived governance
questions: what evidence supports the outcome, what changed across runs, and
whether a repeated signal is strong enough to justify a future change. Tianwen
is intended to make those decisions traceable while leaving current execution
to the Runtime.

## Architecture: DSH runs, Tianwen governs, Alpha is the lab

| Layer | Responsibility |
| --- | --- |
| **DSH** | Runs the current Agent session. Tianwen reuses its models and providers, Agent loop, tools, MCP, sandbox, Session Query, Skill, Jobs, Workflow, Subagent, Message Feedback, Approval, and permissions. |
| **Tianwen** | Owns the cross-run governance boundary: Goal Graph, Evidence provenance, learning attribution, and future-run version governance. The current preview exercises natural Run/Skill binding, read-only Evidence projection, conservative no-case decisions, Signal/Ticket intake, synthetic Candidate intake, controlled Evaluation, isolated Shadow, and governed future-run pointer transitions. |
| **Alpha** | Supplies experimental and evaluation assets. It is not a second product Runtime. |

DSH Message Feedback is an attribution input, not a Lesson by itself. A DSH Job
is process-local work, not a durable cross-run Learning Ticket. The detailed
boundary is maintained in the
[architecture overview](docs/tianwen-architecture-overview-v2.md).

## Use Tianwen in an existing DSH Profile

The portable package currently supports exact `@deepseek-ai/dsh@0.1.1-rc.2`.
Build the one Runtime Bundle tarball from this checkout, then let DSH install it
into the Profile selected by the user:

```powershell
pnpm --filter @tianwen/runtime-bundle... build
pnpm --filter @tianwen/runtime-bundle pack --pack-destination D:\DevData\tianwen-packs
$env:DSH_HOME = 'D:\DevData\dsh-home'
dsh plugin --profile work --allow-build=koffi add D:\DevData\tianwen-packs\tianwen-runtime-bundle-0.1.0.tgz
```

`--allow-build=koffi` is an explicit pnpm approval recorded in that Profile; it
does not change global pnpm settings. Add `--offline` before the tarball only
when the complete dependency closure is already present in the selected pnpm
store.

The installed Profile-local `tianwen` command can target that existing DSH
installation without using the managed Tianwen product root.
`DSH_PACKAGE_ROOT` below is the installed `@deepseek-ai/dsh` package directory,
not `DSH_HOME`:

```powershell
$DshPackageRoot = (Resolve-Path 'D:\path\to\your\dsh-host\node_modules\@deepseek-ai\dsh').Path
& "$env:DSH_HOME\profiles\work\node_modules\.bin\tianwen.cmd" list --dsh-root $DshPackageRoot --dsh-home $env:DSH_HOME --profile work --state-root "$env:DSH_HOME\profiles\work\state"
```

Replace only the first path with the package location used by your DSH
installation.

Remove only the Bundle with `dsh plugin --profile work remove
@tianwen/runtime-bundle`. Tianwen state below the Profile's `state` directory
is deliberately retained. The repository-owned managed installer remains an
alternative for project-controlled deployments:

```powershell
node scripts/install-tianwen.mjs --data-dir D:\DevData\tianwen --json
```

Desktop packaging and a public package/CLI name are later distribution
decisions; they do not require a second Tianwen Runtime Bundle.

## What this preview proves

The repository carries two different evidence classes. Zero-cost scripted
fixtures prove deterministic mechanisms. The Stage 7 natural task proves that
the installed Runtime, configured model, real tools, fresh Goal, Run binding,
Evidence, Outcome, and Skill-use path can close once in the project owner's
actual use. Neither class proves that a Candidate improves broadly.

The deterministic demo follows the normal DSH Agent loop. A scripted adapter
returns two responses, a deterministic `summarize` tool runs once, and the turn
ends with `execution.status=completed`. Tianwen then projects one complete
Evidence record without mutating the DSH session: the before and after event
digests are identical within that run.

With no repeated failure or user correction, the correct learning result is
`no-case`, zero qualifying signals, and `candidateCreated=false`. This is a
bounded execution and Evidence result, not proof of general autonomous learning.

Explicit negative feedback with a concrete note can create a durable Signal/Ticket.
The second zero-cost demo writes feedback through the real DSH Message Feedback
service, consumes the stored snapshot after the final answer, records one Signal
and one open Ticket in the existing evolution ledger, and proves replay is
idempotent without changing the Session.
Positive and note-free negative feedback create no Ticket.
The first ordinary reusable failure records only a Signal; the second matching failure from a different Tianwen Run creates one open Ticket.
The repeated-outcome proof uses two distinct Tianwen Runs bound to two DSH
Sessions. Replay is idempotent, and both Sessions remain unchanged. This is a
zero-cost synthetic contract fixture, not naturally accumulated production
learning evidence.
The governed Skill Candidate proof binds three real DSH `skill` tool uses to two
supporting Runs and one related met Run, then records one Case, Attribution,
Lesson, and inert Candidate. Candidate status is only `recorded`; Attribution,
Lesson, and Candidate content is deterministic synthetic contract data. The
Candidate is not registered for ordinary Runs, shadowed, or promoted, and this is not autonomous production learning.

The paired Skill Evaluation proof creates a frozen protocol before the Candidate Case, then
runs paired isolated normal DSH Agents for the frozen parent B and recorded Candidate C.
It captures the real first DSH model request and visible model-facing tool surface, requires a Skill-neutral normalized match,
and stores a private Evaluation result with separate Outcome/Evidence per arm. This is a
scripted mechanism proof, so its efficacy result is always `INCONCLUSIVE`,
`not-comparable`, and `needs-evidence`: it does not claim C is better. Candidate remains
`recorded` and is not installed, routed, shadowed, promoted, or rejected.
The executable evaluator owns the exact zero-cost scripted adapter on a reserved route and rejects a route collision. It rejects a non-scripted Provider before it creates an evaluation Agent. Its tool digest is a
visible tool-surface fact, not DSH Policy/permission proof; Policy, workspace,
data, and validator independence remain explicitly unbound. Its historic result
is therefore not Shadow-ready; a new real paired B/C must use the frozen
five-task protocol and controlled-evaluation gates.

The later Stage 7 natural task did not manufacture a failure or Candidate. Its
honest result was `met/no-case`: the useful task completed, all 45 projected
Evidence records were complete, and the successful parent Skill use was
recorded. Because no qualifying learning problem occurred, no Ticket, Case,
Lesson, Candidate, Evaluation, Shadow, or Promotion was created from that run.

The controlled lifecycle demo separately proves the product mechanics for a
permanently development-only synthetic defect. It freezes five task types before
Candidate creation, runs ten B/C arms, five blind evaluators, five isolated
Shadow Runs, and three governed pointer checks through ordinary DSH Agents. It
finishes at C@rev4 after Promotion, Rollback, and Restore under the existing
standing authorization. This local scripted fixture proves mechanics and stop
lines only; it is not evidence of natural user improvement or external efficacy.

## Zero-cost demos

Install the locked dependencies, then run:

```console
pnpm install --frozen-lockfile
pnpm demo:research-preview
pnpm demo:explicit-correction
pnpm demo:repeated-outcome
pnpm demo:governed-skill-candidate
pnpm demo:paired-skill-evaluation
pnpm demo:controlled-skill-lifecycle
```

Each demo prints one formatted JSON object. They use no network or external Provider, token
budget, paid model, Docker service, persistent database, or user data. The
research-preview demo reports one complete Evidence record and `no-case`. The
explicit-correction demo reports stored negative feedback, one Signal, one open
Ticket, duplicate replay, and `candidateCreated=false`. The repeated-outcome
demo reports two structured `not-met` outcomes, two Signals, one open Ticket,
duplicate replay, and unchanged Sessions. The governed Candidate demo reports
three frozen Skill manifests and uses, one Case/Attribution/Lesson, and one
`recorded` Candidate. All report matching before/after Session digests. Digest
values may differ between separate runs because Session events contain run-specific
data; equality within a run is the non-interference check. The paired-evaluation
demo adds one frozen pre-Candidate protocol, eight isolated B/C arms, one private
Evaluation result, replay/restart checks, and an explicit `INCONCLUSIVE`
scripted-mechanism outcome. It keeps the root Skill registry and ordinary fresh
Agent unchanged.
The controlled-lifecycle demo reports one privacy-bounded receipt for 25 formal
Sessions, 65 local scripted requests, 45 tool bodies, 0 external Provider
requests, the five-task Evaluation and isolated Shadow passes, and the
B@rev1→C@rev2→B@rev3→C@rev4 pointer sequence. Its terminal replay adds no
activity, a conflicting task package stops with `task-package-mismatch` before
activity, and its dedicated fixture root is empty after cleanup.

## Current limitations

- The repository's recorded Candidate and paired Evaluation are synthetic
  mechanism proofs. No naturally triggered product Candidate has passed a real
  paired B/C evaluation yet.
- The bounded controlled lifecycle has completed once through the official installed
  configured-DeepSeek path under standing authorization. This synthetic operation does not establish
  natural-user improvement, external-user validation, or Provider-account request counts.
- The preview does not offer a production SLA or a finished user interface.
- It does not claim natural-user improvement, external-user validation,
  multi-user generalization, or that one successful run should create learning.
- Future changes can affect only new Runs; the currently running Agent is never
  hot-swapped.

## Repository map

- [`scripts/run-research-preview-demo.ts`](scripts/run-research-preview-demo.ts)
  contains the deterministic no-case demo; [`scripts/run-explicit-correction-demo.ts`](scripts/run-explicit-correction-demo.ts)
  contains the explicit-feedback intake demo; [`scripts/run-repeated-outcome-demo.ts`](scripts/run-repeated-outcome-demo.ts)
  contains the repeated structured Outcome demo; [`scripts/run-governed-skill-candidate-demo.ts`](scripts/run-governed-skill-candidate-demo.ts)
  contains the governed Skill Candidate demo; [`scripts/run-paired-skill-evaluation-demo.ts`](scripts/run-paired-skill-evaluation-demo.ts)
  contains the paired B/C Skill Evaluation demo; [`scripts/run-controlled-skill-lifecycle-demo.ts`](scripts/run-controlled-skill-lifecycle-demo.ts)
  contains the 0-external-Provider controlled full-chain fixture.
- [`packages/tianwen-dsh-compat`](packages/tianwen-dsh-compat) is the public DSH
  compatibility seam.
- [`packages/tianwen-evidence`](packages/tianwen-evidence) performs the read-only
  Evidence projection.
- [`docs/tianwen-architecture-overview-v2.md`](docs/tianwen-architecture-overview-v2.md)
  is the detailed architecture authority.
- [`docs/operations/tianwen-stage7-natural-run-evidence-trial-handoff.md`](docs/operations/tianwen-stage7-natural-run-evidence-trial-handoff.md)
  records the Stage 7 mechanism, failures, and terminal natural-run evidence.
- [`docs/operations/tianwen-v0.1-controlled-skill-lifecycle-handoff.md`](docs/operations/tianwen-v0.1-controlled-skill-lifecycle-handoff.md)
  records the controlled lifecycle receipt, privacy boundary, and evidence limits.
- [`docs/operations/tianwen-v0.1-controlled-real-operation-readiness-handoff.md`](docs/operations/tianwen-v0.1-controlled-real-operation-readiness-handoff.md)
  records the historical installed-ingress readiness boundary.
- [`docs/operations/tianwen-v0.1-controlled-real-activity-22-handoff.md`](docs/operations/tianwen-v0.1-controlled-real-activity-22-handoff.md)
  records the passed official installed configured-DeepSeek lifecycle and its evidence limits.
- [`docs/operations/tianwen-v0.1-one-shot-profile-lifecycle-repair-handoff.md`](docs/operations/tianwen-v0.1-one-shot-profile-lifecycle-repair-handoff.md)
  records the DSH/HMR one-shot shutdown repair and the prospective Activity boundary.
- [`docs/operations/tianwen-v0.1-controlled-real-activity-01-handoff.md`](docs/operations/tianwen-v0.1-controlled-real-activity-01-handoff.md)
  records the consumed activity-01 usage failure and the isolated activity-02 recovery gate.
- [`docs/superpowers/specs/2026-08-22-tianwen-v0.1-closeout-and-controlled-evaluation-design.md`](docs/superpowers/specs/2026-08-22-tianwen-v0.1-closeout-and-controlled-evaluation-design.md)
  freezes the bounded v0.1 evaluation, Shadow, Promotion, and Rollback path.
- [`docs/research`](docs/research) contains bounded research evidence and audit
  records.
- [`tests`](tests) contains the zero-cost contracts and stable gates.

## Development commands

```console
pnpm run typecheck
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
pnpm exec vitest run tests/dsh-probe/evidence.spec.ts tests/dsh-probe/research-preview-demo.spec.ts tests/dsh-probe/learning-intake.spec.ts tests/dsh-probe/learning-intake-runtime.spec.ts tests/dsh-probe/explicit-correction-demo.spec.ts tests/dsh-probe/outcome-intake.spec.ts tests/dsh-probe/outcome-intake-runtime.spec.ts tests/dsh-probe/repeated-outcome-demo.spec.ts tests/dsh-probe/skill-governance.spec.ts tests/dsh-probe/skill-governance-runtime.spec.ts tests/dsh-probe/governed-skill-candidate-demo.spec.ts tests/dsh-probe/skill-evaluation.spec.ts tests/dsh-probe/skill-evaluation-runtime.spec.ts tests/dsh-probe/paired-skill-evaluation-demo.spec.ts
pnpm demo:controlled-skill-lifecycle
uv sync --frozen --dev
uv run ruff check .
uv run pytest
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for supported versions and contribution
boundaries, and [SECURITY.md](SECURITY.md) for private vulnerability reporting.
The complete Chinese mirror is [README.zh-CN.md](README.zh-CN.md).

## License

Tianwen is licensed under [Apache License 2.0](LICENSE).
