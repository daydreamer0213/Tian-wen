# Tianwen Self-Contained Runtime Bundle Handoff

## Status and boundary

The self-contained Runtime Bundle implementation, public offline Profile proof, final repair, independent reviews, and fresh final-code gates are complete on `codex/tianwen-dsh-migration-phase-1`.

This handoff does **not** perform a migration cutover. It does not push the branch, update `main`, start the next phase, call a model or live web service, run real Docker, or modify Goal/Champion state. The default Profile remains unchanged; the three-layer Runtime installation is an explicit migration-only proof under `TIANWEN_DSH_MIGRATION_PROFILE=1`.

## Exact Git receipt

- Exact starting SHA: `3daf3f05ba36b4db0d15020afa1978465181e5da`.
- Reviewed final-code SHA: `7d7a03559618506887c48fc061c685ec726a9a58`.
- Branch: `codex/tianwen-dsh-migration-phase-1`.
- The documentation commit containing this file is the direct successor of the final-code SHA. Because a commit cannot contain its own SHA, obtain that value from `git log -1 --format=%H` or the controller's final receipt.

Task commits, in order:

| Task | Commit | Subject and scope |
| --- | --- | --- |
| Task 1 | `7b344f6fa9547431b42f29359e7fac7b86535f7a` | `feat: bundle the tianwen runtime for dsh` — creates the single npm-packable Runtime Bundle and exact archive/closure contracts. |
| Task 2 | `86cd0167825bb558f8af6cdba6fdaf32227e784e` | `test: prove the tianwen runtime profile install` — adds the opt-in public offline Profile proof. |
| Task 2 repair 1 | `00683870969f518eb2fb14de6aa1137c5ee5f44f` | `test: harden the tianwen runtime profile proof` — closes the first review round's installation, report, and default-path gaps. |
| Task 2 repair 2 | `0ee7c5e336da7b2ac9b38e9e37bdc56e69e421e5` | `test: complete the runtime profile proof` — closes remaining report retention and forbidden-reference authority gaps. |
| Task 2 repair 3 | `1d4100e946c01405c417ccb9675f155ae6b5134e` | `test: lock runtime bundle shipment evidence` — locks the complete shipped-text scan and fixed System32 tar boundary. |
| Final Task 3 repair | `7d7a03559618506887c48fc061c685ec726a9a58` | `fix: clear stale profile reports before preflight` — fail-closes canonical Profile reports before probe-root validation. |

## RED/GREEN evidence

Task 1:

- Initial RED: the focused Runtime Bundle test failed with `ENOENT` because `packages/tianwen-runtime-bundle/package.json` did not exist.
- Product-boundary GREEN: the manifest, package files, and lock importer satisfied the focused contract.
- External-closure RED: the first build exposed Cordis plus 21 unwanted `@deepseek-ai/dsh-*` externals through the broad compat index.
- Closure GREEN: the narrow public `@tianwen/dsh-compat/runtime` seam and build alias reduced the non-Node external set to exactly `@deepseek-ai/cordis`.
- Pack GREEN: the archive contains exactly the five approved files and rejects source, `node_modules`, metafile, runtime declarations, probe/adapter references, Tianwen runtime dependencies, and private DSH paths.

Task 2:

- Migration-mode RED: the existing verifier installed only the probe Bundle and did not publish `migration-profile-report.json` or the Runtime layer.
- Initial GREEN proved the opt-in public `dsh plugin --profile tianwen-probe add --offline <tarball>` path, Runtime import, three-layer order, dump row, and zero forbidden effects.
- Independent review then found four Important and one Minor gaps. Three narrow repair commits added topological build authority, exact current-run tarball/installed-file proof, full shipped-text forbidden-reference scanning, atomic/fail-closed report semantics, default-path regression coverage, fixed probe root/evolution root, and a realpath/file-checked System32 `tar.exe` with fixed argv.
- Task 2 final focused GREEN: 4 passed, 1 skipped; regression GREEN: 14 passed, 2 skipped; final Task 2 review C0/I0/M0, Ready yes.

Final repair:

- RED: after a prior success, a migration invocation with empty `TIANWEN_DSH_PROBE_ROOT` exited 1 but left the stale success report; focused result was 1 failed, 4 passed, 1 skipped.
- GREEN: Windows clears only the mode-specific canonical report before `requireProbeRoot()`; validated-root cleanup and atomic successful publication remain. Focused migration result was 5 passed, 1 skipped; default/Profile regression was 11 passed, 3 skipped.

## Fresh final-code gates at `7d7a035`

Every gate ran once, strictly serially, after the final repair. The fixed Python evaluator was `D:\DevData\tianwen-dsh-probe\venv-task-6\Scripts\python.exe`; pnpm stores, virtual store, caches, TEMP/TMP, uv cache, project environment, and probe root were explicitly on `D:\DevData`.

| Gate | Final result |
| --- | --- |
| Offline frozen install | exit 0; already up to date; 0 downloads |
| DSH closure | exit 0; 187 packages exactly `0.1.0-rc.6`; 15 public surfaces |
| Private imports | exit 0; 0 violations |
| Typecheck | exit 0; clean |
| Default Node suite | 13 files passed, 1 skipped; 74 tests passed, 6 planned skips |
| Explicit migration Profile | 1 file passed; 5 tests passed, 1 planned skip; fresh report published |
| Windows local sandbox | 1 file; 3 tests passed; enforcement remains `partial` |
| Python A1–A5 author proof | 10 passed |
| Foreground full Python | 424 passed, 4 planned skips in 210.63 s |
| Ruff | exit 0; all checks passed |
| `git diff --check 3daf3f0..HEAD` | exit 0; clean |
| Pre-handoff `git status --short` | exit 0; empty |

The four full-Python skips were the disabled paid live probe, two unsupported Windows symlink cases, and the separately tested Windows ACL case. No paid/live gate was enabled. Full logs are under `D:\DevData\tianwen-task3-final-gate-logs\phase-b-7d7a035596185068`.

## Final artifacts and installed closure

These hashes were recalculated after the fresh final-code gate run; they are not inherited from the pre-repair evidence.

| Artifact | SHA-256 |
| --- | --- |
| `D:\DevData\tianwen-dsh-probe\packs\tianwen-runtime-bundle-0.0.0.tgz` | `200733DD937A4FB518A1F625CFC824DBF0AA93ABD64F25194E97ABC2036409F8` |
| `D:\DevData\tianwen-dsh-probe\migration-profile-report.json` | `856C009C90CC6CCE153E776C82FBDFD9B9E3F32E06DC939A80EDEDEAFCB5045C` |
| `packages/tianwen-runtime-bundle/dist/runtime.js` | `3C680ED36CE09F49090FC242150ADCDEA55C388F4F4523FD3E7073D5E29B7016` |

The Runtime tarball and installed Runtime root both contain exactly:

- `package.json`
- `cordis.patch.yml`
- `dist/index.js`
- `dist/index.d.ts`
- `dist/runtime.js`

The workspace metafile non-Node external set and the installed Runtime manifest dependency set are both exactly `[@deepseek-ai/cordis]`. No Tianwen package, probe fixture, adapter, DSH private path, or extra DeepSeek package remains in the runtime closure. The installed Cordis external resolves profile-locally to:

`D:\DevData\tianwen-dsh-probe\home\profiles\tianwen-probe\node_modules\@deepseek-ai\cordis\lib\index.js`

## Profile and Bundle anchors

Profile layer order is exactly:

1. `@deepseek-ai/dsh-base`
2. `@tianwen/dsh-probe-bundle`
3. `@tianwen/runtime-bundle`

The base resolves through the public DSH dependency closure to exact `0.1.0-rc.6`.

- Profile anchor: `@tianwen/dsh-probe-bundle` resolves from the real Profile manifest to `D:\DevData\tianwen-dsh-probe\home\profiles\tianwen-probe\node_modules\@tianwen\dsh-probe-bundle\dist\index.js`; identity is `tianwen-probe`, and `apply` is callable.
- Bundle anchor: `@tianwen/runtime-bundle/runtime` resolves from that Profile to `D:\DevData\tianwen-dsh-probe\home\profiles\tianwen-probe\node_modules\@tianwen\runtime-bundle\dist\runtime.js`.
- Cordis resolves from the installed Runtime Bundle's `package.json`, not from the workspace or probe fixture.
- Runtime export identity is `name = "tianwen-runtime"`, `inject = ["dynamicCordisRunner"]`, `SUPPORTED_DSH_VERSION = "0.1.0-rc.6"`, and callable `apply`.

The fresh report records zero interactive app starts, model requests, paid-model requests, live-web requests, and Docker invocations; zero credential variables were passed. Tianwen-owned process layers use `shell: false`.

## Independent review closure

- Spec reviewer `01a005b1-8868-7cc3-af80-715d6390edfd`: **Approved**, C0/I0/M0. The reviewer left five runtime-evidence provenance checks for controller confirmation; the fresh gates, artifacts, metafile, archive listing, and migration report above supply that confirmation.
- Quality reviewer `01a005b1-89c0-7870-8ce3-19fe321d1f11`: initial **C0/I1/M0**, not approved. The sole Important issue was a stale success report surviving failure before `requireProbeRoot()` completed.
- Final repair: `7d7a03559618506887c48fc061c685ec726a9a58`.
- Same quality reviewer scoped re-review: **ADDRESSED**, C0/I0/M0, Ready yes. No new path broadening, mutable install input, shell change, cross-mode report deletion, or framework duplication was found.

Review source reports are git-ignored under `.superpowers/sdd/2026-08-15-tianwen-self-contained-runtime-bundle/`: `task-3-spec-review.md`, `task-3-quality-review.md`, `final-repair-report.md`, and `final-repair-rereview.md`.

## Remaining risks

- **Exact rc.6 only:** DSH remains Developer Preview `0.1.0-rc.6`. Future versions are not covered; an upgrade requires rerunning the whole compatibility and shipment contract.
- **Windows partial sandbox:** local enforcement proves ordinary read-only/workspace-write boundaries, not sibling/outside-root strong isolation. High-risk code still requires a container, remote runner, or microVM.
- **Fixed installer exception:** the upstream rc.6 Windows plugin CLI internally uses `shell: true` only for the fixed one-time offline Profile install. Version, Profile, tarball basename/path, D-drive roots, and argv are fixed; there is no user/model input or credential. Tianwen's outer process remains `shell: false`. This exception must not spread to runtime or learning-asset installation.
- **Trusted-plugin model:** reviewed first-party plugins run in the trusted same process. Unknown, unreviewed, or unpromoted plugin code must not enter that process; this handoff does not add an untrusted-plugin isolation boundary.
- **A1-only evaluator:** the typed Python runtime evaluator bridge is proven only for A1. Separately, the existing Python authoring/evaluation baseline and A1–A5 task packages remain present and passed their 10-test author proof.
- **JSONL ledger:** the Evolution JSONL ledger is a probe-level, process-local, synchronously serialized implementation, not a multi-process production database. Commit-unknown and integrity failures intentionally block and require replay/operator handling; no repair daemon or migration subsystem was added.

## Explicit retained behavior and non-cutover statement

Python remains in the repository as the independent evaluator, research tool, and migration baseline. A1–A5 remain intact; this task did not replace, delete, or migrate them. The Runtime Bundle adds a deployable DSH composition seam, not a Python removal.

No migration cutover occurred. The migration Profile run used a fixed isolated proof root, the normal/default Profile contract remains without the Runtime layer, no Goal or Champion changed, no branch was pushed by this task, and `main` was not updated.
