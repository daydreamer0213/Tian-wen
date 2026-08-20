# Tianwen Stage 6 Governed Skill Promotion Readiness Handoff

## Scope

DSH `0.1.0-rc.7` remains the only product Agent Runtime. Stage 6 implements only the pure Promotion readiness refusal slice: one Evolution reducer and one deterministic demo that consumes the existing Stage 5 safe summary.

The actual result is `no-promotion-readiness` because the existing Stage 5
receipt is `no-eligible-shadow`. Stage 6 opens no natural Shadow and writes no
pointer, Promotion, rollback, ledger event, Candidate registration, or route.

## What the current evidence says

The zero-cost composed demo reuses the existing scripted Stage 4 mechanism and
Stage 5 safe eligibility receipt once, then runs the pure readiness reducer.
The resulting Promotion refusal has only `shadow-not-eligible`.

Natural Shadow, five qualified natural Runs, Active Pointer, exact human
Promotion approval, Promotion, and product rollback remain unimplemented and
unproven. The current scripted evidence is mechanism evidence, not efficacy or
stability evidence.

Candidate traffic, pointers, Promotions, and rollbacks remain zero. The 60 CNY
development budget is not a Promotion ApprovalReceipt and does not authorize a
cross-Run transition.

## Boundary and cost audit

Artifact, Dynamic Cordis, and global Champion paths are not used for
activation, routing, or state change. Python Alpha, RepoTaskRuntime, and
AlphaRuntime are not used.

No Provider, paid model, Docker, Alpha trial, runtime-profile, user data, or
external database is invoked. The audited result is 0 Provider requests, 0 paid
tokens, 0 CNY, 0 Docker, and 0 user data.

The existing eight-event public ledger allowlist is unchanged. Stage 6 creates
no Promotion event or second store. Its reducer output contains only an
Evaluation ID and closed decision/reason enums; the composed demo exposes only
safe counts and false/zero governance facts.

## Reproduction

```console
pnpm --filter @tianwen/runtime... build
pnpm run typecheck
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
pnpm exec vitest run tests/dsh-probe/skill-promotion.spec.ts tests/dsh-probe/skill-promotion-readiness-demo.spec.ts
pnpm demo:shadow-eligibility
pnpm demo:promotion-readiness
```

The demo summaries do not publish Candidate or Skill bodies, prompts,
user/feedback/tool/model content, filesystem paths, URLs, Provider
configuration, credentials, or personal data.
