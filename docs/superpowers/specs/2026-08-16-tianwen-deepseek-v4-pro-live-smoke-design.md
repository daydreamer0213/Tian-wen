# Tianwen DeepSeek V4 Pro live smoke design

**Date:** 2026-08-16
**Status:** approved
**Base:** `codex/tianwen-model-config` at `4567eca10f88cc264d006bc8537d0a870db3999c`

## Purpose

Prove one paid DeepSeek V4 Pro request through Tianwen's current DeepSeek
Harness runtime. This is a route and accounting smoke test, not a Goal run,
agent benchmark, tool-use test, or permission expansion.

## Options considered

1. **Tianwen-on-DSH explicit smoke command (chosen).** Reuse the installed
   Profile, credential service, selected model service, and public `llm` seam.
   This proves the current migration path with a small permanent diagnostic.
2. **Direct HTTP or SDK request.** Shorter, but it bypasses DSH composition,
   credentials, model routing, and usage translation, so it proves too little.
3. **Full Goal/AgentLoop round.** More realistic, but it adds system context,
   tools, Session state, and possible extra rounds. It cannot provide the same
   one-request guarantee and is deferred until the route smoke succeeds.

## User surface

Add one explicit paid command:

```powershell
tianwen model smoke --model deepseek-v4-pro --data-dir D:\DevData\tianwen-live-model-smoke\data --json
```

The command accepts no prompt, endpoint, retry, tool, or arbitrary model
arguments. It always uses the fixed request below. Existing `model status` and
`model use` remain configuration-only and continue to send zero model requests.

## Fixed request and budget

- provider: `deepseek-official`
- model: `deepseek-v4-pro`
- user message: `Reply with exactly TIANWEN_SMOKE_OK and nothing else.`
- system prompt: none
- tools: none
- thinking/reasoning effort: off
- temperature: omitted
- provider-enforced maximum output: 64 tokens
- total reported-token acceptance ceiling: 512 tokens
- model-call count: exactly one
- automatic retries: none; the runner calls the hand-built public `llm.stream`
  seam directly rather than AgentLoop's failed-step retry path
- wall-clock timeout: 90 seconds
- operator cost ceiling: CNY 0.01

The fixed ASCII input is intentionally tiny. At the official price checked on
2026-08-16 (CNY 3 per million cache-miss input tokens, CNY 0.025 per million
cache-hit input tokens, and CNY 6 per million output tokens), even charging all
512 accepted tokens at the highest rate is CNY 0.003072. The CNY 0.01 ceiling
therefore leaves margin without permitting a second request.

Source: <https://api-docs.deepseek.com/zh-cn/quick_start/pricing/>

## Runtime flow

1. The CLI validates the exact command and absolute D-drive data directory.
2. The current branch is installed into the isolated smoke data directory; the
   user's normal Tianwen data is not reused.
3. The installed Tianwen Profile starts with its public DSH services.
4. Preflight requires the selected model to be exactly V4 Pro and requires the
   existing `DEEPSEEK_API_KEY` credential reference to be configured. The key
   value is never printed, persisted in a receipt, or passed in argv.
5. The runner waits for the public loader lifecycle boundary, creates one fixed
   user message, and calls `llm.stream` once with `maxTokens: 64`, no tools, and
   a 90-second abort signal.
6. It accepts text, usage, and one terminal finish from the stream. Any tool
   call, provider error, abort, missing usage, duplicate usage/finish, unexpected
   text, token total over 512, or estimated cost over CNY 0.01 fails the smoke.
7. It emits one sanitized JSON receipt to standard output and exits. It creates
   no Goal, Agent, Session, Evidence, Evolution record, or Champion change.

## Receipt

The JSON receipt records only:

- schema version and timestamp;
- provider/model identity;
- request count (`1`);
- fixed limits;
- reported disjoint token counts;
- estimated CNY cost using the frozen run price table;
- terminal finish kind;
- whether the exact marker matched;
- success/failure code.

It does not record the API key, environment, headers, raw provider body,
absolute credential paths, reasoning text, or arbitrary prompts. Product code
only prints the receipt. The controller captures that sanitized line under
`D:\DevData\tianwen-live-model-smoke\receipts` using canonical UTF-8 JSON plus
LF. A failed or ambiguous run is retained as failure evidence but never retried
automatically.

## Tests and execution gate

Default tests remain offline and free. They use a scripted public `llm` service
to prove:

- exactly one stream call with the fixed provider/model/message and limits;
- no tools, Goal, Agent, Session, Evidence, Evolution, or Champion side effects;
- credential/model preflight fails before `llm.stream`;
- malformed, missing, over-budget, tool-call, timeout, and provider-error streams
  fail closed without retry;
- receipts are canonical and contain no credential sentinel;
- existing status/use commands still report `modelRequestsDelta: 0`.

The paid execution is deliberately not part of an automated test suite. Only
the controller may run the explicit command after all focused offline tests,
typecheck, private-import checks, and the installed Profile smoke pass. The
isolated Profile is selected to V4 Pro with the existing zero-request `model
use` command, the live command is executed once, and the Profile is returned to
`offline` afterward without a model request. Regardless of success or failure,
the paid command is not executed again in the same phase without new user
authorization.

## Non-goals

- no generic chat command or user-supplied prompt;
- no Goal/AgentLoop/tool-use smoke;
- no price-fetching service or billing subsystem;
- no new credential store;
- no model router, retry framework, desktop UI, Docker, or remote sandbox;
- no changes to the existing Python evaluator or Alpha A1-A5 contracts.
