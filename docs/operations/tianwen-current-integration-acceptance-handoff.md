# Tianwen current integration acceptance handoff

Date: 2026-08-28
Status: passed; the historical RC2 Candidate 3 no-go is superseded for the current branch

## Decision

The current complete branch passed a new integration acceptance once with short controller roots. The historical RC2 Candidate 3 remains an honest `5/6`, exit `1` result, but its diagnosed controller path-layout failure is no longer a permanent reason to block this branch from integration.

This result does not rename Candidate 3 as a pass. It is a separate acceptance of the current candidate after correcting only the controller's temporary path depth.

## Exact execution

- Candidate SHA: `9477f6ece15425cced348fe6d92da1d40d3167b2`.
- Branch: `codex/tianwen-desktop-host-proof`.
- Controller PID: `5796`.
- UTC start: `2026-08-28T07:23:07.8652882Z`.
- UTC end: `2026-08-28T07:28:37.3312186Z`.
- Vitest duration: `328.83s`.
- Result: `6/6` passed, exit `0`.
- Execution count: one. The command was not rerun.

The command used:

- formal product root `D:\DevData\tw-i1\f`;
- controlled fixture root `D:\DevData\tw-i1\c`;
- D-drive pnpm/Corepack stores;
- installed-startup opt-ins only;
- live-model tests disabled, Provider credentials removed, telemetry disabled.

## Evidence

- Controller log: `D:\DevData\tw-i1\accept.log`.
- Log SHA-256: `33649CF1BB62C78669583F8A359F345B06C02926D38D553E73CC769BA9A309C1`.
- Install receipt: `D:\DevData\tw-i1\f\receipts\tianwen-install.json`.
- Install receipt SHA-256: `2CD4AADD0EE4BC30514A81BEF6F07404E72CF1396A33256CA5ED37E40BA6B9A0`.
- Startup receipt: `D:\DevData\tw-i1\f\receipts\phase2-startup-receipt.json`.
- Startup receipt SHA-256: `1D1120B6E1CC127B12CB5E7EB3702858432C3596025C1CC4BE2ECE407D35A470`.
- Goal-resume receipt: `D:\DevData\tw-i1\f\receipts\phase5-goal-resume-receipt.json`.
- Goal-resume receipt SHA-256: `2087B35A8AF06BA53C8A5DC36D3F2EB585AA5E0E87151A0D82F2EBB622318BA7`.
- Runtime archive SHA-256: `7F0065F3692CE7B15BB55BD6D12905F71CC48E15F8AD04F7FACC5A5EF2527126`.

## Product and lifecycle facts

- The controlled installed fixture completed all four expected preflight stops without Provider activity.
- Its UUID product and adjacent environment were removed on successful completion. The controlled base retains only its empty `tianwen-startup` parent directory and no files.
- The formal managed installation is `ready` with exact DSH `0.1.1-rc.2`, Tianwen Runtime `0.1.0`, and pnpm `11.20.0`.
- The real installed headless command returned `TIANWEN_PHASE2_OK`, exit `0`.
- The formal offline deterministic session completed four model steps and the Goal create/status/list/resume/read-only boundaries passed.
- Independent process inspection after the command found zero command lines or executables matching `D:\DevData\tw-i1`.

These facts close the specific integration blocker caused by the old controller fixture's excessive Windows path depth. They do not by themselves turn the optional Electron host into a packaged desktop product for ordinary users; that remains a later product-distribution boundary.

## Preserved historical fact

`docs/operations/tianwen-rc2-integration-unlock-handoff.md` remains authoritative for what happened in Candidate 3:

- Candidate 3 was `5/6`, exit `1`.
- Its failure was later diagnosed as `ENAMETOOLONG` under a `143`-character product root with machine long paths disabled.
- That result is not rewritten and was not retried.

The new acceptance supersedes only the old inference that this diagnosed controller defect must permanently prevent integration of all later complete candidates.

## External and learning facts

- No real DeepSeek or other paid Provider request was made.
- No natural task, controlled Activity, learning decision, Lesson, Skill candidate, or Skill promotion was created.
- No DSH upstream push, package publication, release, GitHub workflow action, or external merge was performed.
- The result is integration/runtime evidence, not additional learning-efficacy evidence.

## Independent review

A separate read-only review returned `APPROVE` with no blocking findings. It independently matched the single-run log and digest, four controlled preflight stops and cleanup, formal receipt versions and archive digest, restored offline model selection, zero matching residual processes, and the historical-versus-current decision wording.
