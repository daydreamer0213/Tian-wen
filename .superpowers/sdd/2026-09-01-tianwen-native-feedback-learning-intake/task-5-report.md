# Stage 2 Task 5 implementation report

## Status

DONE

Baseline: `dc1f8673cdf42329280acc50ce90e93c84135aad`

Commit: `feat: manage learning consent in the main chat` (this report's commit)

## Implemented

- Added one strict `tianwen_learning_consent` tool to root/main Agents only. It
  accepts exactly one required `action` (`enable`, `disable`, or `status`), uses
  the executing `exec.agent`, rejects missing and subagent identities, and has
  no caller-supplied Session field.
- Kept the interaction entirely in the main chat: there is no UI button, child
  conversation, or child-Agent approval path.
- Added append-only Evolution notice intent and delivered acknowledgement
  facts, unique by consent policy version. The durable intent binds the exact
  main Session, deterministic source Message ID, and delivery ID; replay is
  idempotent, conflict is rejected, and reload preserves the lifecycle.
- The public notice status exposes only policy, main Session, source Message,
  state, and timestamps. It excludes the internal delivery ID, private note,
  referenced reply, raw scope, and filesystem path.
- A first negative feedback revision with a nonempty note is durably ingested
  before notice work. Public Session lineage resolves its exact root/main
  parent; missing or unprovable lineage fails closed after intake without
  sending anything to a child.
- The notice contains exactly the five planned facts and runs as a guarded DSH
  Turn with all model tools disabled. It is acknowledged only after the exact
  deterministic source Message has a durable visible assistant reply and a
  completed or max-token Turn.
- Recovery runs on startup, main-Agent creation, later feedback observation,
  and main-tool status. Pending work stays bound to the original main Session;
  a completed persisted Turn is acknowledged without another model request.
- Consent remains profile-scoped and monotonic. Exact state replay does not
  increment revision; state changes increment it by exactly one. Enable affects
  only later feedback revisions, while disable prevents later analysis consent
  references without deleting intake or audit history.
- Service unload removes its scoped tool registrations, waits admitted notice
  work, and a reload reinstalls exactly one registration.

## TDD evidence

Initial and focused RED evidence:

- The tool specification first failed to import because
  `learning-consent-agent.ts` did not exist.
- Notice tests then failed in three places because observation, durable intent,
  and recovery did not exist.
- Bridge tests failed in three places because no intent was recorded, orphan
  lineage did not remain pending, and disable did not prompt on a later
  correction.
- Removing status-triggered recovery made the offline scenario fail pending;
  restoring the minimal trigger made it delivered.
- The unload test failed because the main-Agent tool remained registered;
  service-owned disposers fixed it.
- Final self-review added a public-projection test. RED was 2 failed and 51
  passed because `deliveryId` was still returned; GREEN was 53 passed after the
  query projection removed it.

Final focused GREEN: 4 files and 85 tests passed.

## Fresh verification

- Task 5 focused matrix: 4 files, 85 tests passed.
- Expanded Task 4 compatibility matrix: 6 files, 132 tests passed.
- Task 1-4 learning plus legacy caller regression: 6 files, 98 tests passed.
- Stage 1 main-chat and settlement critical regression: 8 files, 181 tests
  passed.
- Forced Evolution and Runtime Bundle TypeScript project builds passed.
- Complete workspace typecheck passed.
- Public DSH import scan passed with zero private-import violations.
- Authorized-file static scan found no TODO/TBD/FIXME, console output, unsafe
  double cast, private DSH import, or private storage import.
- `git diff --check` passed before staging.

## Residual risk and stage boundary

If DSH has durably admitted the deterministic notice Message but the associated
Turn has not yet reached a completed visible assistant reply, Tianwen leaves the
intent pending and does not enqueue a duplicate. A later native Turn completion
plus any recovery trigger can acknowledge it; the fail-closed choice preserves
the exactly-once delivery boundary.

This report claims Task 5 only. Independent review and later stage tasks remain;
Stage 2 completion is not claimed here.

## Independent-review fix round 1: historical policy and profile admission

Candidate baseline: `606257600ab6310a236524f194fdeb83d386bb87`

Fix commit: this commit (`fix: bind consent notice to historical policy`)

### Root causes and corrections

- Reconciliation compared an old DSH revision only with the latest profile
  consent. Evolution now exposes a read-only, strict-before timestamp query;
  the bridge uses that historical fact for unseen revisions. The sanitized
  exact message status durably retains only `analysisConsentRevision`, so an
  already-ingested revision remains authoritative after later enable, disable,
  failure recovery, or reload. Ledger validation accepts only an exact recorded
  revision whose fact was enabled; it no longer requires that revision to still
  be the latest profile state.
- Main/root classification formerly checked only `origin`. One shared predicate
  now defines a root as `parentSession === undefined && origin !== 'subagent'`.
  Tool installation, execution, Agent-created recovery, persisted recovery, and
  lineage resolution all use it. Any parent reference continues traversal;
  parentless subagents, missing parents, cycles, identity mismatch, and a
  parentSession-only child all fail closed.
- Notice recovery was single-flight, but notice admission was not. One
  profile-scoped serialized lane now covers status read, exact-root resolution,
  durable intent admission, and recovery in call-entry order. Unload stops new
  admissions and waits already-admitted work. An append error is accepted only
  after rereading the same exact durable binding; a different binding remains a
  conflict and fails closed.

### TDD evidence

- RED before production edits: 3 files ran with 7 expected failures and 61
  passing tests. The failures independently proved the missing historical
  query and projection, rejection of an old enabled consent after disable,
  parentSession-only tool exposure, I/O-ordered cross-lineage intent choice,
  and unload completing before admission settled. The unhandled conflicting
  intent rejection was the old cross-Session race being reproduced.
- GREEN after the minimal fixes: the three directly affected files passed 70
  tests. The exact append-reread and parentless-orphan cases complete the review
  matrix. Removing the exact-reread acceptance branch made its focused test fail
  1/1 with the forced post-append error; restoring it passed 1/1, while the same
  test continues to reject a different main-Session binding.

### Fresh verification

- Task 5 focused matrix: 4 files, 91 tests passed.
- Broad Task 1-5 learning, Task 4 compatibility, and controlled lifecycle
  regression union: 15 files, 289 tests passed.
- Stage 1 main-chat and settlement critical regression: 8 files, 181 tests
  passed.
- Forced Evolution, Runtime, and Runtime Bundle TypeScript builds passed;
  complete workspace typecheck passed.
- Public DSH import scan reported zero private-import violations. Authorized
  scope, added-line static scan, and `git diff --check` passed.
- Public status and notice assertions continue to exclude feedback notes, raw
  paths, internal delivery ids, and tool access during the five-fact notice.

This section records fix round 1 only. Independent re-review remains the next
gate; it does not claim Task 5 or Stage 2 completion.
