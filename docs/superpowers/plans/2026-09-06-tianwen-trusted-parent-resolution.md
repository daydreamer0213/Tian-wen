# Trusted Parent Resolution Implementation Plan

> Execute after the source-fidelity Task 1–3 implementation and task reviews.
> Use one implementer and one independent task review; controller owns deployment.

**Goal:** Permit a genuinely authorized learned parent at native controlled
preflight without removing root drift, scope, provider or transition protections.

**Design:** [Trusted parent resolution](../specs/2026-09-06-tianwen-trusted-parent-resolution-design.md).

## Global Constraints

- Only `packages/tianwen-runtime/src/skill-evaluation.ts` and covering existing
  Runtime test suites are production/test implementation targets. No new ledger
  state, dependency, service, global Skill mutation or reverse bundle dependency.
- Use real native registry and ledger APIs in the new regression. Synthetic test
  output is mechanism evidence only; do not write acceptance history or call real
  models. Preserve the old procurement Candidate's terminal rejection.
- Keep exact first-generation root checks; permit learned parent B only with
  exact frozen identity and same-scope verified ancestry from packaged root A.
  Pending/recovered attempts are not verified ancestor promotions.
- Keep parent provenance separate from operation pointer state: during native
  Activation the pointer may already be C; rollback starts C and restore starts B.
  Existing compare-and-set and previous/target revision checks stay authoritative.
- No daily changes, isolated Profile edits, package publication or deployment by
  the worker. You are not alone; preserve all other edits and commit only owned
  implementation/tests. Controller owns design, plan and operation documents.

## Task 1: Native trusted-parent preflight and drift checks

**Owned files:**
- `packages/tianwen-runtime/src/skill-evaluation.ts`
- `tests/dsh-probe/controlled-skill-evaluation-runtime.spec.ts`
- `tests/dsh-probe/controlled-skill-shadow-runtime.spec.ts`
- `tests/dsh-probe/controlled-skill-activation-runtime.spec.ts`
- The existing temporary `tests/dsh-probe/second-generation-parent-diagnostic.spec.ts`
  may be retired once a public-preflight regression supersedes it; retain its
  diagnostic report under `.superpowers/diagnostics/second-generation-parent`.

- [x] RED: establish verified A -> B through actual ledger APIs, freeze a B-based
  next Candidate C, and fail at the actual controlled root preflight on unchanged
  packaged A. Keep the diagnostic's proof boundary distinct; no mock pointer as
  the only proof of the authorized chain.
- [x] Inspect actual recovered-activation pointer/revision behavior in a focused
  fixture before implementing ancestry handling. Recovered != verified promotion.
- [x] Add one small file-local check using existing readers. Reuse it in initial
  Evaluation/Shadow/Activation root checks and relevant later drift rechecks.
  Return/retain only the anchor needed to detect root drift; keep exact scoped
  Skill and existing phase-specific pointer checks. No generic lineage framework.
- [x] GREEN: first-generation unchanged; verified B -> C accepted through the
  actual evaluation/holdout/activation seams; own B/C rollback/restore and supported
  pending-activation recovery work without duplicate completed model attempts.
- [x] Mutate foreign scope, wrong payload/provider, unverified ancestor, stale
  pointer revision and changed root. Each must refuse before unauthorized model
  execution. Old A/B Shadow cannot act on C.
- [x] Run the three owned Runtime suites and covering activation/domain tests,
  root typecheck/build, public-API guard and diff check. Self-review and commit
  only owned files; report exact RED/GREEN and retained limitations for review.

## Controller closure

Task review closed at `c6d5f23` after `747b815`: actual persisted Activation
establishes A-to-B-to-C plus rollback/restore/replay; Evaluation and Shadow execute
their public native seams with precise ancestry-reader fixtures. Foreign-before-
local Manifest selection was fixed in one reviewed round. Final six-suite gate
passed 191/191. Earlier 82/82 artifact evidence belongs to `747b815`, not the fix;
final delivery must rebuild. All of this is mechanism proof, not real-model efficacy.

- [ ] Independently review the task; rerun the full branch gates at final source
  SHA, then update genuine acceptance/delivery records without claiming efficacy
  from fixtures. New protocol real-model branches remain unobserved unless actual
  warranted new source feedback produces a new Candidate.
- [ ] Preserve daily user data and existing real Sessions. Integrate/deploy only
  through the already-authorized reviewed local delivery workflow and exact CI.
