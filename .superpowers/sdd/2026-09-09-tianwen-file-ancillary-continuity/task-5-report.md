# Task 5 report: candidate identity and portable Windows CI coordination

## Status and scope

- Status: **DONE for Task 5 owned scope**, pending the root-owned Task 5 limited review, then the single final NEW-delta review, candidate pack/freeze/byte audit, and real IAB + DeepSeek acceptance.
- Task base: `603db203278db78584ec39eeb0d43940af5f2f8e`. The worktree also contained the root-owned documentation checkpoint `84f32a4167d989792a9fc1fa42deea6772522148` before this Task 5 commit.
- Runtime candidate identity is `0.1.24`; Desktop candidate identity is `0.1.0-preview.25`; Desktop embeds exactly `tianwen-runtime-bundle-0.1.24.tgz`.
- Changes are limited to the manifests, listed Runtime/Desktop version and archive constants, installer/stage/audit/verify scripts, Windows CI coordination, and the existing version/installer/Desktop/public-surface tests named in the Task 5 brief. No frozen artifact, Daily state, shortcut, runtime behavior, model path, manual delivery installation, publish/release, or historical claim document was changed.

## Candidate identity and frozen 0.1.23 authority

- The frozen `0.1.23` authority remains commit `5a30f225142d462bfca52d503cc1883257aaecaf`.
- The installer adds `0.1.23` to the existing deterministic predecessor table and routes its exact archive through the same frozen renderer already used for `0.1.11` through `0.1.22`.
- Exact archive identity, embedded version, receipt, and managed-install checks remain in force. The special `0.1.10` matcher remains independent. Every older predecessor and Daily `0.1.22` behavior remains represented.
- Tests `1153-1212` are still the small scripted-installer table; this task did not create a second matcher or a real installed-`0.1.23` upgrade cohort.

## Portable native observation and Windows CI

- Both native observer specs now resolve the DSH package portably with `createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))` and derive their suite root from `TIANWEN_FILE_TEST_ROOT`, falling back to the operating-system temporary directory. Author-specific `D:` and `E:` literals were removed from those specs.
- `installer-windows` appends, in exact order, `native-tool-observation.spec.ts`, `native-pwsh-observer.spec.ts`, `native-tools-observer.spec.ts`, `conversation-file-ancillary.spec.ts`, and `conversation-file-ancillary-runtime.spec.ts`. It supplies an isolated `${{ runner.temp }}\tianwen-native-consumer-fixtures` test root.
- `desktop-windows` appends `tianwen-native-observation-launch.spec.ts`, after the existing Runtime observer exports and Desktop build steps. It explicitly selects both opt-in cases with `TIANWEN_RUN_NATIVE_OBSERVATION_STARTUP=1` and `TIANWEN_RUN_NATIVE_OBSERVATION_JUNCTION_DIAGNOSTIC=1` and supplies separate runner-temp consumer, DSH-probe, and Task 4 evidence roots.
- No native observation test was added to Ubuntu. The workflow had no existing diagnostic upload step, so no new upload framework was introduced.
- The Python repository contract asserts exact command membership, Windows-only ownership, the Desktop opt-in flags, isolated roots, and exact `0.1.24` archive references.

## TDD RED evidence

1. Initial version and predecessor assertions:
   - Command: `D:/hermes/node/node.exe node_modules/vitest/vitest.mjs run tests/dsh-migration/runtime-bundle.spec.ts tests/dsh-migration/tianwen-desktop-artifact.spec.ts tests/dsh-migration/tianwen-installer.spec.ts -t "separates the runtime package identity from the desktop preview identity|pins preview\.25|recognizes the frozen Runtime 0\.1\.23 predecessor"`
   - Result: exit `1`; `3 failed`, `186 skipped`; wall `5.646s`.
   - Exact failures were Runtime manifest `0.1.23` versus expected `0.1.24`, Desktop `preview.24` versus expected `preview.25`, and frozen `0.1.23` classified incompatible instead of managed.
2. Windows CI contracts:
   - Command: `D:/DevData/tianwen-resume-stage-closeout-python312/Scripts/python.exe -m pytest tests/contracts/test_public_repository_surface.py -k "installer_windows_job_isolated_from_ubuntu_vitest_contract or desktop_windows_native_observation_candidate_contract"`
   - Result: exit `1`; `2 failed` in `0.23s`. The installer command lacked all five required additions and the Desktop command lacked the launch spec/opt-in coordination.
3. Desktop affected group exposed a stale future-invalid fixture:
   - Result: exit `1`; `148 passed`, `1 failed`, `1 skipped`; wall `109.77s`. The invalid-future fixture still used the now-current `0.1.24`; it was minimally advanced to `0.1.25`.
4. Strict predecessor proof:
   - The production `0.1.23` predecessor entry was temporarily removed, then only `tianwen-desktop-host.spec.ts -t "recognizes the required packaged Runtime 0\.1\.23 predecessor"` was run.
   - Result: exit `1`; `1 failed`, `69 skipped`; selected test duration `1.72s`, with the exact required-package failure. The production entry was restored immediately.
5. Fresh Runtime packaging exposed three integration gaps:
   - Correct package-working-directory Runtime bundle run: `69 passed`, `3 failed`; duration `11.63s`. The Evolution ancillary module was absent from the exact metafile input allowlist.
   - After adding only `../tianwen-evolution/dist/conversation-file-ancillary.js`, the three focused cases produced `1 passed`, `2 failed`, `69 skipped`; duration `3.59s`. The remaining status/CLI failures came from the broad forbidden-source regex matching the legitimate bare producer identity string `dsh-tool-skill`.
   - The regex was narrowed only by removing that bare token. The exact `externalImports` constraints remain unchanged, so no Runtime dependency permission was expanded.

## Focused GREEN evidence

- Initial three assertions after implementation: `3 passed`, `186 skipped`; Vitest duration `5.23s`, wall `6.293s`.
- Python Windows CI contract (fresh final check): command above; exit `0`; `2 passed`, `25 deselected` in `0.04s`, wall `0.739s`.
- Runtime/installer affected set: `controlled-lifecycle-command`, `controlled-lifecycle-profile`, `one-shot-profile-lifecycle`, `ordinary-long-goal-cli`, `portable-goal-cli`, `portable-plugin-lifecycle`, `portable-profile-composition`, `runtime-profile`, `tianwen-startup`, `tianwen-version-upgrade`, and `tianwen-installer`; exit `0`; `9 files passed`, `2 files skipped`; `176 passed`, `12 skipped`; duration `68.28s`.
- Runtime package plus Desktop artifact: `runtime-bundle.spec.ts` and `tianwen-desktop-artifact.spec.ts`; exit `0`; `83 passed`; duration `12.59s`.
- The two packaging source-regex cases after the minimal narrowing: exit `0`; `2 passed`, `70 skipped`; duration `3.50s`. Exact external-import assertions were retained.
- Desktop host: exit `0`; `70 passed`; duration `16.85s`.
- Desktop deterministic launch selection: exit `0`; `1 passed`, `27 unselected`; duration `6.76s`.
- Desktop profile preparation focused on current identity and Runtime `0.1.23`: exit `0`; `5 passed`, `67 skipped`; duration `20.69s`.
- Scripted installer Runtime `0.1.23` rows: exit `0`; `4 passed`, `102 skipped`; duration `2.31s`.
- Collection-only native/ancillary check: Vitest `list --filesOnly` over the five installer additions plus the Desktop launch spec; exit `0`; all six requested files resolved; wall `0.988s`. This was deliberately collection only, not a native execution claim.
- Runtime profile's one previously failed D-root contract: exit `0`; `1 passed`, `6 skipped`; duration `10.57s`.

## Type and build evidence

- Runtime TypeScript, all three native observer exports, and Desktop TypeScript were checked with the repository's installed TypeScript and Runtime package esbuild; exit `0`; wall `4.405s`.
- The complete Runtime build was then run from `packages/tianwen-runtime-bundle` with `D:/hermes/node/node.exe`, the package-local esbuild, existing `node_modules`, and no installation. All Runtime entries, `build-client.mjs`, type bundle, and the three observer exports completed; exit `0`; wall `17.842s`. The type bundler emitted its existing composite-project warning and completed normally.
- These current successful type/build results were not mechanically repeated after later test-only wording/allowlist assertions; production/build inputs did not change afterward.

## Failed attempts and environment boundaries

- The first type-check command pointed at a nonexistent package-local TypeScript binary and failed with `MODULE_NOT_FOUND`; wall `0.479s`. It was corrected to the installed root TypeScript path.
- The first esbuild sequence was invoked from the repository root, so metafile input paths were relative to the wrong working directory and ten packaging assertions failed. This was an invocation artifact, not a product failure.
- A subsequent full-build wrapper changed directory in-process but dynamically imported `build-client.mjs` from the evaluation module URL; ten esbuild entries succeeded, then the wrapper failed with `ERR_MODULE_NOT_FOUND`; wall `1.895s`. The successful package-working-directory build above replaced this attempt.
- Direct use of the Unicode `E:` fixture root made five installer-backed tests reject `--data-dir` as containing unsupported characters (`243 passed`, `12 skipped`, `5 failed` in that broader attempt). An exact ASCII `D:` junction to the approved `E:` suite root was used for portable consumer fixtures. The realpath-sensitive Runtime profile test correctly retained its existing real-`D:` contract and passed against one bounded Task 5 root; its semantics were not weakened for a junction.
- An initial Runtime profile retry omitted `COREPACK_HOME` and failed before the selected assertion. The corrected retry used the existing approved `D:/DevData/corepack-home` and passed as recorded above.
- A final Python filter first used the nonexistent shorthand `installer_windows_native_ancillary_membership`; it selected only the Desktop case (`1 passed`, `26 deselected` in `0.04s`, wall `0.755s`). The immediately corrected exact two-test filter is the `2 passed` result recorded above; the one-test run is not presented as the full contract gate.

## Deliberately not run

- No real native startup or junction-diagnostic case was rerun. Task 4 already supplied the accepted real-native evidence, and this task only verified collection, portable resolution, Windows selection, and candidate identity coordination.
- No model, browser, IAB, real DeepSeek, full installed-`0.1.23` upgrade, closed historical cohort, new experiment, manual delivery installation, healthcheck, or extra dependency-install command was run. The installer-backed tests did execute their normal isolated fixture installation steps; their passing counts are included above.
- No Electron installer, default Electron output, candidate package/freeze, publish, release, push, merge, shortcut, Daily directory, or frozen `0.1.23` artifact was executed or modified.

## Cleanup and retained fixtures

- No persistent Task 5 evidence bundle was created; command results are recorded in this report. Existing `consumer-evidence/task4` was preserved.
- Read-only inspection confirmed the exact junction `D:\DevData\tianwen-task5-consumer-tests` targets `E:\待清理\D盘迁移-2026-09-08\Tianwen-本地文件学习-023\consumer-tests\task5-ascii-root`.
- The safety wrapper rejected the first exact `Remove-Item` request for that junction. Per task rules, cleanup stopped immediately; no alternate command, API, move, or retry was attempted.
- Retained Task 5-only data (approximate read-only sizes):
  - Junction target `...\consumer-tests\task5-ascii-root`: `9.15 MiB` (`144` files); the junction itself adds no independent fixture copy.
  - `D:\DevData\tianwen-task5-runtime-profile`: `42.05 MiB` (`1171` files).
  - `D:\DevData\tianwen-task5-runtime-final`: `42.05 MiB` (`1171` files).
  - `...\consumer-tests\task5-red`: `0 MiB`; `task5-green`: `0 MiB`; `task5-build`: `1.27 MiB` (`1` file); `task5-runtime`: `2.13 MiB` (`11` files).
- These are residual test fixtures, not a product fault or acceptance blocker. No shared consumer-test root or evidence root was deleted.

## Handoff boundary

Root should now perform the Task 5 limited review at the exact Task 5 commit. After that review closes, root should perform the separately planned single final NEW-delta review across the complete candidate delta. Candidate pack/freeze/byte audit and the IAB + real DeepSeek acceptance remain root-owned follow-up gates; this report does not claim those gates are complete.
