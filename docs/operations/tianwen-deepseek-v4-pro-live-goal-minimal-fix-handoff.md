# Tianwen DeepSeek V4 Pro Live Goal Minimal-Fix Handoff

Date: 2026-08-17 (Asia/Shanghai)

## 1. Stage verdict

This stage is closed as an honest, bounded **failed live proof**. Stage A did
not pass its required completion gate.

The minimal `64 -> 128` output-cap change solved the previously observed
encoding truncation: the new real chain produced a complete, durable
`update_goal` call using 99 output tokens. The model nevertheless supplied the
wrong Goal id. The existing strict guard rejected that call without rewriting
its arguments or completing the Goal. The model then hallucinated `get_goal`,
which was not in the two-tool surface and was also rejected. A fourth request
was blocked before provider dispatch by the fixed three-request ceiling.

The resulting receipt is therefore correctly:

```text
status: failed
failureCode: request-limit-exceeded
requestCount: 3
retryCount: 0
markerMatched: false
```

There was no replay, in-place round extension, receipt relaxation, fabricated
Goal completion, or second paid chain. The Goal is now active with its only
round consumed (`1/1`) and must never be reused for strict live smoke.

This is Runtime integration evidence. It is not Alpha-C learning evidence and
does not establish a continual-learning loop.

## 2. Git and design authority

- Release base, local `main`, `origin/main`, and GitHub `main` at stage start:
  `33008cd388e5cb1655aa9d5ade862daedbb7ed93`.
- Stage branch: `codex/tianwen-real-goal-minimal-fix`.
- Design commit: `65ceb94` — `docs: design live Goal minimal fix`.
- Implementation-plan commit: `b92b8e2` — `docs: plan live Goal minimal fix`.
- Reviewed implementation commit:
  `0f2a9d7e8d91885d6328c69d14956fcf6dd0877f` —
  `fix: allow complete live Goal update call`.

The implementation changes one production value only:

```diff
- maxOutputTokensPerRequest: 64,
+ maxOutputTokensPerRequest: 128,
```

The request count, total-token and CNY ceilings, timeout, retry count,
authority section, exact two-tool schema check, execution guard, durable
ordering assessor, receipt keysets, sanitization, Evidence requirement, and
governance checks remain unchanged. DSH remains the installed public
`0.1.0-rc.6`; there is no fork, private import, adapter replacement, new
Runtime framework, prompt rewrite, or dependency change.

## 3. Offline RED/GREEN and reviews

The cap-sensitive scripted test first ran against production `64` and failed
honestly:

```text
1 failed, 40 skipped
received status: failed
received requestCount: 2
received markerMatched: false
```

After the one-value change, the focused Runtime test passed `41/41`. A separate
permanent characterization still proves that an unfinished `update_goal`
delta without `block-end` never becomes a durable tool call.

Pre-live independent reviews:

- correctness/spec review: APPROVED, Critical 0, Important 0, Minor 0;
- Ponytail/YAGNI review: APPROVED, no findings and no removable code.

Post-live independent reviews:

- correctness/evidence review: APPROVED, Critical 0, Important 0;
- one Minor documentation constraint: read-only status labels all three paired
  call/result Evidence records as `complete`, but the durable tool-result
  blocks show `update_goal` and `get_goal` with `isError: true`; this handoff
  therefore never describes them as business successes;
- Ponytail/YAGNI review: APPROVED with `STOP_RUNTIME`.

The post-live reviewers found no already-proven public DSH mechanism that
would guarantee the exact Goal id or prevent the hallucinated tool. The
installed public declarations still expose no `tool_choice`, `requiredTool`,
`forceTool`, or equivalent hard next-tool control. Adding another prompt,
injection, shim, scheduler, or general Runtime abstraction would be an
unproven expansion rather than this stage's minimal fix.

## 4. Serial offline gates

All large/generated state, stores, environments, Profile installs, and test
data stayed on `D:\DevData`. No real Docker and no paid provider were used by
offline gates.

Passing final gates:

- offline `uv sync` and current-worktree Python import proof;
- offline frozen pnpm install: no package download;
- Runtime Bundle build;
- exact DSH `0.1.0-rc.6` install-surface check;
- private DSH import scan: zero violations;
- workspace typecheck;
- focused Vitest: 4 files, `92/92` passed;
- full Vitest: 21 files passed, 2 skipped; `244` passed, 7 skipped;
- Windows LocalSandbox: `3/3` passed, no Docker;
- Python A1-A5 task packages: `10/10` passed;
- full pytest: `424` passed, 4 skipped;
- Ruff: all checks passed;
- whole-branch `git diff --check` from `33008cd...`;
- clean worktree at the live gate.

Two gate-environment facts are retained rather than hidden:

1. The first full Vitest command used a D-drive Python outside the evaluator's
   required probe authority root. Two tests rejected it before product
   assertions. A fresh offline environment under
   `D:\DevData\tianwen-dsh-probe\goal-cap-128-python-env` imported this exact
   worktree; the failed pair then passed `20/20`, followed by the clean full
   suite above. No code changed.
2. The first cold installed E2E printed the exact pre-existing phase-2 success
   marker but exited 13 with the known rc.6 unsettled-top-level-await lifecycle
   warning before reaching this feature. The same installed fixed offline
   smoke then exited 0, and the E2E using its explicit reviewed-install reuse
   switch passed `1/1` in 53.28 seconds, including wire `max_tokens: 128`, Goal,
   Evidence, receipt, governance, and second-resume zero-request checks.

## 5. Price and operator approvals

Official Chinese DeepSeek pricing was rechecked after all offline gates and
before the paid chain:

<https://api-docs.deepseek.com/zh-cn/quick_start/pricing>

Retrieval window: 2026-08-17 21:31-21:34 Asia/Shanghai.

DeepSeek V4 Pro remained:

- cache-hit input: CNY 0.025 per million tokens;
- cache-miss input: CNY 3 per million tokens;
- cache write: conservatively treated at CNY 3 per million tokens;
- output: CNY 6 per million tokens.

The operator approved this stage's one fresh Goal chain at a cumulative
ceiling of `32,768 tokens / CNY 0.25`. The operator also pre-approved a
separate future Alpha-B model budget of CNY 20 with no per-call interruption
inside Alpha-B's unchanged scope. No Alpha-B budget was used in this stage.
That approval does not waive the explicit ordering gate that Alpha-B starts
only after Stage A passes.

## 6. Exact reviewed installation and zero-request preflight

The reviewed implementation was installed fresh under:

```text
D:\DevData\tianwen-live-goal-minimal-fix\data
```

Install facts:

```text
DSH: 0.1.0-rc.6
archive SHA-256: 3a16090c0e45f424793e69b2f6229665bdd205a1f9c49f6c5cfdf9a155dcd8f0
status: ready
```

The first zero-request `model use` process wrote the V4 Pro selection but
exited 13 with the same known cold rc.6 lifecycle warning. A new read-only
status process then proved the durable facts rather than repeating the write:

```text
selection: deepseek-official/deepseek-v4-pro
credential configured: true
modelRequestsDelta: 0
```

Exactly one new fixed Goal was created:

```text
Goal: goal-415ad8ce-a73b-4325-b96a-b0011b39004d
revision: 1
phase: active
rounds: 0/1
Session: tianwen-goal-e0315cc7-ce06-4f8e-ab8b-860c8e738748
Session events: 1 create event
Evidence: 0
model requests: 0
Champion: none
```

List and status each bound the Goal exactly once and made zero model requests.
An initial long local launch wrapper was rejected by local execution policy
before any process existed. A fresh status and Session-byte check proved the
Goal still revision 1, active, `0/1`, with only its create event, zero model
requests, and no capture or receipt. This rejected wrapper is not counted as a
live attempt.

## 7. The single paid chain

The only live child was process id `3964`. It used the installed CLI outside
the worktree and exactly this public command shape:

```text
tianwen resume \
  --goal goal-415ad8ce-a73b-4325-b96a-b0011b39004d \
  --data-dir D:\DevData\tianwen-live-goal-minimal-fix\data \
  --live-smoke --json
```

The hidden child exited `1`. It was not started again.

Receipt timestamp:

```text
2026-08-17T13:50:55.362Z
```

Sanitized receipt facts:

```text
schemaVersion: tianwen.goal-live-smoke.v1
status: failed
failureCode: request-limit-exceeded
provider/model: deepseek-official/deepseek-v4-pro
requestCount: 3
retryCount: 0
markerMatched: false
maxOutputTokensPerRequest: 128
maxTotalTokens: 32768
maxCostCny: 0.25
stderr bytes: 0
```

The exact stdout bytes were atomically retained at:

```text
D:\DevData\tianwen-live-goal-minimal-fix\receipts\deepseek-v4-pro-goal-minimal-fix.json
```

Receipt size and SHA-256:

```text
387 bytes
9cd9935de996d5166323ff85ec446e512e3f708ac29db922a68343a125cbf9a2
```

The receipt has the exact failure keyset and intentionally has no accepted
usage, Goal, Session, Evidence, or governance success block. It contains no API
key, authorization header, raw provider body, reasoning, model text, system
prompt, objective, marker text, or raw tool arguments/results. The empty
stderr capture is retained as a zero-byte `.stderr.empty` artifact because the
local execution policy rejected deletion; no `.tmp` capture remains.

## 8. Durable structural evidence

No raw model text, reasoning, system prompt, or argument values were printed or
archived by the controller. A structural projection found three assistant
messages:

| Request | Input | Output | Cache read | Durable content shape |
|---|---:|---:|---:|---|
| 1 | 1,607 | 32 | 0 | one tool call |
| 2 | 122 | 99 | 1,536 | one tool call |
| 3 | 240 | 38 | 1,536 | text plus one tool call |

Operational usage projection:

```text
input tokens: 1,969
output tokens: 169
cache-read tokens: 3,072
disjoint total: 5,210
projected cost: CNY 0.0069978
```

This is a read-only price-table projection, not an accepted success receipt or
provider invoice. It remains below both approved ceilings.

Durable tool sequence:

1. `tianwen_smoke_action` with the exact empty argument object; result was
   non-error.
2. `update_goal` with the exact three-key set `action`, `goal_id`, `revision`.
   `action=complete` and revision `2` matched, but the Goal id did not match the
   bound current Goal. The strict guard returned an error result. The 99-token
   complete call proves the original 64-token encoding truncation is fixed.
3. `get_goal`, despite the installed Runtime having verified the visible tool
   schemas were exactly `tianwen_smoke_action` and `update_goal`. The installed
   tool boundary returned an error result; no `get_goal` tool executed.
4. The AgentLoop attempted another step. The fixed request hook rejected the
   fourth request before provider dispatch, producing
   `request-limit-exceeded` with request count `3` and retry count `0`.

Final durable Goal state:

```text
revision: 2
phase: active
rounds: 1/1
activation: not-loaded in the read-only projection
```

There is no complete Goal change. Status projects three paired call/result
Evidence items, but only the business action result is non-error; this handoff
does not call the rejected update or hallucinated get success. Evolution has
zero files and Champion remains absent.

## 9. Offline restoration and one-chain boundary

The controller restored the installed selection immediately after the live
child and confirmed from a fresh process:

```text
selection: tianwen-offline/phase2-smoke
modelRequestsDelta: 0
```

The current stage authorization is consumed. The new Goal has used its only
round and cannot pass strict pristine preflight again. Failure, receipt
ambiguity, the separate Alpha-B budget, or future work does not authorize a
replay or in-place extension of this chain.

## 10. Canonical conclusion and next entry

The minimum public output-cap mechanism fixed the precise 64-token truncation,
but did not make the full strict business-tool -> exact `update_goal` -> marker
chain reliable. Public authority and exact tool restriction cannot force the
model to copy the correct Goal id, and the installed public DSH surface has no
hard required-tool control. Existing guards, request ceilings, persistence,
and receipts behaved correctly and prevented a false completion.

Therefore:

- Stage A is closed but **not passed**;
- stop Runtime changes rather than adding another unproven prompt, injection,
  tool shim, scheduler, DSH fork, or general framework;
- do not claim Runtime freeze as a successful Stage B transition;
- do not treat this as Alpha-C learning evidence;
- do not start Alpha-B merely because its CNY 20 budget is pre-approved;
- preserve that Alpha-B budget unused until the architecture owner explicitly
  resolves the Stage-A ordering gate.

The next canonical entry is an architecture decision, not more Runtime coding:
either retain the approved requirement that Stage A must first produce one
real completed Goal, in which case Alpha-B remains gated, or explicitly change
that requirement and accept this documented Runtime limitation before
freezing Runtime and entering Alpha-B. That Goal/value tradeoff is outside the
controller's authority to infer from the budget approval alone.

## 11. Architecture resolution and Git closure

The architecture owner subsequently made the required explicit decision. It
does not change or retroactively satisfy the Stage-A success gate:

- the live proof remains failed with `request-limit-exceeded`;
- the Goal remains active at revision 2 with its only round consumed;
- the Goal must not be replayed or extended in place;
- Stage A is **not passed**, but is boundedly closed under its original
  evidence-backed stop condition;
- the independently proven `maxOutputTokensPerRequest: 64 -> 128` fix remains;
- Runtime is frozen as the current execution substrate with known capability
  and known limitations. It may be reopened only if a later learning stage
  provides repeatable evidence that it is a real blocker.

No prompt addition, tool shim, scheduler, DSH fork, private-source import,
receipt relaxation, budget relaxation, or general Runtime framework was added.

Git closure preserved the stage history without rebase, squash, force-push, or
branch deletion:

```text
approved main baseline: 08d4c6b208bdd67b35d8276c13781ec5ca62f0b2
stage branch: codex/tianwen-real-goal-minimal-fix
stage branch remote HEAD: a518048e5274afab87ecd58b5640b0eac7d5105d
normal merge commit: 3896aa420cfca95e51c230de4de7063b55cf79db
```

The next entry is Alpha-B comparison infrastructure only: prove fair paired
Champion/Challenger comparison with the same model, budget, tools, baseline,
and verifier in independent workspaces. Entering Alpha-B does not claim Stage-A
success and does not authorize candidate generation, promotion, or Shadow. The
separate cumulative Alpha-B model budget is CNY 20 and remains unused at this
handoff; all design, implementation, tests, and independent reviews must be
completed offline before any paid call.
