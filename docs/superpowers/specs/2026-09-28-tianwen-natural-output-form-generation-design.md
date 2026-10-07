# Natural output-form generation: proposed versioned repair

## Evidence and target

Both the v9 霁川 and v10 皓潭 consented natural tasks asked for one short paragraph and received a heading, list and addendum instead. v10 changed the evaluator only: it now correctly reports the 皓潭 response as `not-met / instruction-following` in two independent native checks. The task admission also correctly preserved the single-paragraph criterion before the answer. The remaining defect is in main-answer generation. The evidence does not show a factual error or a need for a deterministic post-answer rewrite.

The repair target is prospective consented ordinary text tasks. The main assistant should obey the direct user's requested answer form when producing the first answer: one paragraph if the deliverable is expressly one paragraph; a list when requested or allowed; no invented one-paragraph restriction for merely short text. Facts, uncertainty, advice boundaries and permissions remain governed by the user's request. A prompt can improve this behavior but cannot guarantee it, so native outcome evidence remains mandatory.

## Implementation boundary

Use the existing native `agent/pre-step` admission path. For a successfully admitted direct-user `task` with `evaluationMode:text`, add one turn-scoped, neutral reminder to check the *original direct user request* for its output form before finalizing the answer. Explicitly keep headings, lists and addenda only when compatible with that request. Do not parse `写一段` with a host-side keyword rule, synthesize a new format from model-extracted criteria, rewrite completed answers, add retries or alter the two-review verdict. Do not inject this into a feedback-only conversation, external/local-file task, or a task without current consent. This is a generator behavior change, not an evaluated learned method.

Version the new task quality/behavior contract as v11 so new evidence cannot silently mix with v10 natural tasks or v10 learning studies. Preserve exact v10 contract and review instruction for historical replay; only new admissions receive v11. Check all version guards in evolution, review and guidance before implementation. The reminder must be subordinate to the direct request and existing permissions, and should not reveal the internal evaluator to the user.

## Verification and stop

First add a failing focused test for one turn-scoped reminder on an admitted text task, absence for non-eligible turns, and v10 historical contract replay. Implement the smallest version additions and run the observer, review, evolution and guidance suites plus all package type checks. Then freeze a new isolated Web Profile, package identity, novel fictional source facts, model, requests and first-anomaly stop before any model call. The first natural task should ask for a single paragraph. If it fails, stop without feedback or substituting another prompt. Only if it and its two native checks pass, try a distinct allowed-list task and a format-free short-text task to check overconstraint. This prospective run would establish one bounded product behavior observation, not general reliability or learning improvement.

Keep main/Daily NO-GO. Feedback attribution, research, activation, later-task effect and independent semantic safety remain separate acceptance questions.
