# Tianwen Goal Status and Governed Ledger Coexistence Design

**Date:** 2026-08-22

**Status:** Proposed for architecture review. This document authorizes no
implementation, product installation, Goal resume, model selection, or
Provider request.

## 1. Outcome

Keep the existing command and output contract:

```text
tianwen status --goal GOAL_ID --data-dir ABSOLUTE_PATH [--json]
```

but make its Champion projection understand the same complete Evolution ledger
that the product already writes. A ledger containing legitimate private
governance events and legacy Champion events must be inspectable without
publishing the private events or changing one byte of product state.

The only new public capability is a narrow, pure read-only Evolution inspection
entry that returns:

```ts
interface EvolutionLedgerInspection {
  readonly champion: ChampionPointer | null
}
```

It does not return ledger events, Skill content, Run facts, paths, or mutable
ledger methods.

## 2. Proven normal-path defect

The Stage 7 natural Run completed normally and durably recorded its Run
binding, Run Skill manifest, Outcome intake, and Skill-use. A subsequent normal
`status --goal` read failed before producing a projection.

The data is not corrupt. The failure is caused by a second parser in
`packages/tianwen-runtime-bundle/src/status.ts`:

- `canonicalLines()` accepts only the eight legacy/public event type strings;
- `readChampion()` independently replays only legacy Artifact, Evaluation,
  Approval, transition, Runtime-binding, and failure events;
- the first valid private `run-binding-recorded` event is therefore rejected as
  an invalid ledger event.

This is a reachable Important correctness defect in a normal product path. It
is not evidence of damaged Session, Evidence, Outcome, Skill-use, or Evolution
state, and it does not justify replaying the completed Goal.

## 3. Authority and privacy invariants

The existing Evolution ledger is the sole authority for all public and private
governance events. The existing package-root privacy contract remains frozen:

- `PUBLIC_LEDGER_EVENT_TYPES` remains the same eight entries;
- package-root `LedgerEvent` remains the public eight-event projection;
- `TianwenEvolutionService.listEvents()` continues to filter through
  `isPublicLedgerEvent()`;
- Run binding, Run Skill manifest, Outcome, Skill-use, Signal, Ticket,
  protocol, evaluation-plan, and Candidate events remain private.

Status still returns only the existing `tianwen.goal-status.v1` schema and its
existing `champion: { artifactId, revision } | null` field. It must never copy a
private event, Skill payload, local path, Session payload, prompt, tool payload,
or raw integrity error into the projection or CLI error.

Accepting private events for integrity replay is not publishing them.

## 4. Chosen shared seam

### 4.1 Narrow Evolution inspection subpath

`@tianwen/evolution` gains one explicit subpath, for example
`@tianwen/evolution/inspection`. The subpath exports only the inspection
function, its Champion-only result type, and the existing integrity error class
needed for safe mapping. It does not re-export the Evolution root barrel,
`EvolutionLedger`, `LedgerEvent`, Runtime binding, Dynamic Cordis, services, or
mutation methods.

The inspection implementation lives beside the authoritative ledger replay.
It reuses the existing full `parseEvent()`, `#validateAgainstState()`, and
`#apply()` sequence. Consequently it accepts every event shape that the one
ledger authority accepts and rejects:

- unknown event types;
- non-canonical JSON or line endings;
- malformed private or public events;
- duplicate Run or Session bindings;
- missing Run/manifest/Outcome references;
- inconsistent private Skill-use or evaluation chains;
- invalid legacy Champion authority;
- mismatched or malformed `champion.json`.

No string-only allowlist or second private schema is introduced in status.

### 4.2 Internal inspection mode, not a read-only ledger object

The existing mutable `EvolutionLedger` constructor currently:

1. creates the `artifacts` directory;
2. replays the ledger;
3. verifies Artifact source files;
4. repairs a missing revision-1 pointer or a one-revision-stale pointer.

Status cannot call that constructor unchanged. The ledger implementation will
therefore have a module-internal inspection mode used only by the narrow public
function. The mode is not exported from the package subpath, and the ledger
instance never escapes.

Inspection mode performs only:

1. read `ledger.jsonl` if it exists;
2. execute the same full parser, semantic validation, and state replay;
3. read and validate `champion.json` if ledger replay derives a Champion;
4. return a cloned Champion pointer or `null`.

Inspection mode must not:

- call `mkdirSync()`;
- read or verify immutable Artifact source bytes;
- create or repair `champion.json`;
- create a temp file;
- append an event;
- expose a mutable ledger instance.

The mutable constructor retains its current source verification and pointer
repair behavior exactly. The inspection mode treats a missing required pointer
or a stale pointer as an integrity failure instead of repairing it. When no
Champion exists, both ledger absence and a valid private-only ledger project to
`null`; a pointer without a replayed Champion remains invalid.

Artifact source verification remains outside status, matching the approved
read-only status contract. Status needs the formal Champion authority, not the
executable Artifact bytes. Mutation, activation, and rehydration paths retain
source verification.

## 5. Status integration and error mapping

`readGoalStatus()` deletes its local `LEDGER_TYPES`, canonical line reader, and
legacy replay implementation. It calls the Evolution inspection function with
the existing absolute Evolution root and copies only `inspection.champion` into
the unchanged projection.

Evolution integrity failures are mapped to the existing
`GoalStatusIntegrityError` with a fixed, non-sensitive message. The cause may
remain attached in memory for tests and trusted debugging, but the CLI must not
print the cause message, ledger event, identifier chain, path, or payload.
Unexpected failures continue through the existing fixed durable-status error
boundary. Status remains entirely read-only and never loads Tianwen Runtime,
Agent, Goal mutation, Provider, or Dynamic Cordis.

## 6. Package and bundle boundary

The Runtime Bundle may add a direct workspace-only development dependency on
`@tianwen/evolution`, plus the matching lockfile importer entry. This requires
no registry package and no network download. If the reused implementation
worktree does not yet contain that direct workspace link, implementation may
refresh only that existing workspace link once with pnpm offline and scripts
disabled; it must not create another `node_modules` or fetch an external
package. Status imports the narrow inspection subpath directly; it does not
import the Evolution root barrel and does not route through `@tianwen/runtime`.

The status esbuild entry may reuse the existing narrow
`@tianwen/dsh-compat/runtime` alias because full ledger parsing already uses the
approved `isSkillName` runtime seam. It must not bundle the broad compat root.

The status metafile may contain only:

- the existing status and Evidence projector inputs;
- the new Evolution inspection entry;
- the authoritative Evolution ledger parser/replay inputs that inspection
  actually reaches;
- the narrow DSH compatibility runtime input needed by governed Skill parsing;
- existing public external DSH packages.

It must exclude Evolution `index`, `runtime-binding`, Skill shadow/promotion,
Tianwen Runtime services, Dynamic Cordis, Agent/Provider code, scripted
adapters, test harnesses, probes, and private DSH source paths.

No pass-through adapter package is added merely to avoid one direct workspace
dependency.

## 7. Data flow

```text
status --goal
  -> inspect immutable DSH Session
  -> fold Goal and project safe Evidence summary
  -> inspectEvolutionLedger(evolutionRoot)
       -> canonical full-event parse
       -> authoritative semantic replay in memory
       -> strict, non-repairing pointer validation
       -> Champion pointer | null
  -> unchanged tianwen.goal-status.v1 projection
```

Private events are consumed only as integrity inputs. They have no outgoing
edge to the public status object or public ledger event surface.

## 8. Acceptance and TDD

### 8.1 Principal RED and GREEN

Generate the four real private natural-Run facts through the existing
`EvolutionLedger` public mutation methods:

1. `run-binding-recorded`;
2. `run-skill-manifest-recorded`;
3. `outcome-intake-recorded`;
4. `run-skill-use-recorded`.

Before the change, `readGoalStatus()` must fail on the first private event.
After the change, the same ledger must return the existing status schema with
`champion: null`, while the complete product tree remains byte-for-byte equal.
This is the bearing normal-path contract; handcrafted event strings do not
replace it.

### 8.2 Coexistence and fail-closed cases

Tests also require:

1. valid private events interleaved with a valid legacy Champion history still
   return the exact Champion;
2. an unknown event type fails closed;
3. a malformed private event or broken private reference chain fails closed;
4. malformed, missing, or mismatched Champion pointers fail closed and are not
   repaired;
5. an absent Evolution root returns `null` without creating the root or
   `artifacts` directory;
6. a private-only ledger with no `artifacts` directory remains without that
   directory after inspection;
7. mutable ledger pointer repair tests remain unchanged and green;
8. serialized status, public `listEvents()`, and package-root `LedgerEvent`
   continue to exclude all private event types and payloads;
9. before/after relative paths and bytes are equal on success and failure;
10. the status bundle metafile contains only the approved inspection/replay
    closure.

The tests prove compatibility and integrity, not natural-task efficacy.

## 9. Documentation and CI truth

The implementation minimally corrects the old read-only Goal status design and
handoff where they say status owns a narrow private replay. They will instead
name the authoritative Evolution inspection seam and its non-repairing
behavior. The Stage 7 privacy statement remains unchanged: governed events are
internal even though status can validate them.

Because `goal-status.spec.ts` is not currently in the Ubuntu focused Vitest
command, the implementation puts the new inspection/status bearing cases in
that existing spec and adds its one path to the same command. The broader
`evolution.spec.ts` remains a required local compatibility gate; it needs the
existing D-drive probe root and is not duplicated in CI merely for this slice.
No job, step, matrix, cache, permission, dependency source, or test framework is
added. The permanent public repository contract locks the Goal-status path into
the existing TypeScript focused step.

## 10. Rejected alternatives

### Ignore unknown lines or add private strings to `LEDGER_TYPES`

Rejected. A string allowlist cannot validate event shape, references, replay
order, or Champion authority and would turn corruption into a false success.

### Copy all private schemas into status

Rejected. This is a second ledger parser that will drift again as governed
events evolve. The current defect is direct evidence of that drift.

### Instantiate the current mutable `EvolutionLedger`

Rejected. It creates `artifacts`, verifies source bytes irrelevant to status,
and can repair `champion.json`, violating the command's read-only promise.

### Import the Evolution root through Tianwen Runtime

Rejected. It would pull services and runtime binding into a CLI-only read path.
A direct narrow workspace subpath is smaller and more truthful.

### Add a generic query service, second ledger, logger, or repair workflow

Rejected. One Champion projection does not justify a query framework,
database, daemon, telemetry surface, migration, retry, or repair mechanism.

## 11. Non-goals and stop lines

- no Goal resume or replay of the completed natural Run;
- no Provider, model selection, tool call, or paid request;
- no Candidate, Evaluation, Shadow, Promotion, Pointer mutation, or rollback;
- no public private-event listing or status schema change;
- no ledger migration, event rewrite, pointer repair, or source repair;
- no general concurrent-snapshot protocol or filesystem abstraction;
- no budget, price, reservation, or accounting system;
- no Python Alpha, old Runtime, Docker, PR, tag, or Release.

The existing point-in-time read semantics remain. Theoretical concurrent disk
changes are not promoted into a new lock or transaction design without a
reproducible normal-path failure.

## 12. Risk classification

- **Proven blocker:** the legal private-event ledger is rejected by status.
- **Protected compatibility risk:** legacy Champion and private event replay
  must coexist under one authoritative validator.
- **Protected privacy risk:** validation must not widen the public event or
  status projection.
- **Deferred theoretical edge:** concurrent external file changes beyond the
  existing point-in-time status contract.

This is the smallest sufficient correction: remove the duplicate parser, add
one Champion-only read seam, and keep all mutation and private data behind the
existing authority.
