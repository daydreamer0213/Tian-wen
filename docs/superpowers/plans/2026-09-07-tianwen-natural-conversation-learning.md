# Natural Conversation Learning Implementation Plan

> Execute inline using the approved design and the existing isolated D: worktree.

Status (2026-09-07): steps 1–4 implemented and covered by focused engineering
checks. Step 5 remains open; no claim of final regression, real DeepSeek
acceptance, release, successful CI or installation is made.

**Goal:** Ordinary natural conversation automatically produces attributable task
observations, result reviews, feedback and evidence-led learning.

**Architecture:** Native DSH hooks delimit task spans and native model subagents
interpret requests and review results. Evolution persists typed transitions in
its existing ledger. Data-only guidance reuses generic Artifact/EvaluationRecord
storage with a workspace snapshot projection, separate from the executable
Skill/plugin Champion. Existing legacy research-summary records keep their exact
meaning; new natural-task sources are explicitly distinguished.

**Tech Stack:** TypeScript, DSH 0.1.1-rc.2, Cordis, Evolution JSONL, Vitest.

## Constraints

- Use `D:/DevData/tianwen-worktrees/tianwen-architecture-overview-v2-merge` on
  `codex/natural-conversation-learning`; generated data stays on D:.
- User approved option 2 and continuous execution; no intermediate approval gate.
- Main Agent/model/tool execution and Session lifecycle remain DSH-owned.
- Task identity includes native Session lifecycle and task boundary.
- Freeze source/criteria/behavior before answer; retain unsuccessful attempts.
- Bind learning evidence and comparison/regression to one frozen complete native
  model configuration; generic future guidance is not proof of cross-model gain.
- No fabricated user feedback, outcomes, source packets or successful promotion.
- One-time scope disclosure; no retrospective analysis under old consent.
- Current automatic guidance evaluation is text-only; tool/external/subjective
  success must not be inferred from a model's text verdict.

## 1. Durable natural task domain

Files: new `packages/tianwen-evolution/src/conversation-learning.ts`; extend
`ledger.ts`, `runtime-binding.ts`, `index.ts`; add
`tests/dsh-migration/conversation-learning.spec.ts`.

- [x] Add failing behavioral checks: two Turns in one Session produce distinct
  tasks; replay is idempotent; same identity with changed source is rejected;
  result requires admitted source and exact response boundary.
- [x] Implement typed task-span, admission, result and feedback records with
  source/model evidence references and a pure state projection.
- [x] Integrate validation, append and replay into the existing ledger.
- [x] Verify focused domain checks; retain authoritative source references and
  bounded derived criteria, not an independent transcript store.

Implemented task identity uses native Session lifecycle, Turn and exact direct
user-message references. Source/whole guidance snapshot precede admission;
objective, criteria and evaluation mode precede the answer. Native model-header
epochs are separately bound before output; absent or mixed configuration is
ineligible for learning. Latest-revision type verification remains in step 5.

## 2. Native request admission and completion review

Files: new `packages/tianwen-runtime-bundle/src/conversation-observer.ts`,
`conversation-judgment.ts`, `conversation-task-material.ts`; extend `runtime.ts`;
add corresponding observer, judgment and task-material suites.

- [x] Prove failing native-harness stories: ordinary text in Turn 1 and Turn 2
  is captured before main requests and independently reviewed after completion;
  internal child Turns and no-user wakes do not recurse.
- [x] Reuse native one-shot subagents with a strict structured result, empty
  work-tool grant (native result capture only) and configured provider/model.
  Persist real judgment Session refs.
- [x] Freeze original source, derive admission from request-only context,
  install task-scoped guidance, then let native execution continue unchanged.
- [x] Review completion from the exact task boundary. Propagate unavailable,
  stopped and inconclusive states without blocking ordinary task execution.
- [x] Add restart and cancellation checks with native persistence.

Original material is recovered from persisted native events and checked against
the frozen request, context and result boundaries. Quotable evidence excludes
judge-derived objective/criteria. Text judgments cannot establish external
effects or subjective satisfaction. Internal one-shot Sessions do not recursively
admit tasks; their real lineage, request and persisted bytes back each proof.

## 3. Natural feedback and learning handoff

Files: new `packages/tianwen-evolution/src/conversation-feedback.ts` and
`conversation-guidance.ts`; new Runtime `conversation-feedback-assessment.ts`
and `conversation-guidance-loop.ts`; extend the existing ledger, runtime binding
and `message-feedback-bridge.ts`. Add feedback, guidance, guidance-loop and
guidance-ledger suites; do not repurpose the legacy executable Skill protocol.

- [x] Check normal correction maps to the prior answer, continuation stays
  separate, requirement changes do not manufacture a prior failure, and quotes
  cannot impersonate feedback.
- [x] Associate native message feedback with the exact task span and retain
  superseding/retraction semantics.
- [x] Select two distinct requests with the same family, problem category,
  parent behavior, current consent and native model configuration, plus an
  independently successful compatible counterexample. Support may be an
  attributable problem or explicit durable preference; supplemental criteria
  are frozen after feedback, never represented as original pre-answer criteria.
- [x] Freeze two synthetic independent cases (adjacent and holdout) before the
  proposal. Reject normalized input copies across source/generated wrappers
  and already-seen context while retaining full material/criteria digests.
- [x] Execute five cases under baseline and candidate: ten native task trials,
  each with its own independent blind judge and immutable proof. Derive the
  decision from the full arm set; never accept a caller's arbitrary pass flag.
- [x] Preserve rejected, inconclusive, unavailable and stopped states; keep
  missing external evaluators outside the text-only activation route.

Full configuration is recovered from persisted source request headers, applied
through the native request waterfall, and checked again in persisted child
headers. Routing-only AgentOptions are insufficient. Acceptance requires five
candidate successes, a reproduced baseline source failure, a successful baseline
counterexample, no inconclusive arm, current support and an unchanged parent.
Recorded failed/stopped studies are retained, not retried to obtain a pass.

## 4. Scope consent, status and future-task behavior

Files: `learning-consent-agent.ts`, observer/domain above and the same-ledger
guidance adapter; existing status tools expose separate natural-task totals.

- [x] Add the natural-analysis scope to one-time v3 enable disclosure; old consent
  does not admit unrelated historical conversations.
- [x] Status distinguishes natural tasks/reviews/feedback from legacy Runs and
  makes an unhandled learning state inspectable.
- [x] Verify a qualified candidate affects only future eligible tasks and that
  retraction/regression restores the preceding verified behavior.

The shared Artifact stores the canonical data-only snapshot; the generic
EvaluationRecord binds its exact derived decision. Activation is a same-ledger
workspace snapshot compare-and-swap, not a mutation of the executable Champion.
Only the admitted family rule is injected. Earlier Turn guidance explicitly
expires even after disablement, rollback or family changes.

Retraction/disablement invalidates future guidance before waiting for a busy
Agent to become idle, including an already running study lane. Regression needs
two distinct later failures under the active version, same family and same
frozen model configuration. Rollback restores the exact parent; disablement can
traverse the active chain to baseline. Another model can use the generic family
method, but no cross-model benefit is inferred from the original experiment.

Restart stops unfinished undecided studies. A previously accepted decision may
complete a missing activation only after rechecking durable native proofs,
support and consent, with no rerun of task trials or judges.

## 5. Review, delivery and real use

- [x] Finish final-revision review of correctness, native ownership, actual
  reachability and complexity alongside the final regression evidence.
- [x] Run affected regression, type/import checks and required delivery gates.
- [ ] Build an immutable candidate on D: and start the isolated normal DSH UI.
- [ ] Freeze and run natural-language real-model acceptance without slash
  commands, packets or instructions to call internal observation tools.
- [ ] Record every outcome, rectify reproduced product defects with focused
  tests, and retain earlier attempts unchanged.
- [ ] Integrate and push under existing authorization; verify CI for the merged
  commit before ordinary installation; update current handoff and release facts.

## Engineering verification checkpoint — 2026-09-07

- Eight new suites passed **95/95** before the final busy-Agent retraction
  adjustment: `conversation-learning`, `conversation-observer`,
  `conversation-task-material`, `conversation-judgment`, `conversation-feedback`,
  `conversation-guidance`, `conversation-guidance-loop`, and
  `conversation-guidance-ledger` (all under `tests/dsh-migration`).
- Subsequent red checks reproduced two cases where a busy Agent delayed
  invalidation of feedback support. Synchronous rollback before the idle wait
  fixed them; the updated guidance-loop suite passed **10/10**. This is not an
  assertion that all eight updated suites were rerun together.
- A full Runtime bundle build and public-import audit passed **before** that
  last adjustment. Latest-adjustment typechecking is still running at this
  checkpoint; final-revision build/import/regression gates are not complete.
- The latest independent correctness review found no new Critical/Important
  issue. That review is not a substitute for real-model or delivery acceptance.
- Runtime `0.1.16` / Desktop `preview.17` manifests and distribution constants
  are aligned. Installer/Desktop known-old migration includes `0.1.15` while
  retaining earlier routes. Version/delivery fixture checks passed 251/251 and
  repository-surface Python checks 26/26; these were not actual installation.
  CI lists the eight natural-conversation suites, but no new remote CI result
  is claimed.

Pending: complete affected/full regression on the final revision; real configured
DeepSeek acceptance in the isolated ordinary browser UI; immutable delivery
candidate and final gates; formal commit/push, resulting CI and ordinary
installation. Keep all of these unchecked until their own evidence exists.

### Final regression preparation, 2026-09-07

- Whole Python: 609 passed / 4 conditional skips; Ruff and compileall passed.
- Full TypeScript attempt 1 retained 1790 passed / 161 failed / 18 skipped.
  Most failures were missing isolated fixture/Corepack environment, alongside
  strict bundle input-list additions, stale v2 notice expectations and test mocks
  missing the new read-only natural-task lookup. These were not hidden or counted
  as passing product behavior.
- Attempt 2 retained 1946 passed / 5 failed / 18 skipped. Four were old loaded
  notice/description fixtures and the missing explicit Python test executable;
  the remaining old product story exposed a real cross-route scope conflict.
- The native first legacy summary Turn is now owned only by the legacy route;
  later natural follow-ups remain observed with bounded native prior context.
  The regression failed first with duplicate source ownership, then with missing
  follow-up context. Both were fixed in production, not by relaxing the verdict.
- Observer/material suites: 19/19. Full legacy correction/native-feedback product
  stories: 16/16, including exact feedback Turn/scope, promotion, transfer and
  rollback. Independent review found no new Critical/Important issue in this fix.
- Fresh types and Runtime bundle rebuild passed after the compatibility repair.
  Full TypeScript attempt 3 passed on the final production tree: 1953 passed /
  18 conditional skips, 111 passed files / 5 skipped files, 387.71 seconds.
  The final packaged Desktop artifact audit and its actual prepared Web Profile
  lifecycle passed (1/1, 7.41 seconds), including owned process/port cleanup.
  Native module identity was checked against the final candidate. No real
  DeepSeek task, integration, CI success or daily 016 installation is claimed yet.
- Evidence and all failed attempts remain under
  `D:/DevData/tianwen-natural-acceptance-20260907/evidence/`.
