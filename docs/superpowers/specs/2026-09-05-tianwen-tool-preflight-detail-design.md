# Safe tool-preflight substage diagnosis

The real Candidate's preserved evaluation repeatedly stops at the public
`tool-surface-mismatch` boundary before any arm starts. Both frozen tool digests
and both public service Context paths match in no-model native harnesses; the
parallelism and Context-difference hypotheses have not reproduced. The existing
catch folds construction, loading, shape and digest failures into one code.

Add an optional fixed tool-preflight detail to the existing error class, keeping
its primary code and all gates unchanged. Carry only a known literal detail into
the existing safe diagnostic warning. Do not log raw exception fields or change
ledger schemas. Split only the already failing tool preflight; no generalized
error framework and no guessed functional repair.

The allowed details are `research-tool-construction`, `research-tool-presence`,
`root-schema-read`, `global-product-tool`, `native-skill-scope`,
`native-skill-load`, `native-skill-missing`, `native-skill-dispose`,
`visible-schema-shape`, `task-schema-digest`, `aggregate-schema-digest`.
Temporary-scope disposal remains guaranteed. An unrecognized error is classified
by the fixed boundary where it occurred; no raw text crosses the diagnostic seam.
An arbitrary or forged detail is omitted by the host classifier. No detail on
non-tool primary codes is rendered.

Tests must first reproduce loss of detail through the public error/service
boundary, verify fixed detail at the existing tool construction/loading/validation
branches and verify cleanup after a failure. Include hostile extra properties and
logger failure. Keep the original primary-code assertions, no-model preflight
guards and frozen schema checks. Independent review precedes isolated deployment.
This instrumentation supplies the next engineering decision; it does not assert
that the product failure has been fixed.
