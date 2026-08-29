# Existing-DSH Tianwen Desktop distribution handoff

## Conclusion and decision

The frozen formal Desktop distribution proof at `4990ff7` **FAILED / is
incomplete** and remains historical fact.  It is not rerun or rewritten as a
pass.  Its deterministic Desktop discovery defect was fixed at `ccdc88d`; the
later source-boundary fixes close at `3fe61dc`.

The changed code does not alter NSIS install/uninstall behavior or introduce a
new product lifecycle.  A second full installed-product proof would therefore
repeat a large environment-sensitive sequence without matching the scope of
the fixes.  The current source is accepted for **internal-preview integration**
on focused Windows regressions plus the deterministic Desktop CI build and
artifact audit.  This does not prove public release readiness; exact-main CI
remains the post-integration gate.

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
| Packaged Runtime resource `dist\tianwen-desktop\win-unpacked\resources\runtime\tianwen-runtime-bundle-0.1.0.tgz` | 223,473 | `f0fb4dbec8776aac3c18e5efa95ddb5006dc503e30c5fa4ff1605aa6cf5dd440` |
| Unpacked executable `dist\tianwen-desktop\win-unpacked\Tianwen Desktop.exe` | 225,533,440 | `d4baf79b8fc06de442bfeb9636ca2d458e299841544b31529319032508d972a9` |
| Installer `dist\tianwen-desktop\Tianwen Desktop Setup 0.1.0-preview.1.exe` | 99,750,573 | `48bd94750d6ed06ed3845319d7916b8ff44606fe786aab22ee5cc3c4b99f1e00` |

The fresh Task 10 rebuild audited `win-unpacked` against the same exact source
tarball.  The audit passed with the exact resource allowlist and no-second-DSH
boundary intact.  Source and packaged Runtime have identical byte length,
SHA-256, and byte-for-byte content.  Exactly one direct NSIS setup `.exe` and
the expected `win-unpacked\Tianwen Desktop.exe` were present.  Neither output
was executed.

Existing-Profile no-mutation and one-spawn/no-retry preparation boundaries
currently have deterministic test evidence only.  The formal proof did not
reach those boundaries.

## Task 10 local-gate closure (not a product-proof rerun)

The original Task 10 plan incorrectly invoked bare `pnpm exec vitest run`.
That command is invalid in this local controller shell because it omits the
required fresh probe root, probe Python, and approved Corepack environment;
the defect is in the gate plan, not a Desktop regression.  The plan correction
is `4ad6629147d1ec5cb6019406c84d19ef242d4c10`
(`docs: correct Desktop full-suite gate preconditions`).

The historical bare-command evidence remains preserved in the ignored Task 10
report: the first controller invocation lost its terminal capture at the
30-second boundary and has **no verdict**; the durable follow-up bare command
then exited `1` with 99 failures caused by missing probe/Python/Corepack
preconditions and scripted-boundary fixtures.  Neither result was a product
proof or product action.

From clean build-source SHA `4ad6629147d1ec5cb6019406c84d19ef242d4c10`,
Task 10 created the previously absent, non-reparse strict child
`D:\DevData\tianwen-desktop-distribution\task10-probe`.  Exact installed
`D:\hermes\bin\uv.exe sync --frozen --offline --dev --python 3.12` prepared
its `venv-task-6` successfully from D-drive caches (no online fallback and no
network use).  That Python imported `tianwen` from this exact worktree.  The
corrected full-suite process scoped `COREPACK_HOME` to
`D:\DevData\corepack-home`, `TIANWEN_DSH_PROBE_ROOT` to the fresh child,
`TIANWEN_DSH_PROBE_PYTHON` to that venv Python, and
`TIANWEN_DSH_MIGRATION_PROFILE=0`.

Both `TIANWEN_DESKTOP_DISTRIBUTION_E2E` and
`TIANWEN_DESKTOP_HOST_E2E` remained unset.  The corrected full suite ran once
from `2026-08-28T16:16:09.2131879Z` through
`2026-08-28T16:21:10.6777074Z`, exited `0`, and reported 61 passed / 4
planned-skipped files and 831 passed / 17 planned-skipped tests.  Therefore
both real Desktop E2Es were only default planned skips: no product rerun,
Desktop launch, install, uninstall, Profile creation, Provider/model call, or
proof-root/controller-log action occurred.

The earlier green local evidence at
`968d2308302f03b4f378764614e5db27f2d18ff0` is carried forward unchanged:
the focused Desktop suite reported 5 passed / 1 skipped files and 87 passed /
2 skipped tests; desktop-host typecheck, repository typecheck,
`check:dsh-install`, and `check:no-private-dsh-imports` each exited `0`.
After the corrected full suite, `git diff --check` exited `0`.  The final
rebuild then staged the existing Runtime tarball without repacking, built
desktop-host, completed `pack:dir` and `pack:win`, and ran the artifact audit;
each command exited `0`.

## Proportionate integration closure

The final source HEAD before this documentation update is
`3fe61dc43e639962e2cb4f30bb700075d56be61d`.  With both real Desktop E2E
opt-ins unset, the current source completed:

- Runtime and Desktop-host builds;
- four deterministic Desktop specs: `4/4` files and `88/88` tests passed;
- `pack:dir`, `pack:win`, and the unpacked artifact audit;
- exactly one NSIS installer.

The rebuilt Runtime tarball is 223,473 bytes with SHA-256
`a7921d67d458274b136564dac0cd2475d1056e313922596890b9ac3b1802db16`.
The rebuilt installer is 99,750,796 bytes with SHA-256
`e532d9ed3f0442b171b0e644857db450bf67b798fc8a23928f6e4e23345f025c`.
No Desktop product process, installer, uninstaller, Provider credential, or
Provider/model call was used by this closure gate.

The old installed-product gap remains a limit on release claims, not a reason
to repeatedly rerun an unchanged broad proof for every narrow source fix.

## Remaining external facts

## Final-review source boundary fix (post-Task-10)

The final whole-branch review identified two Important source findings after
the Task 10 build-source gate: unrecoverable saved-target settings load
failures and missing-Profile preparation below an external parent junction.
The focused source fix has fresh deterministic evidence: 39 bootstrap/Profile
tests passed, desktop-host and repository typechecks passed, and both real
Desktop E2E files remained default planned skips (no product process). The
ignored report is
`.superpowers/sdd/2026-08-28-tianwen-existing-dsh-desktop-distribution/final-review-fix-report.md`.

This is not a product-proof rerun or installed-product result.  The focused
source verification and deterministic build gate above supersede the earlier
pending-review wording for internal integration only.  Exact-main CI remains
pending until integration and is not part of the frozen Task 9 result.

No Provider credential or Provider model call was used.  This was supervised
Codex product development, not a Tianwen natural task, so it produced no
Tianwen learning decision or skill record.  No DSH upstream push or publication
occurred.  The preview is internal only and not public release-ready.
