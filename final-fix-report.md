# Final review fix report

Status: **DONE** for the F1 and M2 fix wave. This report is limited to the
review base `6a3b2e715b822554df32065393ea0c255136f81a` and the owned files
listed in `final-fix-brief.md`.

## Implementation

- **F1:** the configured native-Pwsh composition case now uses the existing
  `cliRequire` resolver. The old name had been renamed at the declaration but
  remained at this one executed call site.
- **M2:** `ConversationObserver.complete()` consumes the file-observer result
  at every actual `turn/end`, before it records `task-finished`. Only a
  `completed` terminal records `files`. `takeResult()` clones an eligible
  successful result first, then calls the existing `native.discard()` and
  removes the task state. Thus interrupted, failed, unavailable, and revoked
  terminals release capture state without adding `files` to their durable
  completion records. `agent/turn-stopping` remains unchanged, so a steered
  turn keeps its capture until its true terminal end.

No historical evidence, completion digest, result schema, consent behavior,
or frozen/Daily/shortcut/shared-package path was changed.

## TDD and investigation record

1. F1 RED:

   ```powershell
   & 'D:\hermes\node\node.exe' node_modules\vitest\vitest.mjs run tests\dsh-migration\native-pwsh-observer.spec.ts -t 'explicit configured composition preserves stock cwd interpreter and limits without capture'
   ```

   Exit 1: one selected test failed with `ReferenceError: nativeRequire is not
   defined` at `native-pwsh-observer.spec.ts:136`. This confirmed the stale
   renamed identifier rather than a composition or interpreter failure.

2. M2 RED, after adding state/payload release assertions to real native file
   write and interrupted-write paths:

   ```powershell
   & 'D:\hermes\node\node.exe' node_modules\vitest\vitest.mjs run tests\dsh-migration\conversation-file-observer.spec.ts -t 'keeps the first bytes while an actual approved native write changes the file|never binds an interrupted turn even when its native write already ran'
   ```

   Exit 1: both selected tests failed because the terminal task id still
   existed in the private observer state map. The success case proved the
   persisted `files` result existed at the same time; the interrupted case
   proved there was no `files` record but the raw capture state was still held.

3. The first combined GREEN exposed a test-observation timing mistake, not a
   production regression: the interrupted test captured its private reference
   from a `turn-stopping` listener after cancellation could already finish the
   turn, yielding `undefined`. The map-removal assertion had passed. The test
   now retains that reference immediately before requesting cancellation, the
   last reliable pre-terminal boundary; it continues to assert post-terminal
   map removal, `native.invalid`, and empty pending payloads.

4. Focused GREEN:

   ```powershell
   & 'D:\hermes\node\node.exe' node_modules\vitest\vitest.mjs run tests\dsh-migration\native-pwsh-observer.spec.ts tests\dsh-migration\conversation-file-observer.spec.ts -t 'explicit configured composition preserves stock cwd interpreter and limits without capture|keeps the first bytes while an actual approved native write changes the file|never binds an interrupted turn even when its native write already ran'
   ```

   Exit 0: 2 files passed; 3 selected tests passed and 32 were filtered out;
   duration 5.76 s.

## Fresh covering checks

All test fixture roots used `TIANWEN_FILE_TEST_ROOT`,
`TIANWEN_DSH_PROBE_ROOT`, `TEMP`, and `TMP` under
`E:\待清理\D盘迁移-2026-09-08\Tianwen-本地文件学习-023\consumer-tests\final-fix`.
Durable JSON test reports are under the corresponding
`consumer-evidence\final-fix` directory.

1. Full affected file-observer covering file:

   ```powershell
   & 'D:\hermes\node\node.exe' node_modules\vitest\vitest.mjs run tests\dsh-migration\conversation-file-observer.spec.ts --reporter=json --outputFile E:\待清理\D盘迁移-2026-09-08\Tianwen-本地文件学习-023\consumer-evidence\final-fix\conversation-file-observer-green.json
   ```

   Exit 0: 11/11 passed, 0 failed; JSON suite duration 11.85 s. This includes
   unavailable, revoked, completed, and interrupted file-observer paths.

2. Existing steering contract, selected only to verify that the unchanged
   stopping boundary still permits continuity before `turn/end`:

   ```powershell
   & 'D:\hermes\node\node.exe' node_modules\vitest\vitest.mjs run tests\dsh-migration\conversation-file-ancillary-runtime.spec.ts -t 'keeps repeated stopping idempotent and rejects a stale boundary after a steered step'
   ```

   Exit 0: 1 passed, 48 filtered out; duration 3.71 s.

3. An early combined run expanded to the whole native-Pwsh file before the
   final scope reminder. Its console result was not retained as evidence, so it
   was replaced with the following fresh JSON run and is reported accurately as
   an unnecessary expansion, not as a required final gate:

   ```powershell
   & 'D:\hermes\node\node.exe' node_modules\vitest\vitest.mjs run tests\dsh-migration\native-pwsh-observer.spec.ts --reporter=json --outputFile E:\待清理\D盘迁移-2026-09-08\Tianwen-本地文件学习-023\consumer-evidence\final-fix\native-pwsh-observer-green.json
   ```

   Exit 0: 24/24 passed, 0 failed; JSON suite duration 31.90 s. No further
   native-Pwsh or closed native queue was rerun.

4. Fresh Runtime typecheck, from repository root:

   ```powershell
   & 'D:\hermes\node\node.exe' node_modules\typescript\bin\tsc -b packages\tianwen-runtime-bundle --pretty false
   ```

   Exit 0 with no diagnostics, 3.4 s.

5. Fresh complete Runtime build, from
   `packages\tianwen-runtime-bundle`, used root TypeScript for the preceding
   typecheck, package-local `node_modules\esbuild\bin\esbuild` for all ten
   normal entries and the three native entries, direct `node build-client.mjs`,
   and direct `dts-bundle-generator` invocation. It produced all normal
   Runtime bundles plus `native-pwsh-observer.js`, `native-tool-observation.js`,
   and `native-tools-observer.js`; exit 0 in 18.2 s. The declaration bundler
   printed its existing composite-project warning and completed normally.

   The first direct build attempt used a package-relative declaration-generator
   path that did not exist and stopped with `MODULE_NOT_FOUND`. No source was
   changed. The corrected full rerun used the installed root pnpm-store path
   and is the successful build evidence above.

`git diff --check` exited 0 with no output after the final build.

## Deliberately not run or changed

- M1 remains deferred: no pipe-saturation stress test, loop, model, or producer
  change was introduced.
- No Desktop build, Electron/package candidate, model/browser/IAB run, install,
  dependency operation, `pnpm run`/`pnpm exec`, healthcheck, push, merge,
  release, shared-root cleanup, or historical whole-suite replay was performed.
- Existing consent and late-callback discard tests were reused by the unchanged
  `discard()` implementation rather than rerun solely as ritual.

## Self-review scope

Changed files are exactly the two owned Runtime sources, the owned native-Pwsh
and file-observer specs, and this report. The final design has one terminal
cleanup seam, no new lifecycle framework, event bus, timeout, eviction policy,
diagnostic API, or new retained state.
