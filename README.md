# Tianwen

[中文说明](README.zh-CN.md)

Tianwen is an auditable learning control plane for long-running agents.

**Research preview.** DSH 0.1.0-rc.7 is the only product Agent Runtime. Tianwen
runs in the background as a non-interfering control plane: it reads execution
facts after a normal DSH run and does not replace or hot-swap the running Agent.
This preview proves normal Agent execution, read-only Evidence projection, and
zero qualifying signal → `no-case` with `candidateCreated=false`. It also proves
one non-blocking explicit-feedback intake path after the user result is complete.
It also proves repeated structured Outcome intake across distinct Tianwen Runs
and one governed Skill Candidate intake. Candidate/Shadow/Promotion is not complete.

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
| **Tianwen** | Owns the cross-run governance boundary: Goal Graph, Evidence provenance, learning attribution, and future-run version governance. The current preview exercises read-only Evidence projection, a conservative no-case decision, explicit-feedback Signal/Ticket intake, and repeated structured Outcome intake. |
| **Alpha** | Supplies experimental and evaluation assets. It is not a second product Runtime. |

DSH Message Feedback is an attribution input, not a Lesson by itself. A DSH Job
is process-local work, not a durable cross-run Learning Ticket. The detailed
boundary is maintained in the
[architecture overview](docs/tianwen-architecture-overview-v2.md).

## What this preview proves

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
Candidate is not registered, evaluated, shadowed, or promoted, and this is not autonomous production learning.

## Zero-cost demos

Install the locked dependencies, then run:

```console
pnpm install --frozen-lockfile
pnpm demo:research-preview
pnpm demo:explicit-correction
pnpm demo:repeated-outcome
pnpm demo:governed-skill-candidate
```

Each demo prints one formatted JSON object. They use no network, Provider, token
budget, paid model, Docker service, persistent database, or user data. The
research-preview demo reports one complete Evidence record and `no-case`. The
explicit-correction demo reports stored negative feedback, one Signal, one open
Ticket, duplicate replay, and `candidateCreated=false`. The repeated-outcome
demo reports two structured `not-met` outcomes, two Signals, one open Ticket,
duplicate replay, and unchanged Sessions. The governed Candidate demo reports
three frozen Skill manifests and uses, one Case/Attribution/Lesson, and one
`recorded` Candidate. All report matching
before/after Session digests. Digest values may differ between separate runs
because Session events contain run-specific data; equality within a run is the
non-interference check.

## Current limitations

- Evaluation, Shadow, Promotion, and production-autonomous generation are not complete.
- The preview does not offer a production SLA or a finished user interface.
- It does not claim that one successful run creates learning or that future
  changes can enter the currently running Agent.
- The known first-profile bootstrap diagnostic is documented separately and is
  not presented as a passing release gate.

## Repository map

- [`scripts/run-research-preview-demo.ts`](scripts/run-research-preview-demo.ts)
  contains the deterministic no-case demo; [`scripts/run-explicit-correction-demo.ts`](scripts/run-explicit-correction-demo.ts)
  contains the explicit-feedback intake demo; [`scripts/run-repeated-outcome-demo.ts`](scripts/run-repeated-outcome-demo.ts)
  contains the repeated structured Outcome demo; [`scripts/run-governed-skill-candidate-demo.ts`](scripts/run-governed-skill-candidate-demo.ts)
  contains the governed Skill Candidate demo.
- [`packages/tianwen-dsh-compat`](packages/tianwen-dsh-compat) is the public DSH
  compatibility seam.
- [`packages/tianwen-evidence`](packages/tianwen-evidence) performs the read-only
  Evidence projection.
- [`docs/tianwen-architecture-overview-v2.md`](docs/tianwen-architecture-overview-v2.md)
  is the detailed architecture authority.
- [`docs/research`](docs/research) contains bounded research evidence and audit
  records.
- [`tests`](tests) contains the zero-cost contracts and stable gates.

## Development commands

```console
pnpm run typecheck
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
pnpm exec vitest run tests/dsh-probe/evidence.spec.ts tests/dsh-probe/research-preview-demo.spec.ts tests/dsh-probe/learning-intake.spec.ts tests/dsh-probe/learning-intake-runtime.spec.ts tests/dsh-probe/explicit-correction-demo.spec.ts tests/dsh-probe/outcome-intake.spec.ts tests/dsh-probe/outcome-intake-runtime.spec.ts tests/dsh-probe/repeated-outcome-demo.spec.ts tests/dsh-probe/skill-governance.spec.ts tests/dsh-probe/skill-governance-runtime.spec.ts tests/dsh-probe/governed-skill-candidate-demo.spec.ts
uv sync --frozen --dev
uv run ruff check .
uv run pytest
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for supported versions and contribution
boundaries, and [SECURITY.md](SECURITY.md) for private vulnerability reporting.
The complete Chinese mirror is [README.zh-CN.md](README.zh-CN.md).

## License

Tianwen is licensed under [Apache License 2.0](LICENSE).
