# Tianwen DeepSeek V4 Pro live smoke handoff

**Status:** complete; exactly one paid request was issued and the isolated
Profile was restored to offline.

## Authority

- Feature branch: `codex/tianwen-live-model-smoke`
- Base: `4567eca10f88cc264d006bc8537d0a870db3999c`
- Live-attempt code HEAD: `e0f01e1a7103a727f840a9432d2f4bee2c920b9b`
- Final code HEAD before this handoff:
  `01c5576d6f6edc0d41108111bd4b50c22f521367`
- DSH release: exact `0.1.0-rc.6`
- Design:
  `docs/superpowers/specs/2026-08-16-tianwen-deepseek-v4-pro-live-smoke-design.md`
- Plan:
  `docs/superpowers/plans/2026-08-16-tianwen-deepseek-v4-pro-live-smoke.md`

## Product result

The installed Tianwen CLI now has one deliberately narrow paid diagnostic:

```powershell
tianwen model smoke --model deepseek-v4-pro --data-dir 'D:\DevData\tianwen-live-model-smoke\data' --json
```

It uses Tianwen's installed DSH Profile and the public `llm.stream` seam. The
request is fixed to `deepseek-official/deepseek-v4-pro`, has no tools or system
prompt, disables reasoning, caps output at 64 tokens, and has no retry or
fallback. The command does not create a Goal, Agent, Session, Evidence,
Evolution record, or Champion transition.

## The one paid attempt

- Authorization: spent exactly once on 2026-08-16 at about 22:03 CST.
- Result: `passed`.
- Provider/model: `deepseek-official/deepseek-v4-pro`.
- Request count: `1`.
- Marker matched: `true`.
- Reported total tokens: `29`.
- Estimated cost: CNY `0.000114`.
- Limits: 64 output tokens, 512 reported total tokens, CNY `0.01`, 90 seconds.
- The command exited `0` in about five seconds.
- No second paid command was issued after success or after the later
  receipt-schema/clock refactor; request construction and call count remained unchanged.

The sanitized run receipt is outside Git at:

```text
D:\DevData\tianwen-live-model-smoke\receipts\deepseek-v4-pro-smoke.json
```

Its SHA-256 is:

```text
1924ce779d00eecc4ea8b7f586d0d1779baa0ef2ef5410a3667ab4ea2b8bc66c
```

It is 300 bytes, UTF-8, LF-terminated, and contains no carriage return. It
contains no API key, header, raw provider body, reasoning, arbitrary prompt,
or response text.

## Price and budget

The run used the official prices checked on 2026-08-16:

- cache-miss input: CNY 3 per million tokens;
- cache-hit input: CNY 0.025 per million tokens;
- output: CNY 6 per million tokens.

Source: <https://api-docs.deepseek.com/zh-cn/quick_start/pricing/>

Even the 512-token acceptance ceiling charged entirely at the highest rate is
CNY `0.003072`, so the CNY `0.01` cap cannot be exceeded by an accepted
receipt.

## Credential handling

The controller checked only that the Windows User environment contained a
non-empty `DEEPSEEK_API_KEY`, then inherited it into the one paid child
process. The value was never printed, placed in argv, committed, written to a
receipt, or copied into a Tianwen store. Status output exposed only the safe
reference name and `configured: true`.

## Zero-request selection and rollback

Before the paid attempt, the isolated installed Profile selected V4 Pro using
`model use`; its receipt reported `modelRequestsDelta: 0`. Immediately after
the paid attempt, `model use --model offline` and a fresh `model status` both
reported:

```text
tianwen-offline/phase2-smoke
modelRequestsDelta: 0
```

The final corrected Runtime Bundle was then reinstalled without a model
request. Its archive digest is:

```text
sha256:044d3e1d6030cf4be893e1fc9025c9a259eca35b06692f0dbe9d2ebfb39d0c08
```

A fresh installed status remained offline with zero model requests.

## Offline verification

All substantive gates were run serially with caches, virtual environments,
temporary files, and generated data on `D:`.

| Gate | Result |
|---|---|
| offline frozen pnpm install | exit `0`; already up to date |
| DSH closure | exit `0`; 187 exact rc.6 packages; 15 public surfaces |
| private-import scan | exit `0`; 0 violations |
| workspace typecheck | exit `0` |
| focused smoke/config/bundle tests before the live attempt | 3 files, 67 passed |
| default Node suite | 20 files passed, 2 skipped; 195 passed, 7 planned skips |
| Runtime Bundle build | exit `0`; model runner built from public roots |
| installed Profile E2E | 1 passed; no provider request |
| A1-A5 author proof | 10 passed |
| foreground Python suite | 424 passed, 4 planned skips |
| Ruff | all checks passed |
| focused tests after final receipt fix | 3 files, 68 passed |
| final build and typecheck | exit `0` |
| base-to-code diff check | exit `0` |

The first full Node invocation omitted two required historical test environment
variables and failed in setup. A second used a new Python path outside the
evaluator's existing allow-list and failed two setup checks. With the canonical
probe root and canonical Task 6 Python path, the fresh suite passed 195/195.
These were operator environment mistakes, not product failures.

The installed E2E was slow because security software scanned generated files.
One pnpm wrapper unexpectedly launched the same successful E2E a second time;
that duplicate was stopped. A fresh direct-Vitest run then rebuilt the
generated E2E directory and passed once. No paid command was involved.

## Review and fixes

The task-scoped review initially found three Important issues:

1. a stalled stream did not have an effective deadline abort;
2. a synchronous `llm.stream` throw could bypass the sanitized receipt;
3. missing required usage fields could create invalid arithmetic.

Fix round 1 added focused RED/GREEN coverage and closed all three. The scoped
re-review found no new Critical or Important issue.

After the paid run, controller comparison against the approved design found
that the live receipt omitted timestamp, terminal finish kind, and disjoint
token counts. Fix round 2 added those sanitized fields and deterministic
offline tests without changing the request path or making another paid call.
The narrow re-review marked the finding addressed with no new Critical or
Important issue.

The external receipt above intentionally preserves the exact bytes produced by
the one real attempt. It predates the receipt-schema/clock refactor; request
construction and call count remained unchanged, and it is not rewritten to
pretend the later fields were observed live.

## Retained boundaries and next step

- This proves the installed DSH route, credentials seam, response marker, and
  local usage/cost accounting for one small request. It is not an agent-quality
  benchmark.
- DSH remains pinned to Developer Preview `0.1.0-rc.6`.
- There is still no retry, generic chat, billing subsystem, or direct provider
  client.
- The existing Python evaluator and Alpha A1-A5 contracts remain unchanged.
- A Goal/AgentLoop/tool-use live round requires a separate user decision and a
  new paid-request budget. It must not reuse this spent authorization.
