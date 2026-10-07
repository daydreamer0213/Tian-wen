# Feedback scope capture: correct literal evidence before recording

Current ordinary Web journey at clean fd683bf4 completed four original UI inputs, 23 actual requests, normal stop and zero-request cold mount. Its first scope child recorded a quote with an inserted ellipsis as successful structured output; the original later direct-text check then rejected it and left feedback unavailable. The original classification, scope decisions and failure remain unchanged.

Implement the smallest product correction in `conversation-feedback-assessment.ts`: use the existing native `validateCapture` callback to reject a scope decision whose `evidenceQuote` is not a contiguous literal fragment of the frozen direct feedback, before the SDK records structured output. Return a precise field diagnostic to the same original child. Preserve the later check, original scope meanings, proof reconstruction, cancellation and consent rules. Do not rewrite or complete quotes, create new reviewers, force `continuing`, relax semantic acceptance, or re-assess old feedback.

Worker owns the production file and `tests/dsh-migration/conversation-feedback.spec.ts`; root owns documentation and actual validation. Test first: a malformed first capture must fail within its original child and a later literal correction must retain the original proof and valid assessment. Valid `unclear` scope must remain valid and ineligible for continuing adoption. Run the original feedback suite and necessary build/import checks. Independent review before committing. A new prospective model batch, if needed, uses new frozen material; it never replays U0–U3 or the failed assessment.

- [x] Observe a meaningful regression failure before production edits.
- [x] Implement only the early literal quote check using the existing callback.
- [x] Pass regression and original feedback tests; preserve unclear/one-off semantics.
- [x] Run production build and private-import check, inspect final diff independently.
- [x] Record current result, limitation and finite next action; commit/push the feature branch only. Daily/main original R9 NO-GO is unchanged.
