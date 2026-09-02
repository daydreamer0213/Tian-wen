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
