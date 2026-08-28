# Tianwen RC2 startup-only Candidate 3 plan

Date: 2026-08-28  
Status: frozen before execution

## Goal

Run the corrected fresh startup acceptance once without rerunning the already accepted rc.7-to-rc.2 product upgrade.

## Preserved prior facts

- Candidate 2 upgrade product behavior passed its first complete `21/21` run. Its enclosing command later received an unexplained second test launch and exited `1`; this remains recorded in `docs/operations/tianwen-rc2-candidate-2-task-2-decision.md`.
- Candidate 2 startup finished `3/5` with exit `1`. The controlled fresh installer failed at `managed-host-deploy`; the later formal installer and replay succeeded but the test stopped at a stale Runtime `0.0.0` verifier assertion.
- Candidate 2 startup log is `D:\DevData\tianwen-rc2-integration-unlock-20260828-candidate-2\logs\startup.log`, SHA-256 `099A70E36D82F9118A87E7240D6D5475C191A71CFA937E480B160786928C4ABF`.
- The controlled installer failure is unclassified. It is not called an intermittent failure merely because the subsequent formal install succeeded.

## Exact candidate

- Verifier correction: commit `c3f17771110a75d1edf3294cdbf95fb5dab19ee7`.
- Product installer and Runtime bytes are unchanged from Candidate 2.
- This plan is committed before execution; that commit becomes the exact Candidate 3 execution SHA.

## Fresh roots

Every path below must be absent before execution. Existing paths are not deleted or reused.

- Formal product: `D:\DevData\tianwen-rc2-integration-unlock-20260828-candidate-3\fresh-product`
- Formal environment: `D:\DevData\tianwen-rc2-integration-unlock-20260828-candidate-3\fresh-product-environment`
- Controlled fixtures: `D:\DevData\tianwen-rc2-integration-unlock-20260828-candidate-3\controlled-fixtures`
- Log: `D:\DevData\tianwen-rc2-integration-unlock-20260828-candidate-3\logs\startup.log`

## Preflight

Before committing this plan:

1. Run the startup test without opt-ins; expect `4` default tests passed and `2` real tests skipped.
2. Run `pnpm run typecheck` with the D-drive pnpm store; expect success.
3. Run `git diff --check` and confirm only this plan is untracked.
4. Confirm D: has enough free space and all Candidate 3 roots are absent.

## One execution

Run exactly once from the clean Candidate 3 commit:

```powershell
$candidateRoot = 'D:\DevData\tianwen-rc2-integration-unlock-20260828-candidate-3'
$env:CI = 'true'
$env:VITEST_WATCH = 'false'
$env:TIANWEN_RUN_LIVE_MODEL_TESTS = '0'
Remove-Item Env:DEEPSEEK_API_KEY -ErrorAction SilentlyContinue
Remove-Item Env:TIANWEN_RUN_DSH_UPGRADE_E2E -ErrorAction SilentlyContinue
$env:TIANWEN_DSH_PHASE2_STARTUP = '1'
$env:TIANWEN_CONTROLLED_INSTALLED_E2E = '1'
$env:TIANWEN_E2E_DATA_DIR = "$candidateRoot\fresh-product"
$env:TIANWEN_DSH_PROBE_ROOT = "$candidateRoot\controlled-fixtures"
$env:DSH_TELEMETRY_DISABLED = '1'
$env:COREPACK_HOME = 'D:\DevData\corepack-home'
$env:PNPM_CONFIG_STORE_DIR = 'D:\DevData\pnpm-store'
$env:PNPM_CONFIG_CONFIRM_MODULES_PURGE = 'false'
$env:PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN = 'false'
node node_modules/vitest/vitest.mjs run tests/dsh-migration/tianwen-startup.e2e.spec.ts
```

The controller captures host PID, exact command, Candidate SHA, UTC start/end, output, and exit code in the log.

## Decision rule

- Pass only on one clean `6/6` result and exit `0`: four default tests plus both opt-in tests. The controlled test must complete all four Provider-preflight stops and clean its UUID product; the formal test must complete install, replay, real headless behavior, Goal/Session/evidence/read-only commands, model preflight, and state checks.
- Any failure stops integration. Do not rerun Candidate 3, do not call the controlled failure intermittent, and do not alter the result.
- No live Provider, natural task, controlled Activity execution, upgrade acceptance, npm publication, DSH upstream push, or Desktop implementation belongs to this candidate.
