# Task 3 implementation report

Status: DONE. Final native/pure covering gate 69/69; affected regression gate 212/212; final typecheck and runtime build/export checks pass. Ordinary startup and real-model acceptance remain the controller's next tasks, not claims of this engineering implementation.

## Scope and implementation

- Product baseline: `a92c3262ee937b90c5378accfdf49b8c80fdd4f9`; Task 1 contracts `0c112af`, Task 2 public registration API `aefca18`. Controller-only documentation commits subsequently advanced HEAD; no product dependency was replaced.
- Added the runtime ancillary observation/rebind helper. Each dispatched call retains its native call event, argument digest, execution token, scoped winning definition and native registration producer. Native tools and their definitions remain owned by the existing plugins.
- The synchronous `tools/result` listener retains the final frozen canonical result after post-execute/finalization; freeze matches the unique append result by call ID, source sequence, turn, step and content/error/meta projection. Entire persisted event digest is separate from canonical value digest.
- All task tool calls must be accounted for. Failed, unmatched, missing, duplicated, skipped or late final observations make file evidence unavailable while normal tools continue. Native file first-access captures, file-result/material/trial-receipt v1 formats remain unchanged.
- New ancillary records require `sessions.flush(agent.session) === true`, an unchanged capture boundary, and current consent before each append. Repeated stopping/steered steps retain records idempotently; final recovery rejects stale capture boundaries.
- Pwsh uses only the existing capture service and strict receipt. It checks identity, command/workdir/workspace, parser/frames/interpreter consistency and native foreground result digest with the native `kind` removed. `executionSettingsDigest` is a producer witness of actual `{spec,config}`. It is kept in the exact canonical receipt and validated structurally, **not independently recomputed from Session data**; no raw config exposure or producer changes were made.
- Skill context requires the currently configured exact admission, scope and environment; whole-definition digest and actual native name/provider/body/resource base agree. Loading text grants no script/tool authority.
- Optional `ancillaryContext` contains admitted method references and verified positive input locations only. Directory output does not project. Absent context remains omitted. Source file workers carry it and bind it in existing worker/request digests; generated `prompt/files` cases are unchanged. Both live and recovered guidance-loop file arms forward the optional field; source independence still uses the unchanged `guidanceInputDigest(requestText, files)` call.
- Added conditional worker/reviewer authority instructions only when ancillary context is present. Methods and navigation never receive factual source IDs and never enter `conversationEvidenceTexts`.
- Narrow Evolution BOM comparison fix: remove only a file-leading U+FEFF from the line comparison view. Original content and input digest retain it; non-leading U+FEFF remains normal content. This is the new native integration correction, not reopening the closed Task 1 pure contract gate.
- Controller-approved minimal contract addition after the Windows path finding: glob/grep host payloads optionally carry canonical `nativeValueJson`. Every new capture stores the actual final raw value and derives normalized paths separately. Raw bytes count toward the unchanged 65,536-byte record limit. Recovery checks raw value digest, root/call semantics, normalized payload equality, existing native event/producer binding and grep ordering. Worker context never includes raw JSON. Old records without the field retain exact shape and the prior provable recovery branch; no backfill occurs. File material/result/trial v1 formats are unchanged.

## Engineering scope and fixture ownership

All task/model responses are fixed engineering harness responses. Actual native fs/search/skill/pwsh plugins and public persistence/capture services execute, including actual Windows directory processes. This is **not real-model acceptance**. No browser/server, live model, push, merge, release, dependency installation, native producer modification, startup wiring, new preset or widened permission was used.

New local fixture/temporary paths are under:

`E:/待清理/D盘迁移-2026-09-08/Tianwen-本地文件学习-023/consumer-tests`

Owned tests accept `TIANWEN_FILE_TEST_ROOT`; local validation sets it to that approved E root. Packaging checks also set `TIANWEN_DSH_PROBE_ROOT`; native subprocess checks set `TEMP` and `TMP` there. The first RED command also ran unchanged preexisting observer/trial fixtures at their old D defaults; their existing teardown removed those temporary fixtures. All subsequent owned test runs use the E override. Daily022, shortcut, frozen023 and old acceptance results were not touched.

## Commands and verification evidence

All commands below run from `D:/DevData/tianwen-worktrees/tianwen-architecture-overview-v2-merge` unless a package workdir is stated. Node is `D:/hermes/node/node.exe`. Installed tools are invoked directly; no `pnpm run`, `pnpm exec`, install or healthcheck was used.

Common local environment:

```powershell
$env:TIANWEN_FILE_TEST_ROOT='E:/待清理/D盘迁移-2026-09-08/Tianwen-本地文件学习-023/consumer-tests'
$env:TIANWEN_DSH_PROBE_ROOT=$env:TIANWEN_FILE_TEST_ROOT
$env:TEMP=$env:TIANWEN_FILE_TEST_ROOT
$env:TMP=$env:TIANWEN_FILE_TEST_ROOT
```

### Initial clean RED

```powershell
& 'D:/hermes/node/node.exe' node_modules/vitest/vitest.mjs run tests/dsh-migration/conversation-file-ancillary-runtime.spec.ts tests/dsh-migration/conversation-file-observer.spec.ts tests/dsh-migration/conversation-file-trial.spec.ts tests/dsh-migration/conversation-file-ancillary.spec.ts
```

Exit 1: **3 failed, 48 passed; 2 failed files, 2 passed files; 10.65 s**.

- Actual native glob → read: expected no `fileUnavailable`, got `unsupported-tool`.
- Actual native read → grep: expected no `fileUnavailable`, got `unsupported-tool`.
- Leading-BOM pure regression: `conversation ancillary grep line does not match the complete captured input`.

Initial native integration GREEN after implementation and Evolution rebuild:

```powershell
& 'D:/hermes/node/node.exe' node_modules/vitest/vitest.mjs run tests/dsh-migration/conversation-file-ancillary-runtime.spec.ts
```

Exit 0: **2 passed; 4.29 s**. The first intermediate BOM runtime run had used the old Evolution `dist` export; rebuilding Evolution applied the already passing source comparison correction. Typecheck also caught and fixed the precise public `canonicalJson` import (`@tianwen/evolution/learning-intake`) and exact-optional runtime config forwarding.

### Additional focused RED/GREEN and harness corrections

- Expanded native run: **14 passed, 4 failed** (15.39 s). Three failures were test harness API mistakes, corrected to public `createScope(...).ctx`, `skills.registerProvider`, and `ShellEnvRegistry`. The fourth established that native search is an exclusive barrier: one model batch containing read/grep can have `read.result.seq < grep.call.seq`. Same-batch is not simultaneous. Persisted-rebind adversaries now test genuinely simultaneous/overlapping sequence boundaries.
- A proposed partial model-read refusal test initially failed; the controller clarified that complete bytes mean the existing host preimage, not the model-facing read window. That temporary implementation was removed. The retained positive test confirms a successful partial read plus complete host preimage permits subsequent exact grep locations, including later lines.
- Native suite before final closure additions: **36/36 passed; 43.00 s**.
- `-t 'withdrawn|fresh runtime|every ancillary append'`: **1 failed, 2 passed**, precisely revealing recovered ancillary material remained available after consent withdrawal. Fixed recovery consent binding.
- `-t 'admitted method|withdrawn'`: **1 failed, 1 passed**, precisely showing reviewer requests lacked the conditional ancillary authority instruction. Added it without changing no-context requests.
- `-t 'fresh runtime|forwards the actual explicit'` over ancillary runtime and guidance-loop specs: **3 passed, 123 unselected; 6.32 s**. Both fresh-runtime grep-only and method-bearing restores make zero model calls, and runtime forwards current configured skill admissions to the file observer.

### Affected regression gate

```powershell
& 'D:/hermes/node/node.exe' node_modules/typescript/bin/tsc -b packages/tianwen-evolution packages/tianwen-runtime-bundle --pretty false
& 'D:/hermes/node/node.exe' node_modules/vitest/vitest.mjs run tests/dsh-migration/conversation-file-ancillary-runtime.spec.ts tests/dsh-migration/conversation-file-observer.spec.ts tests/dsh-migration/conversation-file-trial.spec.ts tests/dsh-migration/conversation-file-ancillary.spec.ts tests/dsh-migration/conversation-guidance-loop.spec.ts tests/dsh-migration/conversation-claim-review.spec.ts
```

Typecheck exit 0. Tests exit 0: **6 files, 212 tests passed; 376.76 s**. This gate covers existing first preimages, v1 file trials and recovery, source/feedback guidance paths, pure ancillary bounds/BOM comparison and factual evidence projection. It is not the whole repository suite.

### Runtime build/export/patch checks

Package workdir: `packages/tianwen-runtime-bundle`.

```powershell
& 'D:/hermes/node/node.exe' node_modules/esbuild/bin/esbuild src/runtime.ts --bundle --platform=node --format=esm --target=node22 --tree-shaking=true '--external:@deepseek-ai/*' '--alias:@tianwen/dsh-compat=@tianwen/dsh-compat/runtime' --metafile=dist/runtime.meta.json --outfile=dist/runtime.js
& 'D:/hermes/node/node.exe' node_modules/esbuild/bin/esbuild src/index.ts --bundle --platform=node --format=esm --target=node22 --tree-shaking=true '--external:@deepseek-ai/*' '--alias:@tianwen/dsh-compat=@tianwen/dsh-compat/runtime' --metafile=dist/index.meta.json --outfile=dist/index.js
```

Both exit 0: runtime 1.6 MB, index 36.7 KB. Runtime dependency gate initially failed only because `src/conversation-file-ancillary.ts` was absent from its explicit allowed-source list; added that exact file, no wider wildcard.

```powershell
& 'D:/hermes/node/node.exe' node_modules/vitest/vitest.mjs run tests/dsh-migration/runtime-bundle.spec.ts -t 'executes the built runtime|bundles Tianwen code|opt-in native observation entries|native registration identity import|bundles the package root'
```

Exit 0: **5 passed, 67 deliberately unselected; 3.76 s**. Confirms built execution, existing public external seams, original native identity imports, opt-in observer exports, and ordinary patch retaining the original sole shell provider. Closed unchanged producer core and broad native provenance suites were reused rather than rerun. No pack/release command was run.

## Self-review compatibility finding and resolution

Self-review found an overly broad `startsWith('..')` check on glob roots; `..notes` is an ordinary workspace child, not traversal. A native regression exposed a second issue: actual Windows native output for its child is `..notes\\side.md`, whereas the pure payload uses `..notes/side.md`. The first exact refusal is `conversationFilePath(cwd, path) === path`. Changing only the root containment predicate did not fix that raw/canonical representation mismatch.

Interim covering run: **42 passed, 1 failed; 43 tests; 49.28 s**. The only failure was the new nested glob regression. Its observed canonical native value was `{root:'..notes', paths:['..notes\\side.md']}` and original native result was successful. The controller explicitly approved the optional raw-JSON addition described above; original presentation text/meta may be clipped or sampled and therefore was not used to guess the full canonical value. Producers, native plugins and Task 1's closed historical gate remain untouched; the optional host payload parser extension has its own new tests.

Narrow extension RED:

```powershell
& 'D:/hermes/node/node.exe' node_modules/vitest/vitest.mjs run tests/dsh-migration/conversation-file-ancillary.spec.ts tests/dsh-migration/conversation-file-ancillary-runtime.spec.ts -t 'optional canonical native JSON|nested native path spelling|two dots|legacy flat'
```

Exit 1: **3 failed, 1 passed, 65 unselected; 5.86 s**. Pure parser rejected the new optional field; actual nested glob/grep and the dot-name root were unavailable. The legacy no-field branch passed. After implementation, the three runtime cases passed; a test-only assertion incorrectly applied `not.toContain` to `JSON.stringify(undefined)` for omitted directory context and was corrected to assert the null serialization fallback.

Final covering GREEN:

```powershell
& 'D:/hermes/node/node.exe' node_modules/vitest/vitest.mjs run tests/dsh-migration/conversation-file-ancillary.spec.ts tests/dsh-migration/conversation-file-ancillary-runtime.spec.ts
```

Exit 0: **69 tests passed in 2 files; 51.44 s** (**45 native integration cases, 24 pure cases**). This supersedes the interim 42/43 result. Covers raw/canonical path separation, actual Windows backslash glob/grep, original relative-root spelling, raw/payload disagreement, original flat no-field records, unchanged record count/byte bounds, no raw JSON worker leakage, BOM content/hash preservation, exact skill admission, native directory receipt linkage, closure, consent and fresh recovery.

Final typecheck repeated directly after the optional contract addition: exit 0, no diagnostic output. Runtime rebuilt with the same esbuild command: exit 0, 1.6 MB, 51 ms. The same five targeted runtime execution/export/patch checks then passed again: **5 passed, 67 deliberately unselected; 3.83 s**. The unchanged 212-test regression group was not repeated after this narrow parser/path addition; its relevant ancillary coverage was repeated in the final 69-test gate. `git diff --check` is clean.

No unresolved implementation concern remains from self-review. Limitations are intentional: no startup activation here; no real-model acceptance; unapproved skills, uncertified/background/effectful pwsh, unsafe paths, native errors, incomplete/late/unmatched receipts and count/byte overflow remain ineligible for file learning while ordinary tool execution continues. The native execution-settings digest remains producer-witnessed under the trusted host record boundary, as explicitly documented above. Live/recovered formal and exploration arms share the two updated guidance-loop source-material forwarding points; generated cases and request/file independence digests are unchanged.

## Owned files

- `packages/tianwen-evolution/src/conversation-file-ancillary.ts`
- `packages/tianwen-runtime-bundle/src/conversation-file-ancillary.ts` (new)
- `packages/tianwen-runtime-bundle/src/conversation-file-observer.ts`
- `packages/tianwen-runtime-bundle/src/conversation-task-material.ts`
- `packages/tianwen-runtime-bundle/src/conversation-file-trial.ts`
- `packages/tianwen-runtime-bundle/src/conversation-guidance-loop.ts`
- `packages/tianwen-runtime-bundle/src/conversation-claim-review.ts`
- `packages/tianwen-runtime-bundle/src/runtime.ts`
- `tests/dsh-migration/conversation-file-ancillary-runtime.spec.ts` (new)
- `tests/dsh-migration/conversation-file-ancillary.spec.ts`
- `tests/dsh-migration/conversation-file-observer.spec.ts`
- `tests/dsh-migration/conversation-file-trial.spec.ts`
- `tests/dsh-migration/conversation-guidance-loop.spec.ts`
- `tests/dsh-migration/conversation-claim-review.spec.ts`
- `tests/dsh-migration/runtime-bundle.spec.ts`
- This report.

## Review fix round 1 — default environment and consent disposal

Status: DONE. Review/FIX_BASE `5071d125e3b22b23d1c1c29cc354c9e74eb1e191`; the two Important findings are addressed. Controller documentation commits are preserved. Only three previously owned runtime sources, two previously owned tests and this report changed. No Task 4/5, root documentation, native producer, dependency, startup preset, original source file or historical ledger changes.

### Changes and covering behavior

- `runtime.ts` now forwards its already-resolved `evolutionRoot` to the file observer, matching the guidance-loop consumer. The existing configuration test now covers both explicit configuration and omitted configuration with `ctx.baseUrl`, checking the hand-derived `root/state/evolution` default and zero engineering model requests during configuration.
- `ConversationFileAncillaryCapture.discard()` invalidates capture, deletes retained method/result/receipt fields (including rows still referenced by an async operation), and clears the pending map. Prepare/result no longer collect after invalidation. Awaited skill resolution and directory capture check validity and row ownership before writing back. Native execution and its original result are not cancelled or replaced.
- The observer invokes discard on withdrawal and on a subsequent unauthorized dispatch; its result listener does not forward results for revoked states. Repeated discard is harmless. Existing final-value deletion remains.
- Four new actual-native integration cases cover already-retained and in-flight skill definitions/results and directory receipts/results. They check immediate empty pending storage, deleted fields on previously held row references, no repopulation after async completion, and successful native results. The skill cases additionally verify no subsequent result-capture forwarding after withdrawal. The directory cases require an actual producer receipt to exist, not a fabricated return value.
- Test-only inspection of the evidence-owning map is deliberate: checking only material eligibility would not establish memory disposal. No test-only API was added to production. These remain fixed-response engineering harness runs, **not real-model acceptance**.

### Exact verification commands and observed output

All commands ran from `D:/DevData/tianwen-worktrees/tianwen-architecture-overview-v2-merge`, except the esbuild command which ran from its `packages/tianwen-runtime-bundle` subdirectory. Each validation invocation used this exact environment prefix:

```powershell
$env:TIANWEN_FILE_TEST_ROOT='E:/待清理/D盘迁移-2026-09-08/Tianwen-本地文件学习-023/consumer-tests'
$env:TIANWEN_DSH_PROBE_ROOT=$env:TIANWEN_FILE_TEST_ROOT
$env:TEMP=$env:TIANWEN_FILE_TEST_ROOT
$env:TMP=$env:TIANWEN_FILE_TEST_ROOT
```

1. RED before production changes:

```powershell
& 'D:/hermes/node/node.exe' node_modules/vitest/vitest.mjs run tests/dsh-migration/conversation-guidance-loop.spec.ts tests/dsh-migration/conversation-file-ancillary-runtime.spec.ts -t 'runtime environment and independent|discards .* on withdrawal'
```

Exit 1, start `01:42:11`, duration `6.87s`; `Test Files 2 failed (2)`, `Tests 5 failed | 1 passed | 128 skipped (134)`. Default-root assertion showed the observer received only `{ skillSources: [] }` while the guidance loop received the expected default root. Retained/in-flight method assertions failed with `expected 2 to be +0` / `expected 1 to be +0` at `expect(pending.size).toBe(0)`.

The two first directory failures (`expected false to be true` for receipt production) were a test-fixture error: the new pwsh calls omitted the native required `description` field. This is not recorded as evidence of the product defect. Added that field and reran only those cases, still before production changes:

```powershell
& 'D:/hermes/node/node.exe' node_modules/vitest/vitest.mjs run tests/dsh-migration/conversation-file-ancillary-runtime.spec.ts -t 'discards .* directory receipts'
```

Exit 1, start `01:42:37`, duration `7.35s`; `Test Files 1 failed (1)`, `Tests 2 failed | 47 skipped (49)`. Both produced real receipts, then cleanly failed the pending-empty assertion: retained `expected 2 to be +0`; in-flight `expected 1 to be +0`.

2. GREEN after the minimal production fixes, same combined command as step 1:

```text
Test Files  2 passed (2)
     Tests  6 passed | 128 skipped (134)
  Start at  01:43:32
  Duration  9.37s
```

Exit 0. Strengthened the same disposal cases afterward with immediate-clear checks and no-result-forwarding checks, then ran the final covering files:

```powershell
& 'D:/hermes/node/node.exe' node_modules/vitest/vitest.mjs run tests/dsh-migration/conversation-file-ancillary-runtime.spec.ts tests/dsh-migration/conversation-file-observer.spec.ts
```

```text
Test Files  2 passed (2)
     Tests  60 passed (60)
  Start at  01:44:38
  Duration  69.37s
```

Exit 0: 49 ancillary-native tests plus 11 observer tests. No unrelated 212-test regression rerun and no closed producer suite rerun.

3. Runtime typecheck:

```powershell
& 'D:/hermes/node/node.exe' node_modules/typescript/bin/tsc -b packages/tianwen-runtime-bundle --pretty false
```

Exit 0, no diagnostics/output, elapsed `5.95s`.

4. Changed runtime bundle build:

```powershell
& 'D:/hermes/node/node.exe' node_modules/esbuild/bin/esbuild src/runtime.ts --bundle --platform=node --format=esm --target=node22 --tree-shaking=true '--external:@deepseek-ai/*' '--alias:@tianwen/dsh-compat=@tianwen/dsh-compat/runtime' --metafile=dist/runtime.meta.json --outfile=dist/runtime.js
```

Exit 0; output `dist\runtime.js 1.6mb`, `Done in 67ms`.

5. Final default/explicit configuration plus necessary existing build/export assertions:

```powershell
& 'D:/hermes/node/node.exe' node_modules/vitest/vitest.mjs run tests/dsh-migration/conversation-guidance-loop.spec.ts tests/dsh-migration/runtime-bundle.spec.ts -t 'runtime environment and independent|executes the built runtime|bundles Tianwen code|opt-in native observation entries|native registration identity import|bundles the package root'
```

```text
Test Files  2 passed (2)
     Tests  7 passed | 150 skipped (157)
  Start at  01:45:16
  Duration  5.40s
```

Exit 0. `git diff --check` also exited 0 with no output.

### Self-review and boundaries

Both findings have direct failing-then-passing coverage. Late async writes are guarded in addition to clearing the map, and revocation does not cancel the native execution. Original persisted data, v1 material/result/trial formats, guidance digest, limits and worker projections are unchanged. All new local fixtures used the approved E consumer-tests root and test cleanup; no real model/browser/server, installation, push, merge or release occurred. No remaining concern identified within this two-finding fix scope; controller scoped re-review is next.
