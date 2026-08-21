# Tianwen Natural Trial Safe Child Receipt Design

**Status:** proposed correction after one real, zero-Provider stop

## 1. Decision

The configured-Provider natural trial remains the next Stage 7 evidence step,
but it must not be retried through the current output path.

The product correction is deliberately narrow:

- a natural-trial DSH child uses pipes rather than inherited terminal output;
- the parent accepts one bounded, structurally valid
  `NaturalRunTrialReceipt` from that child;
- the parent prints exactly one normalized safe JSON receipt on success;
- invalid, extra, or unbounded child output becomes one fixed safe failure;
- ordinary resume and the existing live-smoke path keep their current behavior.

This is an execution-surface correction. It does not change the Agent loop,
Goal semantics, Provider selection, Evidence, learning intake, ledger, Skill
governance, or budget policy.

## 2. Observed fact and root cause

The real managed rc.6 to rc.7 migration completed successfully. A fresh Goal
and frozen natural-trial manifest were then created with zero model requests.
The single `resume --trial-manifest ... --json` invocation stopped before the
first Turn. Durable inspection proved:

- Goal revision and `roundsStarted=0` were unchanged;
- there was no `turn/start`, model, tool, Evidence, Run, Outcome, Signal, or
  Ticket fact;
- the prior offline model selection was restored;
- Provider requests and tokens were zero.

The command-side JSON reader failed because terminal control bytes preceded
the expected JSON. This is explained directly by the current product code:

```ts
stdio: liveSmoke ? ['ignore', 'pipe', 'pipe'] : 'inherit'
```

`naturalTrial` therefore shares the DSH host's terminal stdout/stderr, while
the child runner later writes its safe JSON receipt to that same stdout. A
real DSH host may emit terminal control output before the runner receipt. The
parent cannot then promise parseable JSON or prove that only safe receipt data
was exposed.

This is not a hypothetical terminal edge case. It occurred on the first real
product invocation and contradicts the canonical Stage 7 requirement that the
trial return a safe receipt.

## 3. Options considered

### 3.1 Recommended: pipe, validate, and re-emit the receipt

Use pipes for the natural-trial child, collect a bounded stdout/stderr payload,
parse one exact receipt, and re-emit a normalized safe object. This reuses the
same parent/child isolation pattern already used by live smoke without sharing
its paid-smoke timeout policy.

This fixes both the JSON contract and the privacy boundary at the product
edge.

### 3.2 Rejected: set `NO_COLOR` or strip ANSI bytes

Color flags address only one possible producer. They do not stop ordinary
logs, progress output, or future DSH messages from sharing stdout with the
receipt. A generic ANSI sanitizer would also be new parsing machinery while
leaving the mixed-channel design in place.

### 3.3 Rejected: capture or search for JSON in the external Task 5 script

An external workaround would leave the installed Tianwen CLI unable to honor
its own `--json` contract and could persist raw child output outside the
product's safe boundary. The fix belongs at the existing parent/child seam.

## 4. Exact product boundary

### 4.1 Child process wiring

For `liveSmoke || naturalTrial`, the parent spawns the installed DSH child with:

```ts
['ignore', 'pipe', 'pipe']
```

Ordinary resume continues to use `inherit` exactly as today.

Live smoke continues to use `monitorLiveSmokeChild()` and its existing fixed
deadline. Natural trial uses a separate, smaller
`monitorNaturalRunTrialChild()` with no new deadline, retry, Provider wrapper,
or budget behavior.

### 4.2 Receipt parser

`packages/tianwen-runtime-bundle/src/natural-run-trial.ts` adds:

```ts
export function parseNaturalRunTrialChildReceipt(
  stdout: string,
  stderr: string,
  expected: { readonly goalId: string; readonly sessionId: string },
): NaturalRunTrialReceipt
```

The parser:

1. requires empty stderr;
2. requires stdout to contain one JSON value plus optional surrounding JSON
   whitespace, with no control prefix or trailing log;
3. requires the exact receipt schema and closed enum values;
4. rejects unknown keys at every receipt level;
5. requires non-negative safe-integer counters;
6. validates SHA-256 digest fields and optional fields without inventing
   defaults;
7. requires the receipt Goal and Session IDs to equal the parent preflight;
8. constructs a fresh receipt object so unrecognized child fields can never
   be forwarded.

It does not parse prompts, model text, tool arguments, Skill content, Session
history, paths, URLs, or credentials.

### 4.3 Natural child monitor

`monitorNaturalRunTrialChild()` collects stdout and stderr in memory with the
existing 65,536-byte per-stream strict-child limit. It adds no file, database,
queue, worker, logger, or general subprocess framework.

On valid child completion it writes exactly:

```text
<normalized NaturalRunTrialReceipt JSON>\n
```

and returns exit code 0.

On spawn error, missing pipe, output overflow, non-zero child exit, non-empty
stderr, or receipt validation failure it:

- never forwards the raw child output;
- writes one fixed error line to stderr;
- returns exit code 1;
- does not retry or fall back to ordinary resume.

If the child completed user work before its receipt became invalid, its
durable DSH facts remain authoritative. The CLI failure does not undo the Goal
or Session and does not authorize an automatic rerun.

## 5. Runtime and governance invariants

- DSH `0.1.0-rc.7` remains the only product Agent Runtime.
- Tianwen does not recreate the Agent loop, Provider, Session, Tool, Skill, or
  permissions system.
- The child still resolves and uses the same installed Profile, public DSH
  Skill registry, Goal, Session, verifier, Evidence, and learning services.
- No Evolution event or public event type is added.
- No raw child output is written to Git, the Evolution ledger, the manifest
  directory, or a diagnostic file.
- Candidate, Evaluation, Shadow, Active Pointer, Promotion, rollback, old
  Dynamic Cordis, and Python Alpha paths remain untouched.
- No price lookup, price snapshot, timer-based price refresh, CNY reservation,
  or budget state machine is added. The existing 60 CNY authorization remains
  an external supervisor boundary only.

## 6. Verification

Tests must prove the normal, observed boundary rather than speculative terminal
formats:

1. a valid child receipt with matching Goal/Session becomes one normalized
   JSON line;
2. an ANSI/control prefix is rejected and is absent from parent output;
3. non-empty stderr, an unknown field, wrong Goal/Session identity, invalid
   counters/digests, malformed JSON, and output overflow all fail with one
   fixed safe error and no raw sentinel;
4. natural trial uses piped stdout/stderr;
5. ordinary resume still inherits stdio;
6. live smoke keeps its current monitor and deadline;
7. existing zero-cost natural Run, Goal resume, runtime-bundle, DSH closure,
   private-import, public-contract, and demo gates remain green.

No Provider is called during implementation, review, CI, packaging, or product
installation.

## 7. Real evidence continuation

Only after the correction is merged and exact-main CI is green:

1. run the official installer once against the current managed rc.7 product
   root so the ready Profile receives the corrected Runtime Bundle;
2. prove Session/Evolution files are byte-identical and no backup residue
   remains;
3. revalidate the existing fresh Goal has no prior Turn and the existing
   manifest digest is unchanged;
4. perform all receipt, Profile, Skill, verifier, credential-presence, and
   model-selection checks before any Provider request;
5. authorize one new `resume` invocation for that same Goal and frozen
   manifest;
6. restore the prior model selection in `finally`;
7. accept `met/no-case`, Signal, Ticket, inconclusive, Provider error, or safe
   receipt failure truthfully, with no retry and no second Goal.

The prior invocation had zero Provider requests and is not efficacy Evidence.
The new invocation is a separately authorized attempt after a verified product
execution-surface correction. It must not manufacture recurrence or continue
into Candidate, Evaluation, Shadow, or Promotion.

## 8. Completion boundary

This correction is complete when exact-main CI is green and either:

- the one new natural trial returns a parseable safe receipt; or
- a new real stop is recorded without unsafe output or retry.

It does not claim production-user traffic, general learning efficacy, or
Promotion readiness.
