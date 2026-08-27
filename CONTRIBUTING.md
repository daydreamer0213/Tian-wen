# Contributing to Tianwen

Thank you for helping improve the Tianwen research preview. Contributions must
preserve its single-Runtime architecture, auditable evidence, and zero-paid
default verification.

## Supported development environment

- Node.js `>=22.19.0 <23`
- pnpm `11.20.0`
- Python `>=3.11 <3.15`
- uv with the checked-in `uv.lock`
- DSH packages pinned to `0.1.1-rc.2` by `pnpm-lock.yaml`

Do not update toolchains or dependency versions as part of an unrelated change.
Keep downloaded caches and generated development data off the system drive when
a practical project-local or secondary-drive location is available.

## Set up the repository

Install the exact JavaScript and Python dependency sets:

```console
pnpm install --frozen-lockfile
uv sync --frozen --dev
```

Do not add credentials, private data, paid-live fixtures, or generated runtime
state to the repository.

## Verify a change

Run the checks that cover your change. The stable public baseline is:

```console
pnpm run typecheck
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
pnpm exec vitest run tests/dsh-probe/evidence.spec.ts tests/dsh-probe/research-preview-demo.spec.ts tests/dsh-probe/outcome-intake.spec.ts tests/dsh-probe/outcome-intake-runtime.spec.ts tests/dsh-probe/repeated-outcome-demo.spec.ts
uv run ruff check .
uv run pytest
```

The deterministic public demo is also safe to run locally:

```console
pnpm demo:research-preview
pnpm demo:repeated-outcome
```

It must remain network-free and use no Provider, paid model, token budget,
Docker service, persistent database, or user data. The intermittently hanging
legacy `tests/dsh-migration/runtime-profile.spec.ts` diagnostic is not part of
the stable gate; do not report it as passing or add retries and enlarged
timeouts around it.

## Preserve the architecture boundary

- DSH is the only product Agent Runtime. Reuse its public APIs; private DSH
  imports and a second Runtime are not accepted.
- Tianwen owns cross-run governance semantics, but the current preview proves
  normal execution, read-only Evidence projection, a no-case result, explicit
  feedback intake, and the narrow Run binding/Outcome/Signal/Ticket behavior.
- Do not describe Candidate generation, Shadow, or Promotion as implemented.
- DSH Message Feedback is an attribution input, not a Lesson by itself.
- A DSH Job is process-local work, not a durable Learning Ticket.
- Alpha remains an experimental and evaluation asset, not a product Runtime.

Read the [architecture overview](docs/tianwen-architecture-overview-v2.md)
before changing ownership or lifecycle boundaries.

## Keep changes reviewable

Use focused tests, keep generated files and unrelated cleanup out of the change,
and update English and Chinese public claims together when a proven capability
changes. Never add a Provider credential or real user content to a test. For a
security issue, follow [SECURITY.md](SECURITY.md) instead of opening a detailed
public issue.

By contributing, you agree that your contribution is licensed under the
[Apache License 2.0](LICENSE).
