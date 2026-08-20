# Tianwen DeepSeek V4 Pro live Goal round handoff

Date: 2026-08-17 (Asia/Shanghai)

Status: **COMPLETE — the one live attempt failed safely; no replay was made**

This handoff closes the bounded live Goal-round stage. The implementation,
offline proof, reviews, GitHub integration archive, one paid attempt, durable
post-state, and offline restoration are all recorded. The live result is a
real product finding, not a successful Goal completion.

## 1. Authorities and exact revisions

- Original remote `main`: `542000a2f531f28dcd329712d3e4f35f80693b03`.
- Stage/main merge base: `8ca70d379a46ee495b70fcb4b8f21fde5083c037`.
- Frozen design and plan commit:
  `4f1d39b599d3d62757c6ae458c5ad9471d623bf5`.
- Stage implementation head before this handoff:
  `21a07334084434bee395ba7b249a271f56492bde`.
- Final reviewed integration implementation:
  `be9ce132f8edcfcd01ec402c4da1318a66f824b1`.
- Final integration branch:
  `codex/tianwen-integration`, verified on GitHub at the same exact SHA.
- Design:
  `docs/superpowers/specs/2026-08-16-tianwen-deepseek-v4-pro-live-goal-round-design.md`.
- Plan:
  `docs/superpowers/plans/2026-08-16-tianwen-deepseek-v4-pro-live-goal-round.md`.

The final integration includes the original stage chain plus release fixes for
the absolute live-child deadline, Windows installer timeouts and rollback,
archive manifest determinism, and a fail-closed two-build/two-pack stability
gate. Historical `codex/` branches remain retained; no history was rewritten
and no force-push was used.

## 2. Final offline acceptance

The final candidate was tested from a controlled D-drive environment. Python
imported the current integration worktree, never the stale editable install in
`<legacy-alpha-worktree>\.venv`.

Final evidence included:

- focused live Goal/ordinary resume tests: 50/50;
- installer contract tests: 21/21;
- final default Vitest: 242 passed, 7 expected skipped;
- explicit Windows LocalSandbox: 3/3;
- Python A1-A5 package gate: 10/10;
- full pytest: 424 passed, 4 expected skipped;
- Runtime Bundle build, workspace typecheck, DSH dependency closure, private
  import check, Ruff, committed-range diff check, and clean-worktree check: all
  passed;
- installed startup E2E on the final candidate: 1/1 passed, including exact
  first/replay receipt and managed-byte idempotence;
- Host and Profile hashes, lengths, and mtimes remained unchanged in the final
  reuse proof;
- no offline gate contacted the model provider or ran real Docker.

The clean release worktree is
`D:\DevData\tianwen-release-worktrees\be9ce132`, detached at the exact final
implementation SHA. A fresh offline install reused 576 packages and downloaded
zero. Two consecutive exact build/pack sequences both produced:

```text
sha256:a1843ff722a91865fb793697a8e09771f6210767e1245c70e56102d5b0579455
34,051 bytes; 15 ordinary archive entries
```

This clean worktree, rather than the long-lived integration worktree, was used
to install the reviewed Runtime into the live data root. The one offline
installer run exited zero in 55.307 seconds. It changed the managed archive
from `f6c5...` to the exact `a184...` digest above while leaving the installed
Host and all Goal, Session, and Evolution bytes unchanged.

## 3. Review closure

Independent correctness/spec and Ponytail/YAGNI reviews both ended with:

```text
0 Critical; 0 Important; APPROVED
```

The important fixes and review decisions were:

- a parent fail-safe now gives the child 90 seconds for cooperative cancellation
  plus a fixed 5-second cleanup grace, then terminates only that DSH child and
  emits one sanitized timeout receipt;
- runtime `armed/disarmed` is process-local; durable read-only projection is
  correctly `not-loaded`, so the parent does not fabricate a persistent
  disarm fact or launch a second DSH runtime;
- Profile file-by-file anti-tamper machinery was rejected as outside the
  realistic same-user trusted-host boundary;
- the built-in pnpm manifest flag plus the real first/replay E2E and full tar
  scan were accepted as the minimum archive-manifest proof;
- after one transient uncommitted archive appeared in the long-lived worktree,
  the installer gained a small pre-publish gate: two exact build/pack results
  must have the same SHA before Profile or receipt publication. It does not
  retry, pick the second result, clean speculative caches, or add a framework.

## 4. Official price and approved budget

The official DeepSeek price page was read immediately before the live attempt:

<https://api-docs.deepseek.com/zh-cn/quick_start/pricing>

Retrieval window: 2026-08-17 17:30-17:36 Asia/Shanghai.

DeepSeek V4 Pro rates per million tokens were unchanged from the reviewed
constants:

- input, cache hit: CNY 0.025;
- input, cache miss: CNY 3;
- cache write: treated at the cache-miss rate, CNY 3;
- output: CNY 6.

The approved one-attempt operator ceiling was 32,768 disjoint tokens and CNY
0.25. Even an all-output 32,768-token accepted total would estimate to CNY
0.196608. The operator explicitly approved this stage's paid attempt before it
started.

After this attempt, the operator set a forward policy: future major stages
should obtain one cumulative token/CNY authorization at stage start, then may
make the necessary bounded calls within that authorization without asking per
call. Goal changes, a larger cumulative budget, real new fees, or major risk
still require a new decision. This forward policy did not retroactively permit
a replay of the current frozen one-attempt Goal.

## 5. The one live attempt

The attempt started at receipt timestamp:

```text
2026-08-17T09:36:10.162Z
```

It used the installed CLI outside every source worktree and exactly this public
command shape:

```text
tianwen resume --goal goal-e121ea9d-0536-426f-ad69-fb0a12004f06 \
  --data-dir D:\DevData\tianwen-live-goal-round\data \
  --live-smoke --json
```

The hidden child was launched once with separate random stdout/stderr files.
No second process or replay was launched. The child exited 1 and produced one
valid sanitized failure receipt:

```text
schemaVersion: tianwen.goal-live-smoke.v1
status: failed
failureCode: usage-invalid
provider/model: deepseek-official/deepseek-v4-pro
requestCount: 2
retryCount: 0
markerMatched: false
stderr bytes: 0
```

The exact receipt bytes were atomically retained at:

```text
D:\DevData\tianwen-live-goal-round\receipts\deepseek-v4-pro-goal-round.json
```

Receipt size and SHA-256:

```text
377 bytes
9ab423f5c38c07ac328398a91a8cd6e8693c4f0f6a6e924913d92c38dcc8ee5b
```

The receipt contains no key, authorization header, raw provider body,
reasoning, model text, objective, system prompt, marker text, or raw tool
arguments/results. Temporary stdout/stderr files were removed after promotion
and validation.

The failure receipt intentionally has no accepted usage block. A separate
read-only projection of the durable numeric usage facts, without reading or
printing model text, found two assistant messages:

- request 1: 1,611 input, 32 output, 0 cache-read tokens;
- request 2: 126 input, 64 output, 1,536 cache-read tokens;
- aggregate disjoint total: 3,369 tokens;
- price-table estimate: CNY 0.0058254.

This estimate is post-attempt operational evidence, not an accepted success
receipt and not a provider invoice.

## 6. Durable post-state

Fresh zero-request read-only status after the attempt reported:

```text
Goal: goal-e121ea9d-0536-426f-ad69-fb0a12004f06
revision: 2
phase: active
rounds: 1/1
Session: tianwen-goal-212a6986-a5e5-478b-bd71-079fa9a0c48e
Session event count: 66
Evidence: 1 complete, 0 missing-result
Evidence tool: tianwen_smoke_action
Champion: none
Runtime activation: not-loaded
Runtime model requests: 0 (read-only projection)
```

The durable delta contains two assistant messages, one successful
`tianwen_smoke_action` call/result, and no `update_goal` call. The second
assistant message reached the fixed 64-output-token limit. These facts explain
why the exact three-request success contract was not met, but this handoff does
not infer or quote raw model text. Genuine Session history was preserved; no
transactional rollback was fabricated.

Evolution still contains only its existing empty `artifacts` directory and no
Champion. No live child or capture temp file remains.

## 7. Offline restoration and one-attempt boundary

The controller's `finally` path ran zero-request model selection and a fresh
status. Final selection is:

```text
tianwen-offline/phase2-smoke
modelRequestsDelta: 0
```

The paid authorization is consumed. The current Goal has used its only round,
is no longer pristine, and must not be passed back to strict live smoke. No
ambiguity, failure, or future authorization permits silently replaying this
specific Goal chain.

## 8. Next recommendation

Close this stage as a valuable failed-safe live proof. Do not weaken the
receipt, pretend two requests equal success, raise the round count in place, or
reuse the exhausted Goal.

The next major stage should be a small offline design/reproduction stage for
the observed second-turn divergence. It should use the durable sanitized facts
above to test the minimum public DSH mechanism that makes `update_goal` the
immediate next action after the successful business tool. Candidate changes
such as a stronger fixed authority section, public tool-choice control, or a
slightly different per-request output cap must be evaluated against public DSH
APIs and offline scripted traces before any new paid call. Only then create a
new fixed Goal and use the operator's new one-authorization-per-major-stage
policy with one explicit cumulative token/CNY ceiling.

This result is one real Goal round. It is not a continual-learning loop, a
model-quality benchmark, a Candidate/Evaluation/Promotion result, or evidence
that Champion governance should change.

The separately approved continual-learning governance design remains
architecture-approved and implementation-unscheduled. It must be preserved
during final `main` reconciliation, but this stage does not start that work.
