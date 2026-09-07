# Shared claim review integration

This is the authorized product integration following the [claim-to-source design](2026-09-07-tianwen-claim-evidence-review-design.md). R3 at `388ae4fe936f20dc96815515f466e118c6aecea5` passed its finite prospective gate with 24 first arms / 48 native checks and twelve correct decisions in each method. It permits integration, not a semantic-superiority or natural-acceptance claim. R1 and R2 remain failed and immutable. Source at integration start is `5f5244f4006ca46171112e942c60dd95b3f2c504`, same branch, daily017 unchanged.

## Decision

Both ordinary task review and new method-study review use the existing tested `runConversationClaimReview`. Preserve its exact prompts, source projection, status mapping and the existing native lifecycle. The old `runConversationReview` remains a legacy-format test/diagnostic adapter, not a second production route. No third judge, model change, trigger relaxation or answer rewrite. The observer continues to queue review without holding the ordinary task open.

Quality v4 identifies an audit-bearing review method; its criterion text is byte-identical to v3. Preserve exact historical v1/v2/v3 objects and their hashes. Current-quality matching excludes historical/mixed evidence; there is no historical regrading or conversion to v4. An incompatible old method is retired through existing logic.

## Record boundary

Introduce one native-free domain module for the existing typed ClaimAudit and its syntax/status validation. Keep evidence projection and source-aware validation in the runtime adapter. No general evaluator framework or new dependency.

Legacy review-check parsing stays strict and rejects audit. A separate audited parser requires two typed audits. The two record fields that lack parent quality (`task-reviewed` and `arm-recorded`) need a narrowly scoped stored-tuple parser; it accepts a wholly legacy or wholly audited pair, never a mixed pair, and retains the raw audited value. Mandatory state validation then selects the format using the actual parent task admission or study quality. Exact v1/v2/v3/absent parents reject audited records; v4 completed task reviews with native proof and all study arms require audited pairs. Unavailable, cancelled or non-task reviews keep the existing inconclusive/proof-null representation.

Consensus remains two isolated summaries: equal verdict yields that verdict; disagreement yields inconclusive. It may structurally revalidate either typed pair without dropping audit, but it does not make a quality/version decision. Evidence-aware checks still belong to the runtime, not a domain parser that lacks original material.

## Native recovery

A genuine saved model capture is not sufficient proof that its audit was valid. Add a small native helper next to the existing capture verifier to recover the exact initial one-shot request, verify Session/proof/request identity and successful native capture. The native one-shot descriptor does not contain persona; requestDigest must use the unchanged host observer persona and the actual persisted prompt. Use the actual initial direct-user append from the child, not text searched out of a later assistant message or failed tool attempt.

Claim-specific recovery lives in the claim adapter, avoiding a circular import. Require the exact purpose/focus host instruction and exact `{original, claimEvidence}` wrapper, recompute projection from original material, compare the complete ordered projection, and validate the complete retained audit and raw evidence quotes. For each study arm also compare its recorded materialDigest and outputDigest to the recovered original task and answer, and every native model header to the study modelConfigDigest. Both checks must be valid before an accepted decision can activate after restart. No new model calls, normalization, retries or repaired records in recovery. Missing or changed evidence leaves the candidate inactive with the existing unavailable warning.

## Verification and delivery

TDD covers literal historical records, audit round trips and malformed/mixed data, both actual native runtime callers, nonblocking review, valid restart and authentic-but-invalid audit restart rejection. Add these regression files to the existing natural-conversation CI group. Full build/typecheck/import/TypeScript/Python gates and one final independent whole-branch review cover the integrated code.

Normal version identities become Runtime0.1.18 and Desktop0.1.0-preview.19; DSH stays0.1.1-rc.2. Add017 as a supported predecessor without dropping earlier declared predecessors. Existing installer, embedded-resource and package contracts remain authoritative.

Freeze a new isolated ordinary-browser protocol and exact build before first model call. Use real configured DeepSeek, natural requests and feedback, no slash command, prescribed packet, prewritten assistant answer, internal-reflection request or ledger mutation. Verify another ordinary user message can start while older review is pending. Allow any naturally opened study to reach its first terminal outcome; no forced acceptance or repeats until success. Keep independent answer assessment separate from system verdicts and report false positives, disagreements and untriggered branches honestly. This finite cohort is not proof of long-term improvement.

After the exact integrated code, frozen natural use and exact-main CI pass their engineering gates, use the normal managed/Web/Desktop update paths with fresh user-data/shortcut/config inventory and recoverable backups. Never delete the worktree targeted by the existing daily shortcut. No external package/tag release. A semantic or operational release-blocking finding is resolved prospectively, not edited out of the frozen evidence.
