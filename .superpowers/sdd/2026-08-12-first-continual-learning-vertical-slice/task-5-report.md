# Tian-wen Task 5 — Governed Active Exploration

## Status

Completed and committed.

- Commit: `7061d90 feat: add governed active exploration`
- Working tree: clean after the commit.
- Source ownership respected: the commit changes only the four files named by the Task 5 brief.

## Files

- `src/tianwen/exploration.py`
- `tests/unit/test_exploration.py`
- `tests/fixtures/exploration/search_results.json`
- `tests/fixtures/exploration/fetched_page.md`

## Implementation

- Added deterministic PydanticAI recorded search/fetch tools and live DuckDuckGo/web-fetch builders using the required public APIs.
- Added `ExplorationEngine` with governed local search, fixed-view Git inspection, prior-evidence lookup, web discovery, source fetch, and exploration reporting.
- Every local search, Git inspection, web search, and web fetch executes through `execute_action` with the Task-owning Loop's reservation and one `tool_calls` charge. Authorization denials become durable `DENIED` actions without invoking handlers or reserving usage.
- Authority is re-derived from persisted Brief → Task → Loop → Goal → Run records. Goal capabilities, run/task identity, frozen Brief equality, wall-clock expiry, persistent exploration usage, and source/domain/local-root constraints are checked before effects.
- Local exploration rejects escaping globs and unsafe queries, avoids sensitive/binary/large files, stores relative locators only, and persists content-addressed local Source/Evidence records.
- Search snippets remain discovery-only. Fetched content is hashed, stored as untrusted external source metadata plus a bounded `UntrustedSourceExcerpt`, and never alters the persisted Goal.
- Fetch validates HTTPS URLs and rejects credentials, fragments, non-standard ports, localhost, and all IP literals before an Action is created. The live web-fetch tool receives the frozen allowed-domain list so its downloader applies the same restriction to redirects.
- Identical web fetches reuse the Gateway's frozen action replay and return the prior persisted Source/Evidence without a second tool call or reservation.

## TDD evidence

1. Created fixtures and `tests/unit/test_exploration.py` first.
2. Ran `uv run pytest tests/unit/test_exploration.py -q` before implementation.
3. Observed the expected RED failure: `ModuleNotFoundError: No module named 'tianwen.exploration'`.
4. Implemented the smallest module needed for the tests, then added further RED/GREEN coverage for idempotent fetch, sensitive local-file exclusion, governed Git access, IP-literal rejection, prior-evidence scope, and sufficient-stop validation.

## Verification

All commands were run fresh immediately before commit unless stated otherwise.

```text
uv run pytest tests/unit/test_exploration.py tests/unit/test_gateway.py tests/unit/test_store.py -q
48 passed in 5.48s

uv run ruff check src/tianwen/exploration.py src/tianwen/gateway.py src/tianwen/store.py tests/unit/test_exploration.py
All checks passed!

uv run python -c "from pydantic_ai.common_tools.duckduckgo import duckduckgo_search_tool; from pydantic_ai.common_tools.web_fetch import web_fetch_tool; assert duckduckgo_search_tool(max_results=1) and web_fetch_tool(max_content_length=1000)"
exit 0

uv run pytest -q
71 passed in 8.08s

git diff --check
exit 0
```

The recorded test tools perform fixture reads only; the test suite made no network requests.

## Concerns / follow-up

- Task 6/9 can consume the governed `EvidenceRecord` and `SourceRecord` outputs. No model-facing tool inventory or provider registry was introduced.
- The Task 5 public engine intentionally has no asynchronous public surface; it uses the direct Action Gateway executor from synchronous bounded operations. Do not expose the recorded or live PydanticAI tools directly to an agent model.
