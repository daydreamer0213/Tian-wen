# Task-family admission verification after E084 and E086

Status: implemented behind an opt-in `familyVerification` switch; prospective model validation remains pending.

## Evidence and goal

The current admission instruction already distinguishes a short summary that condenses supplied facts (`summarization`) from drafting an original report or communication (`writing`). E084 nevertheless labeled a source-grounded summary `writing`; E085 labeled another new summary `summarization`; E086 extracted the summary objective and criteria correctly but labeled the new task `other`. E086's answer and two reviews were sound, yet its pre-frozen same-family gate correctly stopped before feedback. These observations show variability at the family field, not proof that any old admission or review can be retroactively changed.

The next goal is to make family decisions reliable enough to route future guidance and determine source eligibility without rewriting E084–E086 or weakening their stop conditions. A task that cannot obtain a reliable family must remain out of same-family study support. The design must also preserve legitimate original writing tasks such as a requested title and three bullets.

## Options considered

1. **Add another explanation or examples to the main admission prompt.** Cheap, but the current prompt already states the relevant distinction and E086 still returned `other`. More prompt text alone does not create independent evidence.
2. **Rewrite family using words such as “摘要” or “写”.** Fast, but it confuses a quoted source with the user's requested transformation and can turn an original report into a summary. It would make study eligibility depend on brittle wording.
3. **Verify every self-contained text task's family with a focused independent check.** Recommended. Leave the initial native judgment immutable. A second check sees the direct request and supplied source, but not the first family. It chooses the requested transformation and cites an exact span of the direct request. If the two agree, the family is confirmed. If they disagree, a third independent focused check breaks the tie; only a matching pair of valid results selects the final family. If all three differ, a proof is invalid, or the request is ambiguous, mark family unresolved and exclude the task from family-specific guidance and same-family study support. The regular answer and its quality review remain separate.

## Implementation boundary

Mark prospective tasks with `tianwen.family-verification.v1` when the opt-in switch is enabled; retain exact v11 answer-quality replay. Record the initial family, its native proof, the focused check result and proof, any tie-break result and proof, and the resolved family without changing the initial judgment. The resolved family must be chosen before the main answer so the correct guidance route is used. Do not run family rechecks for conversation-only feedback, local-file or external tasks. Do not copy a recheck's revised objective or criteria into the admission; focused checks may return only family and quote. An unresolved or generic `other` family keeps the direct task answer possible but cannot select family-specific guidance or enter same-family study support. Study sources, counterexample, proposal clues and regression evidence must share the admission policy marker, so historical and prospective classifications do not form a mixed evidence group. Existing learning selector gates continue to require valid feedback or a supported failure; the new check cannot invent feedback, success controls or a method.

There is a cost trade-off: one extra model judgment for every eligible text task, plus a third only on disagreement. Keep the scope explicit and measure the latency in a prospective isolated run. If cost is unacceptable, a separately proved trigger can later narrow the check; do not silently use keyword gating in this repair.

## Verification and stopping

First add red/green tests for: an initial `other` or `writing` corrected by two independently supported `summarization` votes; initial and second opinions agreeing on a genuine summary or writing control; three-way disagreement or malformed evidence excluding family-specific guidance and same-family support; and no recheck for ineligible modes or feedback-only turns. Validate exact quote binding to the direct request, separate native proofs, consent changes between calls, v11 replay, guidance routing and all relevant version guards. Then run focused suites and package type checks.

Freeze a new D:-resident isolated profile, package, model, novel summary and writing-control materials, and first-anomaly stop before any model call. Do not rerun E084/E086 or relabel them. Only a new accurate answer plus proper admission and two native quality reviews may reach a newly written feedback turn. Even that result would establish one bounded source and feedback observation, not a reliable research, activation, future-effect or semantic-safety gate. main/Daily remains NO-GO.
