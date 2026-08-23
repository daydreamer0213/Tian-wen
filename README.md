# Tianwen

[中文说明](README.zh-CN.md)

Tianwen is an auditable learning control plane for long-running agents.

**Research preview; Stage 7 complete.** DSH 0.1.0-rc.7 is the only product
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
The configured DeepSeek controlled lifecycle has not run. Its evidence remains
`naturalUserEvidence=not-claimed` and `externalUserEvidence=not-claimed`.

## Installed ingress readiness

Installed ingress readiness was the pre-operation publication conclusion: the official installer publishes the CLI ingress, one-shot runner, and static DSH Profile patch. This is zero-real-Provider installer, preflight, and transport evidence; it is not a successful configured DeepSeek lifecycle. Task 9B.0 later narrowed that claim: archive/publication readiness is complete, while the official launcher still needs the correction recorded below. The configured DeepSeek real controlled lifecycle has not run.

Repair `7042a7d84712d499671b464251d0f09ec898fcf6` is merged as main `67ce961487f93734230c06c1624f44573703691f`. Exact-main CI run `32639440639`, event `push`, attempt 1: Python and TypeScript succeeded; installer-windows failed. The recursive Runtime Bundle build succeeded, and the single Windows three-spec command finished with 1 failed / 103 passed. The installer and controlled command specs passed. The only failure was the Runtime Bundle patch's full-text comparison: Windows checkout text used CRLF while the test template used LF. This representation mismatch is not evidence of a Runtime, Agent, lifecycle, or installer product semantic defect.

That run will not be rerun or dispatched. Task 9B remains blocked until Python, TypeScript, and installer-windows all succeed on a new exact-main CI push run attempt 1; for this controlled lifecycle, real Provider activity remains 0.

The installed controlled-lifecycle one-shot runner does not import or register `ScriptedAdapter`; the scripted adapter used by this fixture is supplied only by tests. Evidence remains `configured-provider-capable` + `scripted-fixture` + `development-only` + `synthetic-defect`, with `naturalUserEvidence=not-claimed` and `externalUserEvidence=not-claimed`.

The formal installed command shape is:

```console
tianwen controlled-lifecycle --manifest ABS --data-dir ABS --json
```

The [controlled real operation readiness handoff](docs/operations/tianwen-v0.1-controlled-real-operation-readiness-handoff.md) records the verified boundary and the evidence that is still missing. Its historical pre-R0 boundary was: reviewed repair exact SHA → new automatic exact-main push run attempt 1 with Python, TypeScript, and installer-windows all successful → exactly one formal real Provider lifecycle. That historical wording is superseded by the current sequence below. Only the old exact-main CI checkpoint was completed; the real Provider lifecycle portion did not run, and activity-01 remains unconsumed.

That historical CI boundary is now complete: newline repair `402b23d4252910ad367ba2070528b99067a041ca` was merged as main `95077be9265818cbcec443a89a71e22363ae1cde`, and automatic push run `32641914572`, attempt 1, passed Python, TypeScript, and installer-windows. Task 9B.0 completed one official installer run with 18/18 publication. The only official `tianwen.CMD model status --json` invocation exited 0 with 0 stderr bytes and 0 stdout bytes. It was not rerun. The preserved product root and its evidence remain intact; formal activity-01 remains unconsumed, and real Provider activity remains 0.

R0.1 `f7a89783097c83404576cb62b77949186e9fbca4` is feature implementation only: the CLI guard now compares canonical real file identity, as proved by a Windows pnpm-like junction focused contract. Post-repair official `.CMD` status has not been run. R0.2 `1b323c498a6fa177975fdd852738d9738995c604` freezes the controlled overlay at DeepSeek normal/0 and disables only session-title-llm; session-title, llm-retry, and settings remain enabled, while the ordinary Profile remains normal/2.

These changes have not been merged, there is no matching new exact-main CI, and no new formal product root has been installed or checked with model status. The preserved Task 9B.0 root will not be reused. The only current sequence is independent exact feature review → controlled main integration → automatic exact-main push attempt 1 with Python, TypeScript, and installer-windows all successful → one official install and model status on a new formal product root plus packet freeze → exactly one real lifecycle.

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
- The bounded controlled lifecycle is implemented and covered by a scripted
  full-chain fixture under standing authorization, but it has not run against
  the configured DeepSeek Provider.
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
  records the installed ingress readiness boundary and the remaining real-Provider gate.
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
