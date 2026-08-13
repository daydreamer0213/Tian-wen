# Task 4 Report: Recoverable Named Docker Checks

## Status

Implemented the single `DockerCheckExecutor` boundary and the narrow StateStore recovery CAS.

## RED / GREEN

- RED: `uv run pytest tests\unit\test_alpha_docker.py -q` failed during collection with `ModuleNotFoundError: No module named 'tianwen.alpha_docker'` before production code existed.
- GREEN: added fake-boundary tests for locked-down create argv, credential isolation, sanitized durable records, observed nonzero checks, invalid verifier output, created-but-never-started recovery, exact container identity, durable verifier results, timeout records, and StateStore unknown-action settlement.
- Additional RED/GREEN: exposed and fixed bind-source host paths in sanitized argv; exposed and fixed missing terminal persistence for verifier and timeout paths.

## Verification

- `uv run pytest tests\unit\test_alpha_docker.py tests\unit\test_store.py -q` — 41 passed.
- `uv run ruff check src\tianwen\alpha_docker.py src\tianwen\store.py tests\unit\test_alpha_docker.py tests\unit\test_store.py` — passed.
- `git diff --check` — passed.
- Docker tests replace the executor's private CLI boundary; they do not connect to Docker Engine, access the network, or call a model.

## Files

- `src/tianwen/alpha_docker.py` — new locked-down Docker executor, durable records, preflight, reconciliation, and terminal-only cleanup.
- `src/tianwen/store.py` — `settle_unknown_action()` narrow UNKNOWN-to-SUCCEEDED/FAILED CAS.
- `tests/unit/test_alpha_docker.py` — fake Docker-boundary coverage.
- `tests/unit/test_store.py` — focused CAS coverage.

## Self-check

- Docker uses the fixed executable boundary, fixed Linux Engine npipe endpoint, minimal inherited host environment, exact argv, no pull, no network, read-only root filesystem, non-root user, dropped capabilities, no-new-privileges, and fixed resource limits.
- The only bind mounts are the workspace and selected script. Persisted argv replaces host paths with fixed labels; records/events/errors use fixed codes or digests rather than raw stderr, environment, credentials, or host paths.
- Execution records are monotonic, persist an absolute deadline, and do not treat created-but-never-started containers as success. Recovery uses the exact prior ID and re-derived labels/config/mount layout; it never searches broadly or reruns containers.
- Handler paths do not remove containers; cleanup targets only terminal records whose linked action is terminal.

## Risk / follow-up

- This task supplies the executor and Store CAS only. The later Alpha runtime integration must call `preflight()` before model work, catch the fixed timeout as a recoverable unknown outcome, and use `settle_unknown_action()` during recovery.
- Commit SHA: recorded in the final task handoff; it is intentionally not embedded here because changing this report changes the commit SHA.

## Fix round 1

### RED / GREEN

- RED: full Docker-ID validation and container exit 125 behavior failed; the prior code accepted short IDs and treated exit 125 as Docker infrastructure failure.
- RED: recovery could not rebuild a final verifier result or persist an identity-unverified classification.
- RED: strict container configuration tests showed recovery did not validate network and accepted extra non-bind mounts.
- RED: preflight lacked a fakeable private CLI boundary and checked missing `APPDATA` after attempting Docker.
- GREEN: replaced the production-wide lifecycle test seam with private CLI/stream/inspect/log fakes that exercise create → durable record → stream → stop/wait/inspect and recovery paths.

### Fixes

- Added concurrent, bounded stdout/stderr reading. Wall and output limits stop the exact container, wait, inspect, persist the actual bounded digests in a terminal timeout result, then raise the fixed timeout.
- Create accepts exactly one 64-hex container ID. Docker CLI failures are fixed-code errors; all container exits, including 125, are observed public check results.
- Recovery validates the complete locked configuration and exactly two bind mounts, waits only until its persisted deadline, then stops/waits/inspects and reconstructs public or verifier results from bounded logs.
- Added immutable controller audit objects for `check_identity_unverified`, `check_never_started`, and `check_reconciled`.
- Removed fabricated production record helpers and the unused synchronous inspect path. Preflight now checks `APPDATA` first and exposes a fakeable JSON CLI boundary.

### Verification

- `uv run pytest tests\unit\test_alpha_docker.py tests\unit\test_store.py -q` — 43 passed.
- `uv run ruff check src\tianwen\alpha_docker.py src\tianwen\store.py tests\unit\test_alpha_docker.py tests\unit\test_store.py` — passed.
- `git diff --check` — passed.

### Remaining risk

- `cleanup_terminal()` remains a synchronous best-effort method because its public interface is synchronous; it invokes only the fixed private Docker CLI configuration and removes only after linked Action terminal state.

## Fix round 2

### RED / GREEN

- RED: the prior executor advanced `created` to `running` before attached Docker start could spawn; timeout tests also replaced `_start_stream`, bypassing real process ownership.
- RED: stop or wait failures short-circuited inspect; final timeout stored a public `CheckResult` shape instead of a verifier result.
- GREEN: tests now fake only the CLI/spawn boundary and attached streams. They cover created → spawn → running, output-limit timeout, stop failure, wait failure, still-running inspect, start spawn failure, and final timeout terminal replay.

### Fixes

- `_begin()` persists only `created`; `_start_stream()` advances to `running` immediately after successful attached-process spawn.
- Attached stdout/stderr remain concurrently and aggregate-bounded read. Timeout cancels readers, then always attempts stop, wait, exact inspect, and bounded attached-process reap.
- Stop/wait result codes and bounded stdout/stderr digests are collected without raw text. They do not prevent exact inspect.
- Exact terminal inspect persists a public timeout `CheckResult` or final/seed `VerifierResult(verdict="inconclusive", failure_categories=("timeout",))`; unverified/running control failure retains the running record with a durable `check_timeout_control_failed` audit.
- Live and recovery timeout settlement share one result helper, so final/seed replay remains type-correct.

### Verification

- `uv run pytest tests\unit\test_alpha_docker.py tests\unit\test_store.py -q` — 48 passed.
- `uv run ruff check src\tianwen\alpha_docker.py src\tianwen\store.py tests\unit\test_alpha_docker.py tests\unit\test_store.py` — passed.
- `git diff --check` — passed.

### Remaining risk

- Docker Desktop behavior is not integration-tested here by design; the private process/CLI fakes enforce the serialized arguments and recovery semantics without contacting a real Engine.

## Fix round 3

### RED / GREEN

- RED: an inspect failure during timeout control escaped before the attached Docker CLI was reaped; exact-limit output was treated as overflow; reconcile timeout returned no terminal verifier result when logs failed.
- GREEN: attached-process reap is now in the timeout control `finally` path, exact-limit EOF is accepted, and exact terminal reconcile persists an inconclusive verifier timeout even when bounded logs are unavailable.

### Fixes

- Any timeout control branch that has an attached process now attempts one bounded reap. Control/inspect failures remain fixed-code recoverable failures with a digested audit detail.
- Live timeout saves the actually captured bounded stream bytes directly, including an empty capture; it does not depend on a later `docker logs` call.
- Reconcile timeout treats logs as best effort after exact terminal identity verification. A logs failure records only a fixed/digested `logs_unavailable` audit detail and persists the correctly typed timeout result.
- Output reaches timeout only after bytes beyond the limit are observed; exactly `limit` bytes followed by EOF pass normally.

### Verification

- `uv run pytest tests\unit\test_alpha_docker.py tests\unit\test_store.py -q` — 52 passed.
- `uv run ruff check src\tianwen\alpha_docker.py src\tianwen\store.py tests\unit\test_alpha_docker.py tests\unit\test_store.py` — passed.
- `git diff --check` — passed.

### Remaining risk

- Docker Engine integration remains intentionally out of scope; all tests use fake CLI/spawn/stream boundaries and do not invoke Docker, network, or models.

## Fix round 4

### RED / GREEN

- RED: reconcile timeout allowed a fixed `TimeoutError` from best-effort logs to escape instead of preserving an exact-terminal verifier timeout record.
- GREEN: logs `DockerExecutionError` and fixed `TimeoutError` both use empty bounded evidence, a digested `logs_unavailable` audit detail, and persist the correctly typed public/final timeout record.

### Fixes

- The exact-terminal timeout logs fallback now catches only `DockerExecutionError` and `TimeoutError`; it does not broadly catch exceptions.
- The attached-process reaping regression now drives real `_inspect` via an exact `inspect` CLI argv timeout, confirming one reap, a recoverable running record, and only fixed/digested audit/error details.
- Added final reconcile timeout coverage for a logs `TimeoutError` and replay of the terminal `VerifierResult`.

### Verification

- `uv run pytest tests\unit\test_alpha_docker.py tests\unit\test_store.py -q` — 53 passed.
- `uv run ruff check src\tianwen\alpha_docker.py src\tianwen\store.py tests\unit\test_alpha_docker.py tests\unit\test_store.py` — passed.
- `git diff --check` — passed.
