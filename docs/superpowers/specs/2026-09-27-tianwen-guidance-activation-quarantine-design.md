# Tianwen method activation quarantine

## Problem and decision

R9 activated a method after two model reviewers accepted candidate answers containing independently confirmed factual errors. E068 missed an overgeneralized ordinary answer; the subsequent claim-mode and scope-preservation diagnostics each falsely classified normal advice. An `accepted` research decision therefore cannot currently authorize a new method to change later tasks. The product has two automatic activation paths: immediately after a fresh decision and after restart if an accepted study lacks activation. Its ledger accepts a direct activation append when the accepted decision and current version match; those checks do not establish semantic safety.

Three options were considered: another model prompt or vote has already failed on new evidence; a per-study schema flag would change frozen study identity and leave historical pending decisions to recover; a **product-level activation quarantine** keeps research durable while stopping every new activation in this runtime. Choose the third as a reversible containment measure. It does not claim semantic safety or complete autonomous learning.

## Behavior and boundaries

The Tianwen runtime bundle always mounts its evolution ledger and conversation guidance loop with `guidanceActivationQuarantine: true`. The flag is internal to the bundle, not a user-facing profile setting. The loop records the accepted decision but skips the immediate `guidance-activated` append, does not queue accepted-unactivated studies for activation on restart, and checks the flag again in the recovery method. The ledger independently rejects any **new** `guidance-activated` append while quarantined, including a direct caller that bypasses the loop. The rejection happens after immutable duplicate detection, so an already recorded activation can still be read or retried as the same record.

Ledger replay continues to reconstruct historical activated snapshots without rewriting old events. Existing active methods are not silently rolled back; this feature only blocks new activation. The product runtime keeps ordinary answers, feedback attribution, study creation, trial results and `accepted` / `rejected` / `inconclusive` decisions unchanged. An accepted but unactivated study remains explicit in the study projection and the parent guidance remains active for future tasks. No UI button or manual clearance is invented in this phase. Direct test/research harnesses that mount the lower-level runtime without quarantine preserve their existing controlled behavior; this does not make them release-approved.

The quarantine is not a substitute for the original main/Daily release gates. It intentionally prevents product evidence for activation and future-task improvement until an independently governed clearance path is designed and verified. That path must bind a human-reviewed decision to one study and candidate, then recheck source support and current version before activation; it is out of scope here.

## Verification

Use failing tests first for a quarantined ledger rejecting direct activation, the product bundle wiring both guards, and an accepted study remaining inactive after a fresh run and restart. Verify that a historical active study still replays under quarantine, no new activation record appears, the parent guidance version remains selected, and there are no extra model calls on restart. Run the relevant integration suites and eight-package type check. This is engineering evidence only; any later real-model acceptance requires a new frozen run and cannot reuse E068–E071 outcomes.
