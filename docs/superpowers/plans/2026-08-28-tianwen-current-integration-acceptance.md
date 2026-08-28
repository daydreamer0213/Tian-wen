# Tianwen current integration acceptance

Date: 2026-08-28
Status: frozen before execution

## Decision

Preserve the historical RC2 Candidate 3 result (`5/6`, exit `1`) but do not turn its controller-path failure into a permanent product no-go. Run one new acceptance against the current complete branch using short controller roots.

This is a new current-candidate boundary, not a rewrite or rerun of Candidate 3. It changes no product code, Windows long-path setting, Provider behavior, or prior evidence.

## Exact candidate

- Product branch: `codex/tianwen-desktop-host-proof`.
- Preflight product HEAD: `ad8fb611eb7c1dff3298d62712f7639f98422536`.
- This plan is the only change after preflight. The commit containing this plan is the exact execution SHA.

## Fresh short roots

All paths were absent before preflight and must remain absent before execution:

- Formal product: `D:\DevData\tw-i1\f`
- Controlled fixtures: `D:\DevData\tw-i1\c`
- Controller log: `D:\DevData\tw-i1\accept.log`

The short roots correct the diagnosed controller layout defect without changing the machine-wide long-path setting.

## Completed preflight

- Startup test without real opt-ins: `4` passed, `2` skipped, exit `0`.
- Full TypeScript typecheck: exit `0`.
- Working tree and `git diff --check`: clean.
- `D:` free space: more than 29 GB.
- No live-model, upgrade, controlled-Activity, publication, or external-upstream action is in scope.

## One execution

From the clean exact-plan commit, run `tests/dsh-migration/tianwen-startup.e2e.spec.ts` exactly once with both installed-startup opt-ins enabled, the two short roots above, D-drive package caches, telemetry disabled, and Provider credentials removed from the child environment. Capture exact SHA, UTC start/end, output, exit code, and log digest.

Setup checks and evidence inspection are not extra acceptance executions. If setup is invalid, correct it before launching Vitest. After Vitest starts, do not rerun it to select a better result.

## Decision rule

- Pass only on one `6/6`, exit `0` result, including controlled cleanup and the complete formal installed-product path.
- On pass, write a new handoff that preserves Candidate 3 as historical failure and supersedes only its permanent integration no-go inference.
- On failure, record the new result honestly and stop; do not rerun the acceptance.

