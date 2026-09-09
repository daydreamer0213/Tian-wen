# Task 4 report: native observation in ordinary Desktop Web startup

Date: 2026-09-10 (Asia/Shanghai)

Branch: `codex/conversation-claim-evidence`

Required base ancestor: `41e9f673cbab3573d885ff3cade445cda3f72876`

## Result

Ordinary `startDesktopWebHost()` now prepares a narrow native-schema overlay and invokes the existing DSH Web command as `dsh web --patch <owned-temporary-patch> --host 127.0.0.1 --port 0 --no-open`. The final isolated engineering startup passed with the two observer subclasses as the sole `tools` and `pwsh-sandbox` providers, the standard preset's `glob`, `grep`, `pwsh`, and `skill` declarations and native producer identities intact, explicit native configuration preserved, and a successful certified `Get-Location` receipt. No model or browser was started.

Unsupported, ambiguous, invalid, oversize, or drifted preparation returns only `{ kind: 'stock', reason: 'observation-unavailable' }`; Desktop then starts the unchanged stock Web command without an observation claim or loss of ordinary tools.

## Implementation

- `native-observation-launch.ts` resolves public `@deepseek-ai/dsh-app-boot`, `@deepseek-ai/cordis-plugin-include.entryListSchema`, and the schema's `js-yaml` copy from the already verified installed DSH. It mirrors only bounded source discovery: DSH manifest, Web Profile manifest, ordered declared bundle manifests/patches, Profile patch, and optional home patch.
- Every source read is capped at the remaining aggregate 1 MiB plus one detection byte before parsing. Native `composeEntries` remains the patch algorithm; Desktop does not call `loadProfile`, a dump child, a profile initializer, or expression evaluation.
- Only the unique exact top-level native `tools` and `pwsh-sandbox` rows are adapted. Their closed native config plus `disabled`, `inject`, `isolate`, and `intercept` metadata is copied losslessly; guarded patches disable the originals and insert uniquely named observer rows. Unrelated rows never enter the temporary patch.
- Raw manifests, patches, absent optional files, installation-first bundle resolutions, and the generated overlay are bound and rechecked before spawn. Native skipped-name-guard output aborts before host exposure.
- Each admitted launch owns one `launch-<uuid>/observation.patch.yml` below the existing learning-loop state directory. The file/folder uses private native modes where applicable, inherits the Windows account ACL, remains until child exit, and is removed on start failure, timeout, stop, or normal exit. Nonce collisions never claim or delete an existing folder.
- `host.ts` uses one exact environment object for preparation and spawn, retains the existing readiness/navigation/process-tree boundaries, exposes only the bounded observed/stock status, and keeps stock startup available.
- Desktop packaging now includes `dist/native-observation-launch.js`; the existing B2 audit allowlist includes exactly `app/dist/native-observation-launch.js`. Historical B1 and the current version were unchanged.

## Owned files

- `packages/tianwen-desktop-host/src/native-observation-launch.ts` (new)
- `packages/tianwen-desktop-host/src/host.ts`
- `packages/tianwen-desktop-host/package.json`
- `scripts/audit-desktop-artifact.mjs` (B2 one-line addition only)
- `tests/dsh-migration/tianwen-native-observation-launch.spec.ts` (new)
- `tests/dsh-migration/tianwen-desktop-host.spec.ts`
- `tests/dsh-migration/tianwen-desktop-artifact.spec.ts`
- `tests/dsh-migration/runtime-bundle.spec.ts`
- `.superpowers/sdd/2026-09-09-tianwen-file-ancillary-continuity/task-4-report.md`

## RED evidence

All commands used `D:\hermes\node\node.exe` with installed Vitest directly and the approved E fixture/TEMP variables.

- 02:08:56: new preparation spec, focused placeholder RED: `1 failed`, 451 ms; helper absent.
- 02:15:14: Desktop host overlay CLI test: `1 failed, 62 skipped`, 553 ms; `--patch` absent.
- 02:22:34: Desktop artifact focused checks: `2 failed, 9 skipped`, 495 ms; helper absent from package manifest and forbidden by B2 allowlist.
- 02:31:59: invalid native scalar cases: `2 failed`, 597 ms; invalid rows were incorrectly admitted.
- 02:52:21: native PowerShell timer upper bound: `1 failed, 23 skipped`, 581 ms; `graceMs: 2147483648` was incorrectly admitted. The authority is installed `@deepseek-ai/dsh-pwsh-local`'s public runtime validation: positive finite values and `graceMs <= MAX_TIMER_DELAY_MS` (`0x7fffffff`).
- 02:54:43: pre-existing launch-folder collision: `1 failed, 24 skipped`, 582 ms; cleanup deleted the collision marker.

## Focused GREEN evidence

- 02:13:54: first preparation behavior: `1 passed`, 723 ms.
- 02:16:55: exact host CLI overlay: `1 passed, 62 skipped`, 557 ms.
- 02:20:08: expanded bounded preparation/drift/privacy cases: `20 passed`, 1.29 s.
- 02:21:24: overlay lifecycle/start failure/name guard/exit cleanup: `5 passed, 63 skipped`, 1.00 s.
- 02:22:58: Desktop package manifest and B2 audit: `2 passed, 9 skipped`, 503 ms.
- 02:25:04: full affected host spec after waiting for actual injected timer registration: `68 passed`, 15.07 s. The scheduling wait belongs to the test harness; product timeout semantics were unchanged.
- 02:32:31: invalid scalar fallback: `2 passed, 20 skipped`, 573 ms.
- 02:52:44: native timer upper bound fallback: `1 passed, 23 skipped`, 562 ms.
- 02:55:10: collision preserves the pre-existing folder: `1 passed, 24 skipped`, 593 ms.
- 02:59:05: complete deterministic preparation spec: `24 passed, 1 skipped`, 1.45 s. The skipped case is the explicitly selected actual startup described below.

## Actual product-start evidence and fixture iterations

Selection is explicit and fail-closed: the test runs only on Windows when `TIANWEN_RUN_NATIVE_OBSERVATION_STARTUP=1`; otherwise it is skipped. It resolves the installed DSH with `createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))`, uses the repository's built observer entries, and accepts the approved E variables with portable `tmpdir()` fallbacks. This is portable to a repository-based Windows CI job with built entries and DSH installed. It is not an installer/packaged-executable end-to-end test; Task 5 must select it in the Desktop Windows job, while packaged-artifact coverage remains the separate B2 audit.

The exact selected command shape was:

`D:\hermes\node\node.exe node_modules\vitest\vitest.mjs run tests/dsh-migration/tianwen-native-observation-launch.spec.ts -t "starts the actual Desktop Web product with both native observers and one directory receipt" --reporter=verbose`

For completeness, four failed fixture executions occurred across three distinct fixture mistakes before the final amended gate. None was treated as a product defect or real-model cohort:

1. 02:42:15, 38.34 s: the two observer providers and their explicit config were active, but the probe sampled the host-global Web tool view before accounting for Web's preset scope (`declarations: []`, `registrations: {}`); direct workspace-write PowerShell returned exit 1 without enough retained diagnostics.
2. 02:45:52, 6.40 s, and a diagnostic-repeat at 02:47:04, 6.49 s: a mistaken test-only `sandbox-policy` replacement caused `DSH Web exited before readiness (1)`. That row was removed; product code never changed permissions.
3. 02:47:47, 43.57 s: deferring the same host-global lookup merely timed out because Web deliberately disables host-plane tool rows. Read-only tracing then confirmed the public binding: `agentPresets.standingKeyFor('standard')` followed by `tools.get(name, scope)` / `tools.schemas(scope)`. It also confirmed `shell.resolve()` to `shell.run()` inside capture is the sufficient public directory-call contract.

The amended test retains bounded non-content process flags and, only on nonzero exit, the fixed fixture's native-bounded stderr (at most the configured 8192 bytes) before cleanup. Credential-like environment variables are removed from the child environment and restored afterward. The fixed command contains no user input or credentials.

Final actual gate at 02:59:42: `1 passed, 24 skipped`, 8.52 s total (8.069 s test). Proof obtained from the actual exported `startDesktopWebHost` launch:

- `host.observation` was `{ kind: 'observed' }`.
- `NativeObservedToolRuntime` and `NativeObservedPwshExecutor` were registered; their native parents were not competing providers.
- Explicit `mode: native`, `maxParallelSubCalls: 3`, PowerShell cwd/budgets, and `disabled: false` reached the runtime.
- Standard `glob`, `grep`, `pwsh`, and `skill` declarations were unchanged, and each definition reported the installed native producer/version.
- `Get-Location` exited 0 and produced `tianwen.native-pwsh-directory.v1` with the expected task/session/call identity.
- One launch overlay existed while the child ran; after `host.stop()` the launch root was empty.

This is native startup/runtime proof, not configuration-only proof. The deterministic composition tests separately prove serialization, precedence, drift/fallback, and privacy, but do not substitute for the provider/registration/directory receipt above.

## Final affected gate and build

- 03:00:21: direct Vitest over `tianwen-native-observation-launch.spec.ts`, `tianwen-desktop-host.spec.ts`, and `tianwen-desktop-artifact.spec.ts`: `3 files passed; 103 passed, 1 skipped`, 17.20 s. The one skip is the separately completed explicit actual-start gate.
- 03:01:48: direct Vitest focused on runtime package contents, `-t "packs only the deployable runtime bundle files"`: `1 passed, 71 skipped`, 5.41 s. The archive contained all six observer JS/declaration entries and no source/node_modules leakage.
- Scoped runtime observer build: direct package-local esbuild generated `native-pwsh-observer.js` (18.4 KiB), `native-tool-observation.js` (9.4 KiB), and `native-tools-observer.js` (3.9 KiB), `Done in 18ms`. An initial lookup at root `node_modules/esbuild/bin/esbuild` failed because this workspace installs esbuild package-locally; the corrected package-local command passed and no dependency was installed.
- Final Desktop type/build: `D:\hermes\node\node.exe node_modules\typescript\bin\tsc -b packages\tianwen-desktop-host\tsconfig.json --pretty false --force`, exit 0, followed by exact required-entry checks; output `desktop type/build and required observer entries: OK`, 3.50 s.

No `pnpm run`/`pnpm exec` healthcheck, dependency installation, Electron packaging, default Desktop output overwrite, model call, browser, release, or broad suite was run. The focused existing pack test invokes its established `pnpm pack` child internally to inspect the runtime archive only; it did not package Desktop.

## Privacy, fallback, and cleanup

- Full composition and unrelated provider rows stay in bounded memory only. No source content, target config, secret-like field scan, or native error is logged by product code. Temporary YAML contains only the two guarded replacements and is treated as sensitive.
- Preparation failures expose one fixed non-sensitive reason and run stock Web. Configuration selection alone is never reported as runtime observation proof.
- The fixed startup snapshot intentionally locks only the two host service rows for that child. Manual edits to those rows take effect on Desktop restart; no watcher or reload subsystem was added. Other native rows/settings retain normal behavior.
- Before cleanup, all exact approved targets resolved beneath `E:\待清理\D盘迁移-2026-09-08\Tianwen-本地文件学习-023\consumer-tests`. The three file-test roots and runtime pack root were empty. TEMP contained only DSH/Vitest artifacts timestamped during these runs. Those exact children and empty owned roots were removed. Final checks reported all five targets absent and `matching-live-node-processes=0` for `actual-startup-*`.
- Daily, the Desktop shortcut, frozen023 candidate/native-use, old model evidence, and protected default `dist/tianwen-desktop/win-unpacked` output were untouched.

## Self-review and residual concerns

- The helper is 390 lines: larger than the hoped-for “small adapter,” but its responsibilities remain exactly the bounded reader, native source discovery/schema composition, two-row validation/rendering, drift verification, and owned cleanup. No generic profile manager, wrapper registration framework, watcher, or new store was introduced. Obvious duplicate byte re-encoding was removed; verification compares the captured raw-byte digests directly.
- Windows privacy relies on inherited account ACLs because Node's POSIX mode bits are not Windows ACL primitives. The folder is under the existing owned state tree, uses exclusive file creation, unpredictable UUIDs, exact ownership checks, and bounded lifetime. An OS-level deletion failure can still leave an owned local folder; product errors remain non-sensitive and no broader cleanup target is attempted.
- The actual-start selection is repository/Windows-CI portable but not installer acceptance. It requires the job to build the observer entries and set the explicit environment flag; Task 5 owns that job wiring.
- The earlier exit-1 reason under the first workspace-write fixture remains unknown because the first fixture retained no stderr. The final approved engineering gate used the existing `DSH_PERMISSION_MODE=danger-full-access` deployment switch only inside the credential-scrubbed fixture so the deterministic directory command required no interactive approval; product code never sets or changes permissions.
