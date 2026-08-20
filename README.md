# Tianwen

[中文说明](README.zh-CN.md)

Tianwen is an auditable learning control plane for long-running agents.

**Research preview.** DSH 0.1.0-rc.7 is the only product Agent Runtime. Tianwen
runs in the background as a non-interfering control plane: it reads execution
facts after a normal DSH run and does not replace or hot-swap the running Agent.
This preview proves normal Agent execution, read-only Evidence projection, and
zero qualifying signal → `no-case` with `candidateCreated=false`.
Candidate/Shadow/Promotion is not complete.

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
| **Tianwen** | Owns the cross-run governance boundary: Goal Graph, Evidence provenance, learning attribution, and future-run version governance. The current preview exercises only read-only Evidence projection and a conservative no-case decision. |
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

## Three-minute, zero-cost demo

Install the locked dependencies, then run:

```console
pnpm install --frozen-lockfile
pnpm demo:research-preview
```

The command prints one formatted JSON object. It uses no network, Provider,
token budget, paid model, Docker service, persistent database, or user data.
Expect one completed execution, one complete Evidence record, a `no-case`
learning decision, `candidateCreated=false`, and matching before/after session
digests. Digest values may differ between separate runs because session events
contain run-specific data; equality within a run is the non-interference check.

## Current limitations

- Candidate generation, Shadow evaluation, and Promotion are not complete.
- The preview does not offer a production SLA or a finished user interface.
- It does not claim that one successful run creates learning or that future
  changes can enter the currently running Agent.
- The known first-profile bootstrap diagnostic is documented separately and is
  not presented as a passing release gate.

## Repository map

- [`scripts/run-research-preview-demo.ts`](scripts/run-research-preview-demo.ts)
  contains the deterministic demo.
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
pnpm exec vitest run tests/dsh-probe/evidence.spec.ts tests/dsh-probe/research-preview-demo.spec.ts
uv sync --frozen --dev
uv run ruff check .
uv run pytest
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for supported versions and contribution
boundaries, and [SECURITY.md](SECURITY.md) for private vulnerability reporting.
The complete Chinese mirror is [README.zh-CN.md](README.zh-CN.md).

## License

Tianwen is licensed under [Apache License 2.0](LICENSE).
