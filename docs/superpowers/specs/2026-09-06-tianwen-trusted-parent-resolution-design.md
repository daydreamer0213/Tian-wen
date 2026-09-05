# Trusted parent resolution across learned versions

## Problem and evidence

The ordinary summary admission installs the active learned payload only into the
Agent's native Skill scope. The packaged root remains A. A later ordinary Run can
correctly freeze promoted B, and a new Candidate C then names B as its parent.
The controlled executor currently reads an unscoped root and compares A directly
to B before Evaluation, Shadow and Activation. A native no-model admission probe
demonstrated this mismatch; mapping the false predicate to the preflight error is
static evidence. No genuine two-promotion history has yet been observed.

Focused tracing and existing domain tests show that the ordinary executor already
reuses the scope pointer and permits a new Shadow to promote B to C after the
previous promotion is verified. Once-only initialization, same-scope pending
transition exclusion, compare-and-set revision checks and Shadow-local rollback
are valid protections, not defects. The one-lifecycle demo runner is not the
ordinary multi-generation entry point and is not expanded here.

## Selected bounded repair

Independent architecture review selected one file-local trusted-parent check in
`packages/tianwen-runtime/src/skill-evaluation.ts`, reused by the relevant root
preflight and drift rechecks. No new service, resolver registry, lineage store,
ledger event, activation mode or dependency is needed.

- Preserve the first-generation exact-root/frozen-parent fast path and its
  provider identity checks.
- For a learned parent, reconstruct the exact immutable Manifest payload and
  verify version, digest, provider, name/source and bound Run scope. A stored
  payload or pointer alone is not authorization.
- Use the existing same-scope transition previous/target pointers and verified
  native receipts to establish a path from the current packaged root A to B.
  Pending or recovered attempts do not authorize an unverified ancestor version.
  Do not trust caller-supplied Candidate text as its own parent proof.
- Capture the validated root identity at preflight. Later root drift checks
  compare against that anchor, not against learned parent B. Agent-scoped checks
  still require the exact baseline B, Candidate C or operation target.
- Keep trusted-parent provenance separate from operation-specific pointer state.
  Activation commits the pointer to C before its native post-check; rollback
  begins at C, and restore begins at B. Rechecking a universal `pointer == B`
  condition after those steps would introduce another defect. Keep the existing
  previous/target pointer and revision checks authoritative for each operation.

Use current public APIs: native `skills.get`, Run Manifest/Binding readers,
scope pointer reader, transition listing and transition receipt reader. Runtime
must not depend backwards on bundle admission, whose payload selection is not a
complete authorization proof.

## Alternatives and tradeoffs

Removing the root check or accepting any stored Manifest would hide root drift
and lose the authorization path. Calling admission selection would couple
Runtime to its bundle while still lacking that proof. Installing promoted B into
the global root would change old and unrelated Agent scopes and violate the
future-Run boundary. A local check using existing facts is the narrow option.

This does not automatically accept a newly installed, different packaged root.
If no exact trusted relation to that root can be proved, retain the refusal;
cross-release rebasing is not part of this repair.

## Falsifiable verification and boundary

Before repair, use real ledger APIs to construct verified A -> B, then a genuine
mechanism fixture for B -> C. Unlike the diagnostic's mocked pointer, this fixture
must exercise the public controlled preflight. It should fail for the identified
root mismatch before any formal request. This remains mechanism evidence, not
real-model learning efficacy.

After repair, cover Evaluation, Shadow and Activation against that fixture, plus
the unchanged first generation. Mutations of scope, payload/provider, receipt
state, pointer revision and root bytes must fail before unauthorized execution.
Verify B/C promote, rollback and restore on its own Shadow; the old A/B Shadow
cannot operate C. Cover an interrupted activation with its own pending transition
without duplicating completed work. If a failed activation has a `recovered`
receipt, test its actual revision behavior before choosing how it participates
in ancestry traversal; never treat recovery as a verified promotion.

Only the resolver/preflight seam and covering tests change. Keep source-fidelity
quality gates, model settings, immutable records, old terminal Candidate results,
ordinary consent and daily installation unchanged. Complete this after the
source-fidelity implementation tasks so there are no concurrent file owners.
