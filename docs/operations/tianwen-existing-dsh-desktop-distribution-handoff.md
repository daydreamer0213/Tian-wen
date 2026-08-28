# Existing-DSH Tianwen Desktop distribution handoff

## Conclusion and decision

The frozen formal Desktop distribution proof **FAILED / is incomplete**.  The
post-run Desktop discovery bug fix is deterministically verified, but it does
not change the formal result to a pass.  Do not rerun the consumed one-shot
proof.  Continue with Task 10 whole-repository gates and review, without
claiming release readiness.

## Frozen formal product result

| Item | Recorded fact |
| --- | --- |
| Result | **FAILED / incomplete** |
| Exact harness/product SHA | `4990ff71261e727ba58488d9f39db16ad482df59` |
| One-shot boundary | Consumed; it must not be rerun for a more favorable result. |
| Controller interval | `2026-08-28T14:57:41.0765456Z` through `2026-08-28T14:58:38.5208708Z` |
| Formal proof root | `D:\DevData\tianwen-desktop-distribution\product-proof-02` |
| Formal controller log | `D:\DevData\tianwen-desktop-distribution\product-proof-02-controller.log` |
| Log SHA-256 | `dbe448a222e709e2be98b19974f9a449df3a456f36acb5b0aa9ac4acc046d7f2` |

The first unpacked missing-Profile Desktop launch exited before the native
**Create Profile** confirmation.  Discovery passed literal quoted
`"npm root -g"` and `"pnpm root -g"` command values through Node
`execFileSync` to `cmd.exe`; both command lookups failed.

No Create confirmation was shown or accepted.  The run did not reach Profile
preparation, saved-target reuse launch, silent install, installed launch,
shortcut proof, or uninstall.  It therefore proves neither B1 nor B2 product
success, and it is not full process-lifecycle proof.

## Correctable preflight history (not formal product attempts)

These preflight facts ended before product/UI/install/uninstall action.  They
are harness facts, not product results and not additional formal attempts.

| Preflight | Outcome | Preserved log and SHA-256 |
| --- | --- | --- |
| First | Windows PowerShell `-Command` consumed the intended native arguments; the root stayed empty. | `D:\DevData\tianwen-desktop-distribution\product-proof-01-controller.log`<br>`625e865eb007e7a4ea8d6d06e2222582ef1b4d6c25d90502a1f2de74db3dc952` |
| Second | Generated local UI Automation script was blocked by host execution policy before the first Desktop launch.  Its root and log remain preserved and are never reused. | `D:\DevData\tianwen-desktop-distribution\product-proof-01-controller-final.log`<br>`16a5fd0a3b88846ae8454b2cd711a560a4b3f8dae0cde9549e9bc6722f56b6da` |

## Post-run diagnosis and deterministic fix

Independent exact Node/`cmd.exe`/shim reproduction classified the frozen
failure as a Desktop product bug, not an E2E shim or controller bug.

The fix is commit `ccdc88da9e4d8d967a91eaa7c1b3ddac89327ed1`
(`fix: correct desktop global-root discovery arguments`).  It sends unquoted
command values `npm root -g` and `pnpm root -g`, while retaining `shell: false`
and the existing discovery order and independent-failure behavior.

A Windows-only real-`cmd.exe` regression first failed against the frozen
product code and then passed after this fix.  It uses the production default
runner and a temporary strict `pnpm.cmd` shim.  Implementer evidence recorded
bootstrap `22/22`, Desktop typecheck, repository typecheck, default
distribution E2E with one planned skip, and diff check.  The controller
independently repeated those relevant checks and also recorded a clean tree.
Task-scoped independent review found no Critical, Important, or Minor issue.

This evidence proves the deterministic fix only.  It does not convert the
formal one-shot result to a pass or prove the installed-product path.

## Artifact identity and tested boundaries

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Runtime source tarball `D:\DevData\tianwen-desktop-distribution\packs\tianwen-runtime-bundle-0.1.0.tgz` | 223,473 | `f0fb4dbec8776aac3c18e5efa95ddb5006dc503e30c5fa4ff1605aa6cf5dd440` |
| Unpacked executable `dist\tianwen-desktop\win-unpacked\Tianwen Desktop.exe` | 225,533,440 | `d4baf79b8fc06de442bfeb9636ca2d458e299841544b31529319032508d972a9` |
| Installer `dist\tianwen-desktop\Tianwen Desktop Setup 0.1.0-preview.1.exe` | 99,750,573 | `c807fa20c9b6645332f319f775b3ae35fc8789ce9ae32b00bcd1caac0111f03b` |

The installer/resource audit passed after electron-builder's unused elevate
helper was explicitly disabled; the exact resource allowlist remained strict.
The artifacts were built from product packaging inputs unchanged between
`2c7f53e` and formal SHA `4990ff7`.

Existing-Profile no-mutation and one-spawn/no-retry preparation boundaries
currently have deterministic test evidence only.  The formal proof did not
reach those boundaries.

## Pending work and external facts

Task 10 final whole-repository gates and final artifact rebuild are pending.
Task 10 may amend this handoff after completing those actions.  Exact-main CI
is a post-integration gate and is not part of this frozen Task 9 result.

No Provider credential or Provider model call was used.  This was supervised
Codex product development, not a Tianwen natural task, so it produced no
Tianwen learning decision or skill record.  No DSH upstream push or publication
occurred.  The preview is unsigned, internal only, and not public
release-ready.
