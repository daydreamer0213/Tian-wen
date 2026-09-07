# Native-enforceable claim capture

## Evidence and scope

This is the prospective correction authorized by integration Task4 Step6 and the user's standing direction to complete ordinary autonomous learning without routine approval interruptions. It changes an internal output representation, not the product strategy, tools, model, semantic criterion, study trigger or consensus. R8 at7879bb6 is closed and failed as a release cohort; its original records and R1–R7 remain immutable. Daily017 is not touched by implementation.

R8's five unavailable task reviews and first stopped study exposed requirements hidden from the native output schema: complete answer-ID coverage, a claim for every nonblank unit, and an unambiguous blank-unit representation. The actual DSH0.1.1-rc.2 vocabulary supports required object properties, scalar const/enum, arrays with items and exact-one oneOf; it rejects minItems/minLength/tuple/contains. We do not add a validator extension or recreate structured_output.

Alternatives considered:

- Descriptions alone are the smallest patch, but cannot mechanically prevent the observed omissions and missing nonblank claims.
- A fixed property per answer unit uses the existing native tool validator to enforce the missing structure. This is the selected bounded adaptation. The real public-validator feasibility check passed2legal/7illegal shapes plus4unsupported-construct rejections; tests of the actual product-generated schema and real model use are still required.
- A new parser/tool runtime, unsupported schema keywords, host retries, filled-in claims or weakened acceptance would add ownership or hide failures; they are outside this correction.

## Exact current representation

Retain each accepted native capture exactly in its persisted check. No wire-to-record repair or automatic v1-to-v2 conversion.

```ts
interface ClaimAssessment {
  readonly quote: string
  readonly kind: 'source-fact' | 'advice' | 'inference' | 'fiction' | 'general-knowledge' | 'non-factual'
  readonly status: 'supported' | 'unsupported' | 'contradicted' | 'permitted' | 'uncertain'
  readonly sourceIds: readonly string[]
  readonly explanation: string
}
interface ClaimAuditV2 {
  readonly schemaVersion: 'tianwen.claim-audit.v2'
  readonly evidenceDigest: Sha256Digest
  readonly units: Readonly<Record<string, null | {
    readonly firstClaim: ClaimAssessment
    readonly additionalClaims: readonly ClaimAssessment[]
  }>>
}
```

The producer constructs units.properties from the complete unchanged lossless answer projection. Every answer-ID property is required and additionalProperties is false. Entirely whitespace units have schema `{type:'null'}`. Every other unit has a closed object with required firstClaim and additionalClaims; the first is a closed five-field claim, the latter an array with the same claim schema. Nonblank headings and Markdown separators still require an actual assessment. A model must explicitly output each blank field as null; the host never inserts it.

Object keys are unique in the native decoded JSON value; this is not a claim to detect duplicate lexical keys before the upstream JSON parser. Do not introduce a custom JSON parser. Existing native raw Session/proof binding remains unchanged.

Supported descriptions explain exact per-unit quotes, complete coverage, null only for whole whitespace, permitted advice/fiction and the unchanged source-authority rule. They must not prescribe verdicts or include R8 answer-specific phrases. Preserve PURPOSE, COMMON, FOCUS, projection text/IDs/digest, full model configuration and both native isolated reviewers. Tool descriptions clarify the existing output contract, not a new semantic scoring method.

## Consumer and historical boundaries

Keep the exact existing ClaimAudit v1 parser/acceptance behavior for historical quality v4, including both legal blank encodings. Export ClaimAuditV1 and ClaimAuditV2 with ClaimAudit as their union; parseClaimAudit dispatches only those exact versions and returns the original validated value, never a normalized record.

Current quality becomes `tianwen.conversation-quality.v5` to distinguish the native-enforceable capture protocol. Its source and criterion bytes remain exactly equal to current v4; exact v1/v2/v3/v4 objects and hashes remain readable. Old v4 is no longer current study support. Parent-quality mapping is exact: pre-v4 uses unaudited checks, v4 requires two v1 audits, v5 requires two v2 audits. Missing, mixed-version, malformed and mismatched-parent pairs fail. Unavailable/proof-null rules and ordinary non-task behavior remain unchanged.

V2 domain syntax preserves128units/512totalclaims/32KiB audit bounds, exact keys/version/digest, nonempty quote and explanation, known kind/status, unique source IDs and verdict/status compatibility. V2 unit keys must have the host answer-N form, with no extra keys. Evidence-aware validation compares the exact set of projected answer IDs, permits null only when that whole unit is whitespace, requires firstClaim otherwise, and retains every current quote/source-role/digest/size/semantic-status guard. A read-only iteration view may avoid duplicating validation logic, but cannot replace the native captured value in storage or proof comparison.

Native recovery still compares the entire successful structured_output capture to the entire saved check, binds the original request/material/projection/full model identity and verifies each check before any activation. Reuse the existing exact-value recovery; do not add a second result store or transform proof data. Historical v1 checks can still be verified against their original material without new model calls. Retiring old-current guidance through the existing quality boundary is not regrading it.

## Verification, version and limits

First prove the supported fixed schema rejects the R8 structural patterns through actual public DSH validation. Product tests then use the actual schema supplied to native one-shot calls, retaining failed tool attempts and allowing the existing native loop to correct its own arguments within that same one-shot; no host retry or regrade is introduced. Test legal blank/nonblank controls, missing/extra units, empty nonblank assessments, bad exact quotes, assistant-only support, mismatched projections/models/proofs and real persisted restart paths. Preserve literal historical contracts and native invalid-but-genuine capture tests; where a new schema now rejects an old malformed fixture earlier, keep a schema-valid consumer-invalid counterexample to exercise restart rejection.

Candidate becomes Runtime0.1.20 / Desktop0.1.0-preview.21, DSH0.1.1-rc.2 unchanged. Retain all010–019 supported predecessor identities and reject unknown020-successor versions. After independent code review and fresh full gates, freeze a new isolated R9 root and use actual ordinary in-app browser requests/model answers once each. Keep native same-turn schema self-correction distinct from controller retries. Native provenance and blind semantic comparison remain separate gates.

This correction addresses capture availability only. R8 U7's source-authority misclassification and admission latency are not declared solved. R9 must expose actual remaining disagreements, invalid outputs, study stops, activation/inactivity and later use. No number of code tests proves gradual benefit; no study absence counts as a passed branch. Only an explicit evidence-led release decision plus exact-main CI permits the standing-authorized backed-up Daily update.
