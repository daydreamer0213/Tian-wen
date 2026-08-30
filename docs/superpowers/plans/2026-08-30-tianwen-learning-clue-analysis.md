# Tianwen learning clue analysis implementation plan

**Goal:** Let a user explicitly open one durable ordinary DSH analysis Session
for a visible improvement clue, without exposing private feedback through the
browser RPC or promoting the clue into governed learning state.

**Architecture:** Reuse the existing Evolution ledger as the private feedback
source, the existing Goal-first state root for a strict Ticket-to-Session
binding, and the existing DSH Session UI as the result surface. Add no second
analysis result store, retry loop, usage budget, Case, or Skill transition.

## Task 1: Private Ticket input projection

- Modify `packages/tianwen-evolution/src/learning-intake.ts` only if a narrow
  private projection type is needed.
- Modify `packages/tianwen-evolution/src/ledger.ts` and
  `packages/tianwen-evolution/src/runtime-binding.ts`.
- Export only the type required by Runtime Bundle.
- Add focused tests to prove an explicit-feedback Ticket returns its latest
  original note and scope, while missing or outcome-only Tickets return no
  private input. Public events and current sanitized status remain unchanged.

## Task 2: Strict analysis binding

- Add `packages/tianwen-runtime-bundle/src/learning-clue-analysis.ts`.
- Persist only schema version, Ticket ID, Session ID, initial user message ID,
  and creation time under `stateRoot/learning-clue-analyses`.
- Add focused tests for exclusive creation, stable reread, invalid identity,
  and corrupt-file rejection.
- Do not persist the note or model answer here.

## Task 3: Host action and Session execution

- Modify `packages/tianwen-runtime-bundle/src/long-goal-host.ts` and the focused
  host tests.
- Extend the safe clue projection with an optional analysis phase derived from
  the bound Session's initial Turn, plus its start/finish time and Session ID.
- Add exact `analyze-learning-clue { ticketId }` RPC handling.
- Rebuild/revalidate the safe clue source, read the private note locally,
  create the ordinary DSH Session in the source workspace/preset, bind it,
  submit one untrusted-evidence analysis message, and schedule normal idle
  flush.
- Existing bindings return their Session without another follow-up.

## Task 4: Existing dialog interaction

- Modify `learn-loop-client.ts`, `client.tsx`, and their focused tests.
- Add localized privacy copy, **Analyze once**, and **Open analysis Session**.
- Open the returned Session through the existing DSH list/open path.
- Never render Ticket ID, Session ID, feedback note, fingerprint, Signal ID,
  workspace, or Evidence.

## Task 5: Integration and review

- Run the focused Evolution, binding, host, RPC client, and compiled client
  tests.
- Run the Runtime Bundle TypeScript build and production client bundle.
- Run `git diff --check` and an independent correctness/privacy review.
- Update architecture and handoff facts without claiming a Skill or learning
  improvement.

## Task 6: One real installed-product proof

- Use a fresh isolated product/data root on `D:\DevData`.
- Install through the official product path.
- Create one real visible feedback clue, click **Analyze once**, and use the
  configured real model.
- Confirm the Session is persisted, produces a visible result or visible
  failure, and the same clue reopens the same Session without a second
  automatic request.
- Keep task result, Session/runtime evidence, learning facts, and external
  Provider facts separate. Do not infer billing from Session events.
- Do not rerun to select a better answer.
