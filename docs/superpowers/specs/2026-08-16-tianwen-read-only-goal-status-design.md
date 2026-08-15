# Tianwen Read-only Goal Status Design

**Date:** 2026-08-16

**Status:** Approved by the architecture controller under the user's standing
authorization to continue with the recommended minimal design.

## 1. Outcome

Add one small installed command:

```powershell
tianwen status --goal GOAL_ID --data-dir D:\DevData\tianwen
```

It reads the durable Goal, Session, Evidence and Champion state already proven
in Migration Phase 2. It does not resume an Agent, request a model, append an
event, repair a pointer, promote a Candidate, or start a UI.

This is the first user control projection, not the final control plane.

## 2. Why this is the next slice

Phase 2 proved that Tianwen can start through one formal DSH Profile and finish
one Goal/Tool/Session/Evidence path. The next useful product capability is to
show that durable state back to the user without changing it.

This directly serves the long-term collaboration requirement:

- show the current Goal and phase;
- show bounded progress;
- show compact evidence rather than raw traces;
- show the current Champion;
- let the user decide whether to wait or intervene later.

Building a desktop panel now would add packaging and UI work before the read
contract is stable. Building a new service or event bus would duplicate DSH and
Tianwen state that already exists.

## 3. Chosen seam

The command is a standard Node `bin` shipped by the existing
`@tianwen/runtime-bundle` tarball.

The Runtime Bundle gains:

- `dist/cli.js`, exposed as the `tianwen` bin;
- `dist/status.js` plus `./status`, so a later task panel can reuse the same
  projection without parsing terminal text;
- only the exact public DSH package-root dependencies needed for inspection.

The implementation stays in the existing package. It does not create a new
workspace package, CLI framework, daemon, database, RPC layer, or DSH fork.

### Rejected alternatives

1. **A custom DSH CLI command/plugin** would require loading more of the DSH
   application and would couple a read-only query to a live Runtime context.
2. **A separate Tianwen CLI package** would create a second deployable artifact
   before one command justifies it.
3. **A desktop/web panel** would still need this read contract and is therefore
   deferred.

## 4. Command contract

First-version grammar:

```text
tianwen status --goal GOAL_ID --data-dir ABSOLUTE_PATH [--json]
```

`--goal` and `--data-dir` are required. Requiring the data root avoids silently
reading the wrong project or creating state in the current directory.

The command derives:

```text
sessions root  = DATA_DIR/dsh-home/sessions
evolution root = DATA_DIR/state/evolution
```

Default output is short human-readable text. `--json` prints one deterministic
UTF-8 JSON object followed by LF. The reusable projection schema is
`tianwen.goal-status.v1`.

Stable fields:

```text
schemaVersion
goal: id, revision, objective, phase, maxGoalRounds, roundsStarted,
      createdAt, updatedAt, optional blockedReason
session: id, eventCount
evidence: total and per-status counts, ordered toolName/status rows
champion: artifactId/revision or null
runtime: activation="not-loaded", modelRequests=0, readOnly=true
```

The command deliberately does not print raw prompts, user messages, assistant
messages, file contents, tool arguments, tool results, environment values,
credentials, or absolute workspace paths.

`activation` is reported as `not-loaded`, not `disarmed`: durable Session data
does not reveal another process's local activation state. The stronger true
claim is that this command never loads or activates an Agent.

## 5. Authority reads

### 5.1 Session and Goal

Use only public package-root APIs from exact DSH `0.1.0-rc.6`:

- `JsonlSessionPersistence.list()` to enumerate durable Session headers;
- `JsonlSessionPersistence.inspect()` to obtain a validated immutable snapshot;
- `foldGoal(events)` to replay the durable current Goal;
- `projectEvidence(sessionId, events)` for Tianwen's compact Evidence.

The command creates no Agent and calls none of `prepare`, `resume`, `create`,
`append`, `flush` or Goal mutation methods. If two Sessions claim the same
current Goal id, the query fails as ambiguous instead of guessing.

### 5.2 Champion

Do not instantiate `EvolutionLedger`: its constructor may create the artifacts
directory and repair a missing or one-revision-stale derived pointer.

The status path instead performs a narrow read-only check:

1. parse canonical LF-delimited `ledger.jsonl` when present;
2. find the last `promoted` or `rolled-back` transition;
3. parse `champion.json` when present;
4. require the derived pointer to match that last formal transition;
5. return the pointer or `null` when both are absent.

It does not verify or expose Artifact source bytes. Mutation and repair remain
owned by the existing Evolution governance path.

## 6. Read-only boundary

Acceptance compares the complete file listing and bytes under both derived
roots before and after the command. The command passes only if they are exactly
unchanged.

It must also prove:

- no new Session event or request header;
- no model Adapter request;
- no ledger or Champion pointer rewrite;
- no temp, cache or receipt written inside the product data root;
- no network, Docker or subprocess except the fixed Node CLI process used by
  the test harness.

Malformed Session/Goal/Evolution data fails with one concise error and a
non-zero exit. Missing Goal is a normal not-found result and also changes
nothing.

## 7. Packaging boundary

The `tianwen` bin must be present in the packed Runtime Bundle and executable
from the installed formal Profile. The package remains one deployable Tianwen
artifact; DSH/Cordis remain exact external dependencies.

Build tests extend the existing metafile/input allowlists for only the new
status and CLI entries. Private `@deepseek-ai/*/src/*`, test helpers, probe
packages, native addons and unrelated workspace packages remain forbidden.

## 8. Minimal acceptance matrix

1. Pure projection is deterministic for the same Session/Evolution snapshot.
2. A real persisted Goal is found by Goal id across a fresh Context restart.
3. Human output contains progress and omits seeded private message/tool text.
4. JSON output matches `tianwen.goal-status.v1` exactly.
5. No Goal returns a stable non-zero result with no state change.
6. Malformed durable state fails without state change.
7. Before/after product-data file lists and bytes are identical.
8. The installed formal Profile can execute the packed `tianwen` bin after the
   Phase 2 smoke run, without another model request.

## 9. Explicit non-goals

- no resume, pause, edit, complete, approve, promote or rollback command;
- no Goal Graph or multi-goal dashboard;
- no streaming watcher or background daemon;
- no Rich/Ink/React/TUI/web/desktop UI;
- no generic query language or storage abstraction;
- no Runtime cutover or Python removal;
- no paid model, live web or real Docker.

## 10. Retained risks

- DSH remains pinned to Developer Preview `0.1.0-rc.6`.
- Scanning all Session headers is acceptable for this first slice but may need
  an index only after measured scale requires it.
- The projection is a point-in-time read; a concurrently active process may
  append after the snapshot.
- Windows sandbox and installer debts from prior phases are unchanged.
