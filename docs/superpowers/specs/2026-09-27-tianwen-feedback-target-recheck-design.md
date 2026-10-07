# Explicit natural-feedback target recheck

E062 exposed a narrow failure: an admission model received exactly one completed prior summary task and the direct user's explicit reference to that answer, recognized a future preference, but returned `relatedTaskId: null`. The host correctly refused to treat that feedback as attributed. A valid prior task merely existing is insufficient to bind unrelated or ambiguous feedback.

## Decision

For a **feedback-only conversation** whose first native admission recognizes a non-null feedback object but leaves the target null, run one optional, separate native admission recheck if completed prior tasks are available. The recheck receives the same direct request, bounded surface context, quality contract and prior task IDs/objectives/answer IDs, plus the first decision as a candidate to preserve. Its instruction asks whether the direct user's own words unambiguously target one particular earlier answer; a sole available task is not itself evidence. It must preserve the original feedback classification and quote, and return a full admission decision through the existing closed schema.

Promote the recheck **only** when it keeps `kind: conversation`, returns the same feedback kind, category and exact user quote, and supplies an allowed non-null prior task ID. Store the entire recheck decision and its own native proof together; never splice a new ID into the first model's proven decision. The existing host quote and ID checks still apply. If the recheck is unavailable, returns null, changes the feedback identity, or fails validation, retain the original null decision and do not assess feedback. Do not retry another model or backfill E062.

This is a narrow second opinion, not deterministic attribution. The first decision and recheck can disagree, so a new controlled real-model task must verify both a clear reference and an ambiguous/unrelated preference before the candidate is considered effective. The downstream feedback assessment must still independently decide whether the feedback is a usable preference or correction; no method research or activation is authorized by the link alone.

## Alternatives considered

- Prompt-only change to the first admission is cheaper but cannot protect the observed case when the model still returns null, and offers no separate native proof of a recovered link.
- Automatically choosing the only prior task would link unrelated global preferences and quoted third-party text, so it is excluded.
- Adding reply-to metadata would give a stronger target when the client supplies it, but does not address ordinary free-text follow-ups such as E062 and needs a broader client/persistence change.

## Verification boundary

Scripted tests cover clear target recovery, ambiguous/unrelated null, recheck failure or identity drift, no recheck without recognized feedback, and native proof recovery. Run the relevant conversation tests, typecheck and runtime bundle build. A future isolated product run must then freeze new prompts and package bytes, inspect the real model's recheck, feedback assessment and any later study separately, and keep main/Daily NO-GO until all prior semantic gates are met.
