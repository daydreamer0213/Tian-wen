# Tianwen Stage 4 Paired Skill Evaluation Handoff

## Scope and provenance

Stage 4 implements one narrow governance path on top of the existing DSH
`0.1.0-rc.7` Runtime. It is not a second Agent Runtime, Skill loader, registry,
store, scheduler, or promotion path.

- implementation base: `63b780a99ee4e85c5af01da990ca7c313e6c9505`;
- canonical design: `docs/superpowers/specs/2026-08-21-tianwen-paired-skill-evaluation-design.md`;
- canonical plan: `docs/superpowers/plans/2026-08-21-tianwen-paired-skill-evaluation.md`;
- Task 1: `8420a72 feat: freeze Skill evaluation protocols`;
- Task 2: `588369a feat: record paired Skill evaluations`;
- Task 3: `293eb84 feat: expose paired DSH evaluation seams`;
- Task 4: `0b7368b feat: run isolated paired Skill evaluations`;
- Task 5: `2a39447 test: prove paired Skill evaluation`.

Task 6's final SHA and push equality are deliberately recorded only in the
execution report, so this document does not require a follow-up attestation
commit.

## What is proved

The zero-cost demo starts with the existing normal DSH path: three governed
Runs produce two `not-met` Outcomes and one `met` counterexample, one Ticket,
a frozen four-category protocol before the Case, one Case/Attribution/Lesson,
and one inert `recorded` Candidate. It then runs B/C through eight new isolated
DSH Agents/Sessions, freezing the actual visible model-facing tool surface for
each prepared Agent.

The runtime registers B or C only in the prepared Agent scope, sends the exact
public `/skill-name` input, observes the actual first `llm/stream` request,
and records private plan/result facts in the existing evolution ledger. The
pair requires exact call-config, selected-Skill injection, and normalized
first-request equality. Outcome/Evidence is separate for every arm. Agent
handles are disposed in `finally`; the root registry and a fresh ordinary Agent
retain the parent Skill without Candidate residue.

The executable path is intentionally **zero-cost scripted only**: the service
itself owns the exact `ScriptedAdapter` on its reserved
`tianwen-stage4-scripted` route, releases it in `finally`, and rejects a route
collision, non-scripted Provider, non-zero CNY allowance, or unsupported call
configuration before any evaluation Agent, Turn, or request exists.
The captured schema digest is the visible DSH tool surface, not a Policy or
permission proof. rc.7 exposes no authoritative Policy/authorization fact here,
and workspace, data, and validator references are explicitly unbound; all make
the aggregate result `INCONCLUSIVE`. The pure eligibility reducer and pure
freshness assessor are available for a later design, but this Stage 4 runtime
cannot produce independent objective evidence or a Shadow-ready result.

`pnpm demo:paired-skill-evaluation` prints one
`tianwen.paired-skill-evaluation-demo.v1` JSON object with these actual facts:

- 3 governed Runs, 8 evaluation arms, 11 Sessions;
- 25 scripted model requests and 14 tool calls;
- 1 protocol, 1 Candidate, 1 Evaluation plan, and 1 result;
- `protocolProvenance=pre-candidate`;
- `evidenceClass=scripted-mechanism`, `verdict=INCONCLUSIVE`,
  `comparison=not-comparable`, and `decision=needs-evidence`;
- exact protocol/Candidate/plan/result replay and ledger restart agree;
- public events contain none of the 12 internal learning/evaluation event
  discriminators or synthetic Skill text.

The result reports only safe counts, enums, and booleans. Raw Session messages,
Skill content, input text, and internal ledger events remain private. Request
and manifest digests are persisted internally; the public demo intentionally
does not publish raw fixture material.

## Limits and deferrals

This is a scripted mechanism proof, not independent efficacy Evidence. It does
not establish that C is better than B, and it does not install, route, shadow,
promote, reject, roll back, or otherwise activate the Candidate. Candidate
status remains `recorded`.

Shadow, Promotion, Active Pointer, Reject, Rollback, live Provider proof,
production SLA/UI, and autonomous generation remain deferred. Alpha, old
Artifact paths, and Dynamic Cordis execution remain outside the product path.
Any paid proof needs a new, separate preflight/reservation/trusted-receipt/tally
design; it must not repurpose the scripted mechanism as a safe live-provider
path.

## Reproduction and gates

```console
pnpm --filter @tianwen/runtime... build
pnpm run typecheck
pnpm run check:dsh-install
pnpm run check:no-private-dsh-imports
pnpm exec vitest run tests/dsh-probe/skill-evaluation.spec.ts tests/dsh-probe/skill-evaluation-runtime.spec.ts tests/dsh-probe/paired-skill-evaluation-demo.spec.ts
pnpm demo:paired-skill-evaluation
```

The Stage 4 demo uses only the deterministic DSH scripted adapter and synthetic
fixture data. Its audited cost is exactly zero for network, Provider requests,
paid tokens, CNY, Docker, persistent external databases, and user data. The
fixture is deleted after each run. The final Task 6 gate ran 15 Vitest files
with 109 tests, all five demos, and the Python public contract with 8 tests.
