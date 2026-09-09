# Task 2 report: native tool registration observation

## Status

DONE. The runtime bundle now exports an opt-in `NativeObservedToolRuntime` that derives from the installed `ToolRuntime`, calls `super.register(definition)` unchanged, and certifies only successful registrations whose public Cordis plugin callback is exactly one of the three imported native module callbacks.

No ordinary launch/profile wiring was changed. No task metadata is serialized by this task.

## Public interface

`@tianwen/runtime-bundle/native-tools-observer` exports the named and default class `NativeObservedToolRuntime` plus:

```ts
export interface NativeToolRegistrationProducer {
  readonly package: '@deepseek-ai/dsh-tool-fs-search' | '@deepseek-ai/dsh-tool-skill' | '@deepseek-ai/dsh-tool-pwsh'
  readonly version: '0.1.1-rc.2'
  readonly adapter: 'tianwen.file-ancillary.v1'
}

nativeRegistration(definition: ToolDefinition): NativeToolRegistrationProducer | undefined
```

The query returns a new serializable producer object only while all checks still pass:

- exact original definition reference;
- exactly one native module callback matched at registration;
- original public Cordis fiber remains live with the same callback;
- the original scope still resolves that exact definition through public `tools.get`;
- model/input/output schema digest is unchanged;
- execute, finalizer, concurrency, presentation, output renderer and presentation-metadata callback references are unchanged;
- the definition has not been reused or made ambiguous.

Root, anonymous, custom, different-callback, disposed, individually unregistered, reused, ambiguous or mutated definitions return `undefined`.

The class inherits the installed parent's `Config`, `inject`, constructor defaults and lifecycle. Its public plugin diagnostic name is retained as the parent `ToolRuntime.name`.

## TDD evidence

### Initial RED

Command:

```powershell
& 'D:/hermes/node/node.exe' 'node_modules/vitest/vitest.mjs' run tests/dsh-migration/native-tools-observer.spec.ts
```

Expected failure before production implementation:

```text
FAIL tests/dsh-migration/native-tools-observer.spec.ts
Error: Cannot find module '../../packages/tianwen-runtime-bundle/src/native-tools-observer.js'
Test Files 1 failed (1)
```

This was the intended missing public implementation, not a fixture or dependency failure.

### Package/export RED

Command:

```powershell
& 'D:/hermes/node/node.exe' 'node_modules/vitest/vitest.mjs' run tests/dsh-migration/runtime-bundle.spec.ts -t 'separates the deployable|exports the opt-in native observation'
```

Expected failures before manifest/lock/build edits:

```text
2 failed | 69 skipped
peerDependencies missing @deepseek-ai/dsh-tool-fs-search and @deepseek-ai/dsh-tool-pwsh
exports['./native-tools-observer'] was undefined
```

### Individual-disposer RED

Command:

```powershell
& 'D:/hermes/node/node.exe' 'node_modules/vitest/vitest.mjs' run tests/dsh-migration/native-tools-observer.spec.ts -t 'keeps global tools'
```

Expected failure exposed a missing live-registration check: after the exact native registration disposer ran while its origin fiber remained active, `nativeRegistration()` still returned the fs-search producer. The implementation then retained the original `ScopeKey` and checked the public `tools.get(name, originScope)` winner by exact definition reference. The focused rerun passed (`1 passed | 7 skipped`).

### Final GREEN

Command:

```powershell
& 'D:/hermes/node/node.exe' 'node_modules/vitest/vitest.mjs' run tests/dsh-migration/native-tools-observer.spec.ts tests/dsh-migration/runtime-bundle.spec.ts -t 'NativeObservedToolRuntime|loads the built public provider|separates the deployable|exports the opt-in native observation|keeps every native registration identity import external'
```

Output:

```text
Test Files 2 passed (2)
Tests 11 passed | 69 skipped (80)
Duration 4.22s
```

The final run includes all eight observer tests, two parameterized built-provider compositions, and the three exact runtime-bundle export/dependency/external-import checks selected by the expression. Vitest labels the other 69 tests `skipped` because the `-t` expression did not select them; these were filtered out, not platform-conditional skips or attempted tests.

## Typecheck and build evidence

Package typecheck, using the installed compiler directly:

```powershell
& 'D:/hermes/node/node.exe' 'node_modules/typescript/bin/tsc' -b 'packages/tianwen-runtime-bundle/tsconfig.json' --pretty false
```

Result: exit code 0, no output.

New public entry build, using the package-installed bundler directly:

```powershell
& 'D:/hermes/node/node.exe' 'packages/tianwen-runtime-bundle/node_modules/esbuild/bin/esbuild' 'packages/tianwen-runtime-bundle/src/native-tools-observer.ts' --bundle --platform=node --format=esm --target=node22 --tree-shaking=true '--external:@deepseek-ai/*' --outfile='packages/tianwen-runtime-bundle/dist/native-tools-observer.js'
```

Result: exit code 0; `dist/native-tools-observer.js` built at 3.9kb in 7ms. The package build script includes the same entry in its existing externalized native-entry build group.

The built-entry test confirms these exact imports remain external: `node:crypto`, `@deepseek-ai/dsh-scope`, `@deepseek-ai/dsh-tools`, `@deepseek-ai/dsh-tool-fs-search`, `@deepseek-ai/dsh-tool-skill`, and `@deepseek-ai/dsh-tool-pwsh`.

## Native and unit scope

Native integration coverage uses the required resolver:

```ts
createRequire('D:/DevData/tianwen-real-user-retest-20260905/node_modules/@deepseek-ai/dsh/package.json')
```

It mounts the actual installed fs-search, skill and pwsh module objects through Cordis. It covers a global native layer, two independent native scopes, a pre-existing same-name scoped shadow, a scoped restriction, plugin disposal, the exact idempotent registration disposer, parent registration failure, definition/schema/reference mutation, reuse and deliberately ambiguous callback resolution. Stock and observed serializable complete declarations are compared, and observed function references are checked before and after querying certificates.

The native registration harness uses actual `SystemPrompt` and `LocalSubprocessRuntime`. Minimal inert `agents`, `skills`, `shell` and `shellEnv` services satisfy skill/pwsh registration-time injections; skill and pwsh are registered but not executed.

The observer test contains exactly one actual fs-search `glob` call per focused invocation. The final gate ran that case once through `ToolRuntime.execute` and the native packaged ripgrep path against a fresh two-file fixture under:

```text
E:/待清理/D盘迁移-2026-09-08/Tianwen-本地文件学习-023/consumer-tests/native-tools-observer-*
```

It returned only `alpha.txt`; the exact temporary directory was removed in `finally`. No model, browser or server ran, and Daily022, the shortcut, and frozen023 were untouched.

## Package changes

- Added required native peers/dev links for `@deepseek-ai/dsh-tool-fs-search` and `@deepseek-ai/dsh-tool-pwsh`, both exactly `0.1.1-rc.2`.
- Reused existing `@deepseek-ai/dsh-tool-skill`, `@deepseek-ai/dsh-tools`, `@deepseek-ai/dsh-scope` and Cordis peers.
- Added the `./native-tools-observer` export, files list entries and normal build entry.
- Added only package-local junctions for the two already installed native packages missing from `packages/tianwen-runtime-bundle/node_modules`; both targets were first resolved and version-checked under this repository's existing `node_modules/.pnpm` store. No install or shared package edit was performed.

## Files changed

- `packages/tianwen-runtime-bundle/src/native-tools-observer.ts`
- `packages/tianwen-runtime-bundle/package.json`
- `pnpm-lock.yaml`
- `tests/dsh-migration/native-tools-observer.spec.ts`
- `tests/dsh-migration/runtime-bundle.spec.ts`
- `.superpowers/sdd/2026-09-09-tianwen-file-ancillary-continuity/task-2-report.md`

## Self-review and concerns

- Confirmed the observer never writes methods onto an existing service, replaces `tools.register`, wraps the parent disposer, re-registers a native definition, modifies a native tool, or mounts a standard plugin itself.
- Confirmed `super.register` runs before observation and its exact disposer/error reference is returned/thrown even when observation lookup throws.
- Confirmed all certificate bookkeeping is instance-local weak storage; there is no process-global registration state.
- Confirmed the built entry keeps actual native module namespace imports external, preserving callback identity across the separately bundled provider.
- Confirmed no static activation or ordinary profile wiring was added; that remains Task 4.
- Configuration semantics covered here are the installed parent defaults plus preservation of an explicitly composed row's `config`, `disabled` and `inject` fields. The observer adds no configuration of its own. A disabled row is metadata-only in this test and is not passed to a loader that would skip mounting; loader/ordinary-launch activation remains out of scope.
- Focused tests were run by design. The historical full suite and model/product gates were not replayed, per the task brief.
