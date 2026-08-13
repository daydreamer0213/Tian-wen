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
