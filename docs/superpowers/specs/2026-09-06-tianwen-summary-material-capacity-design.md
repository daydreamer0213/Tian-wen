# Research-summary evaluator material capacity

Status: bounded repair under the user's standing authorization, not a strategy change.

## Proven problem and scope

On reviewed source `3b2caac` / main `1c1e1f5`, the frozen genuine J task
completed with a correct accepted summary after one native length-error recovery.
Accurate UI feedback produced Candidate `628c677f` without controller-authored
candidate text. Its first controlled baseline completed with a 3,946-byte summary,
but `JSON.stringify({ taskId, submission })` was 4,411 bytes. The product accepts
summary text up to 4,096 UTF-8 bytes; the evaluator material contract incorrectly
allows only 4,096 bytes for text PLUS ID arrays and JSON framing/escaping.
`controlledEvaluatorMaterialText` therefore refuses a legitimate full submission.
The attempt is incomplete/non-promoted, not a failed content verdict or rejection.

The local record is
`D:/DevData/tianwen-real-user-retest-20260905/evidence/semantic-final-gates-3b2caac/J-evaluation-original-baseline-native.json`.
The frozen protocol is `815ca767`; its original capacity and all retained evidence
remain immutable. No model rerun, new feedback version, or regrading will repair it.

## Design decision

Keep the existing native execution and exact canonical JSON projection. Configure
future v3 protocols with sufficient bounded transport capacity. Reuse the existing
`maxUtf8Bytes` contract field; do not invent another transport, truncate material,
or relax accepted-summary normalization or content scoring.

Alternatives rejected: lowering the summary limit would shrink normal capability;
raising an old frozen limit would reinterpret an actual trial; removing size checks
would discard a useful safety boundary. A future-only capacity choice is sufficient.

### Capacity

- Summary text remains at most 4,096 UTF-8 bytes; input stays 16 KiB / 32 rows.
- New v3 five paired tasks and holdout submission material use 32,768 bytes.
- New v3 holdout review material also uses 32,768 bytes. Its input is the existing
  fixed, small unseen packet, not the arbitrary original source packet.
- JSON escaping can expand an accepted summary to at most 6 * 4,096 bytes; up to
  32 distinct ASCII IDs of 64 characters, JSON keys and the fixed task ID still
  fit below 32,768. The existing fixed holdout packet also fits alongside this.
  Verify this bound with a legal control-character/long-ID example, not only a
  Chinese prose example. The actual J-sized projection must also be covered.
- Runtime's existing material validation ceiling is 65,536; do not change it.
  No aggregate transport rewrite, compression or new dependencies are required.

### Compatibility

Add one internal v3 resolver choice `materialMaxUtf8Bytes?: 4_096 | 32_768`.
Omission selects 32,768; explicit `undefined`, other numbers, strings and unknown
fields are invalid. Selecting 4,096 recreates the old paired/holdout material
contracts AND old 8,192-byte holdout-review contract exactly. Selecting 32,768
selects the new three capacities. This choice is not a user-facing setting.

The orchestrator derives the choice from retained contract digests: all five
paired task material digests, the holdout material digest and the holdout review
material digest must match exactly one known capacity set. Unknown/mixed sets are
rejected before new ledger writes or model calls; do not default old records to
the new set. Use shared construction to avoid duplicating literal contracts.
Existing exact frozen-protocol equality remains the final compatibility gate.
Preserve independent retained 60,000/300,000 execution-window selection.
Scope-only/v2 entry points and promote/rollback/restore builders remain byte-for-byte
unchanged in their outputs. Schema, rubric, parent Skill and tool schemas do not change.

## Verification and non-goals

Test-first: accepted near-limit multilingual and maximally escaped submissions
reach evaluator material with the new contracts, while the old contract still
refuses oversized framing. Retained old/new capacity and execution-window pairs
rebuild identical protocols; unknown/mixed sets cannot freeze or execute.
Use existing native harnesses for the producer-to-consumer regression. Scripted
regressions are mechanism evidence only, never real-model acceptance.

Task and final independent reviews, full regression, fresh artifact identities,
exact-main CI and daily data checks remain required before delivery. Daily013 is
unchanged. Existing3b2caac desktop/runtime artifacts remain historical candidates.

Deferred separately: the submission tool does not announce its text byte limit,
and stopped-arm reasons currently become a generic learning error. These observed
usability/diagnostic issues are not a reason to expand this capacity repair or
change a frozen experiment. Do not promise that this fix proves learning efficacy.
