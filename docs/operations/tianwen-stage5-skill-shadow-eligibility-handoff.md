# Tianwen Stage 5 Governed Skill Shadow Eligibility Handoff

## Scope

DSH `0.1.0-rc.7` remains the only product Agent Runtime. Stage 5 implements only the eligibility slice: one pure Evolution reducer and one deterministic
eligibility rehearsal that consumes the existing safe Stage 4 summary.

The rehearsal creates no Stage 5 Agent, Session, Run, ledger event, root Skill
registration, traffic assignment, Active Pointer, Candidate mutation, or
legacy state change. Its current result is `no-eligible-shadow`.

## What the current evidence says

The composed zero-cost demo runs the existing Stage 4 scripted mechanism first,
then reduces only its safe Evaluation facts. That Evaluation is
`INCONCLUSIVE`, `not-comparable`, `scripted-mechanism`, and stale because
Policy authorization is unobservable. The ordered refusal is therefore:

- `evaluation-not-pass`;
- `candidate-not-better`;
- `evidence-not-independent-objective`;
- `evaluation-decision-mismatch`;
- `evaluation-stale`.

No Candidate is registered for ordinary traffic. Ordinary routed Runs and
qualified natural Runs remain zero. Scripted evidence is not efficacy evidence.

Natural Shadow routing, five qualified natural Runs, Active Pointer, Promotion, and rollback remain unimplemented and unproven. This Stage 5 slice neither
activates C nor claims that C is better, Shadow-ready, stable, promoted, or
rollback-tested.

## Boundary and cost audit

Artifact, Dynamic Cordis, and Champion paths are not used for activation, routing, or state change. The composed Stage 4 proof keeps only its existing
read-only assertions that those legacy surfaces are unchanged.

Python Alpha, RepoTaskRuntime, and AlphaRuntime are not used. No Provider,
paid model, Docker, Alpha trial, runtime-profile, user data, or external
database is invoked. The audited result is 0 Provider requests, 0 paid tokens, 0 CNY, 0 Docker, and 0 user data.

The existing eight-event public ledger allowlist is unchanged. Stage 5 creates
no Shadow event or second store; reducer output contains only an Evaluation ID,
closed decision/reason enums, and the fixed freshness reason.

## Reproduction

```console
pnpm --filter @tianwen/runtime... build
pnpm run typecheck
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
pnpm exec vitest run tests/dsh-probe/skill-shadow.spec.ts tests/dsh-probe/skill-shadow-eligibility-demo.spec.ts
pnpm demo:paired-skill-evaluation
pnpm demo:shadow-eligibility
```

The two demo summaries expose safe counts, identifiers, booleans, and closed
enums only. They do not publish Skill bodies, prompts, user/tool content,
filesystem paths, URLs, credentials, or personal data.
