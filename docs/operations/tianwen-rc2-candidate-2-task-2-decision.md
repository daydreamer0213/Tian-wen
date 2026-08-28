# Tianwen RC2 Candidate 2 Task 2 execution decision

Date: 2026-08-28  
Candidate: `b54b5fc04a26c879dada398ef3c910ac0d9806d2`

## Decision

The rc.7-to-rc.2 product upgrade acceptance passed, but the enclosing shell command did not have a clean exit. Integration remains blocked until the separate fresh-startup acceptance passes and the final handoff preserves both facts.

Do not rerun the real upgrade. Do not relax the fresh-root guard. Proceed once with the already-planned startup acceptance against its unused roots, using the pinned local Vitest entry directly so that the pnpm execution wrapper is not part of the test-launch boundary.

## Observed Task 2 result

- The exact command was launched once from Candidate 2.
- Its first complete Vitest run passed `21/21` tests in `966.98s`. This included the real predecessor install, current upgrade, boot-free dump, real offline Profile boot, synthetic-state preservation, current-installer replay, byte-stability checks, and residue checks.
- The installed receipt is `ready`, with DSH `0.1.1-rc.2`, Runtime `0.1.0`, and archive digest `sha256:7f0065f3692ce7b15bb55bd6d12905f71cc48e15f8ad04f7facc5a5ef2527126`.
- The same captured process output then contained a second Vitest `RUN`. It reached only input validation and failed in `46ms` because `TIANWEN_DSH_UPGRADE_ROOT` was no longer empty. It did not call either installer or mutate the accepted product.
- The command therefore ended with exit code `1`; it must not be described as a clean command pass.
- Authoritative log: `D:\DevData\tianwen-rc2-integration-unlock-20260828-candidate-2\logs\upgrade.log`.
- Log SHA-256: `4B1EDD919748B40F1FB5F10C29A6DC0DD73E782B78336EE143D03053F927CB18`.

## Review finding

An independent read-only review confirmed that the first `21/21` result and surviving product state are sufficient evidence for the product upgrade behavior. It also confirmed that Vitest `run` disables watch mode, so a source-change-triggered Vite rerun is not supported by the pinned runner implementation. The second launch source remains an execution-host anomaly rather than a product or verifier failure.

This exception narrows only the controller decision after Task 2. It does not revise the frozen product acceptance, authorize another upgrade attempt, or turn the final shell exit into success.

## Frozen Task 3 boundary

- Product root: `D:\DevData\tianwen-rc2-integration-unlock-20260828-candidate-2\fresh-product`
- Environment root: `D:\DevData\tianwen-rc2-integration-unlock-20260828-candidate-2\fresh-product-environment`
- Controlled fixture root: `D:\DevData\tianwen-rc2-integration-unlock-20260828-candidate-2\controlled-fixtures`
- Log: `D:\DevData\tianwen-rc2-integration-unlock-20260828-candidate-2\logs\startup.log`
- Runner: `node node_modules/vitest/vitest.mjs run tests/dsh-migration/tianwen-startup.e2e.spec.ts`
- Provider boundary: `TIANWEN_RUN_LIVE_MODEL_TESTS=0`, no `DEEPSEEK_API_KEY`, DSH telemetry disabled.
- Attempt count: one. Any failure stops integration without retry.

The controller records the execution-host PID, exact command, start time, end time, and exit code in the startup log. No existing product, Activity, evidence, debug, or legacy root may be deleted or reused.
