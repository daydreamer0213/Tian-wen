# Tianwen Self-Contained Runtime Bundle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and prove one offline-installable `@tianwen/runtime-bundle` tarball that contains all Tianwen Runtime/Evidence/Evolution product code while keeping DSH/Cordis external.

**Architecture:** Existing private Tianwen workspace packages remain the development source of truth. `esbuild@0.28.2` bundles their runtime code into one `dist/runtime.js`; the deployable manifest has no runtime dependency on another `@tianwen/*` package. The existing public DSH Profile installer then installs the test adapter Bundle and the Runtime Bundle, imports the Runtime Bundle from the Profile, resolves its exact external closure from the installed Bundle anchor, and records a machine-readable report.

**Tech Stack:** Node.js 22, TypeScript 6.0.3, esbuild 0.28.2, pnpm 11.20.0, Vitest 4.1.8, DeepSeek Harness 0.1.0-rc.6, Python/pytest/Ruff regression gates.

## Global Constraints

- Canonical design: `docs/superpowers/specs/2026-08-15-tianwen-self-contained-runtime-bundle-design.md` on `main`.
- Implementation branch: `codex/tianwen-dsh-migration-phase-1`; exact starting tip must be `3daf3f05ba36b4db0d15020afa1978465181e5da` locally and remotely before Task 1.
- Use the existing worktree `D:\DevData\tianwen-worktrees\phase1-task3`; do not create another worktree unless this one is unavailable.
- Keep all dependency stores, virtual stores, caches, packs, reports, temporary files, and Python environments on `D:\DevData` or inside the D-drive project worktree.
- Final product is one Tianwen tarball. `@tianwen/runtime`, `@tianwen/evidence`, `@tianwen/evolution`, and `@tianwen/dsh-compat` are build-time inputs only.
- Runtime Bundle production dependencies must be exactly the non-Node external imports emitted in `dist/runtime.js`; expected first implementation is only `@deepseek-ai/cordis@4.0.1`.
- Bundle all Tianwen runtime code; never bundle `node_modules/@deepseek-ai/**`, Cordis, native extensions, probe adapter code, or test harness code.
- Use public package-root APIs only; no `@deepseek-ai/*/src/*`, DSH fork, source copy, absolute `file:` dependency, or registry-only Tianwen package.
- The existing scripted adapter is a no-key test fixture only. The Runtime Bundle manifest, lock importer, tarball, metafile, and output must not reference `@tianwen/dsh-probe-bundle` or `/adapter`.
- Preserve existing Python Runtime and A1–A5 unchanged.
- No paid model/API-key call, live web/search/fetch, real Docker, interactive DSH app, Goal/Champion mutation outside tests, or migration cutover.
- Preserve the existing narrowly accepted Windows DSH plugin-install shell exception; all Tianwen-owned subprocesses remain fixed argv with `shell: false`.
- Follow ponytail: no new pack framework, dependency graph library, plugin manager, sandbox abstraction, database, event bus, or migration framework.
- Each task uses TDD, one implementation worker, one spec reviewer, and one quality reviewer. No later task starts while an earlier task has an open Critical or Important finding.

## File Map

### New product package

- `packages/tianwen-runtime-bundle/package.json` — deployable manifest, exact external dependency and exact build command.
- `packages/tianwen-runtime-bundle/tsconfig.json` — follows the existing package TypeScript layout.
- `packages/tianwen-runtime-bundle/src/index.ts` — no-op DSH Bundle root identity.
- `packages/tianwen-runtime-bundle/src/runtime.ts` — re-exports the existing Tianwen Runtime as the esbuild entry.
- `packages/tianwen-runtime-bundle/cordis.patch.yml` — inserts only the Runtime plugin with the trusted D-drive evolution root.

### Tests and installer seam

- `tests/dsh-migration/runtime-bundle.spec.ts` — manifest, bundle output, metafile, archive, and public export contract.
- `tests/dsh-migration/runtime-profile.spec.ts` — default-skip and explicit real Profile installation proof.
- `scripts/verify-dsh-profile.mjs` — minimal optional migration mode reusing the existing offline Profile build/install/dump machinery.
- `pnpm-lock.yaml` — one mechanical workspace importer for the Runtime Bundle.

### Delivery evidence

- `docs/operations/tianwen-self-contained-runtime-bundle-handoff.md` — exact commits, artifact/report hashes, gates, review, and remaining risks.

---

### Task 1: Build One Self-Contained Tianwen Runtime Artifact

**Files:**

- Create: `packages/tianwen-runtime-bundle/package.json`
- Create: `packages/tianwen-runtime-bundle/tsconfig.json`
- Create: `packages/tianwen-runtime-bundle/src/index.ts`
- Create: `packages/tianwen-runtime-bundle/src/runtime.ts`
- Create: `packages/tianwen-runtime-bundle/cordis.patch.yml`
- Create: `tests/dsh-migration/runtime-bundle.spec.ts`
- Modify: `pnpm-lock.yaml`
- Conditional only after a real external-closure RED: `packages/tianwen-dsh-compat/package.json`
- Conditional only after the same RED: `packages/tianwen-dsh-compat/src/runtime.ts`

**Interfaces:**

- Consumes: `apply(ctx, { evolutionRoot })`, `inject`, `SUPPORTED_DSH_VERSION`, `TianwenEvidenceService`, and `TianwenEvolutionService` from the existing workspace packages.
- Produces: public ESM export `@tianwen/runtime-bundle/runtime` with `name`, `apply`, `inject`, and `SUPPORTED_DSH_VERSION`; `dist/runtime.meta.json` for build-time audit; one npm-packable DSH Bundle.

- [ ] **Step 1: Write the initial failing Bundle contract**

Create `tests/dsh-migration/runtime-bundle.spec.ts` with these load helpers and assertions:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')
const packageRoot = resolve(root, 'packages/tianwen-runtime-bundle')

function json(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'))
}

describe('@tianwen/runtime-bundle', () => {
  it('declares one deployable product package and no Tianwen runtime dependency', () => {
    const manifest = json(resolve(packageRoot, 'package.json')) as {
      name: string
      files: string[]
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
      exports: Record<string, unknown>
    }
    expect(manifest.name).toBe('@tianwen/runtime-bundle')
    expect(manifest.dependencies).toEqual({ '@deepseek-ai/cordis': '4.0.1' })
    expect(Object.keys(manifest.dependencies)).not.toContainEqual(
      expect.stringMatching(/^@tianwen\//u),
    )
    expect(manifest.devDependencies).toMatchObject({
      '@tianwen/runtime': 'workspace:*',
      esbuild: '0.28.2',
    })
    expect(manifest.exports).toHaveProperty('./runtime')
    expect(manifest.files).toEqual([
      'dist/index.js',
      'dist/index.d.ts',
      'dist/runtime.js',
      'cordis.patch.yml',
    ])
  })
})
```

- [ ] **Step 2: Run the RED**

Run from `D:\DevData\tianwen-worktrees\phase1-task3`:

```powershell
$env:COREPACK_HOME='D:\DevData\corepack-home'
$env:PNPM_CONFIG_STORE_DIR='D:\DevData\pnpm-store'
$env:PNPM_CONFIG_VIRTUAL_STORE_DIR='D:\DevData\tianwen-dsh-migration-phase-1\workspace-virtual-store'
node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec vitest run tests/dsh-migration/runtime-bundle.spec.ts
```

Expected: FAIL only because `packages/tianwen-runtime-bundle/package.json` is missing. Import/setup failures unrelated to the missing package do not count as RED.

- [ ] **Step 3: Add the minimal package files**

Create `package.json` with this exact product boundary:

```json
{
  "name": "@tianwen/runtime-bundle",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./runtime": {
      "default": "./dist/runtime.js"
    }
  },
  "files": [
    "dist/index.js",
    "dist/index.d.ts",
    "dist/runtime.js",
    "cordis.patch.yml"
  ],
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    }
  },
  "dependencies": {
    "@deepseek-ai/cordis": "4.0.1"
  },
  "devDependencies": {
    "@tianwen/runtime": "workspace:*",
    "esbuild": "0.28.2"
  },
  "scripts": {
    "build": "tsc -b && esbuild src/runtime.ts --bundle --platform=node --format=esm --target=node22 --tree-shaking=true --external:@deepseek-ai/* --metafile=dist/runtime.meta.json --outfile=dist/runtime.js",
    "typecheck": "tsc -b --pretty false"
  }
}
```

Create `tsconfig.json` using the existing package pattern:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "tsBuildInfoFile": "dist/.tsbuildinfo"
  },
  "include": ["src/**/*.ts"]
}
```

Create the two entries:

```ts
// src/index.ts
export const name = 'tianwen-runtime-bundle'
export function apply(): void {}
```

```ts
// src/runtime.ts
export {
  apply,
  inject,
  name,
  SUPPORTED_DSH_VERSION,
} from '@tianwen/runtime'
```

Create the one-operation patch:

```yaml
- insert:
    - id: tianwen-runtime
      name: '@tianwen/runtime-bundle/runtime'
      config:
        evolutionRoot: 'D:/DevData/tianwen-dsh-probe/evolution'
```

- [ ] **Step 4: Add the mechanical lock importer and replay offline**

Add only this importer shape to `pnpm-lock.yaml`, using the lockfile's existing exact Cordis peer-resolution string and existing `esbuild: 0.28.2` snapshot:

```yaml
  packages/tianwen-runtime-bundle:
    dependencies:
      '@deepseek-ai/cordis':
        specifier: 4.0.1
        version: 4.0.1(@deepseek-ai/cordis-plugin-include@1.0.6)(@deepseek-ai/cordis-plugin-loader@1.0.2)
    devDependencies:
      '@tianwen/runtime':
        specifier: workspace:*
        version: link:../tianwen-runtime
      esbuild:
        specifier: 0.28.2
        version: 0.28.2
```

Run:

```powershell
$env:PNPM_CONFIG_OFFLINE='true'
$env:PNPM_CONFIG_REGISTRY='http://127.0.0.1:9/'
node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs install --offline --frozen-lockfile --trust-lockfile
```

Expected: exit 0, already up to date or reused packages, zero downloads.

- [ ] **Step 5: Build the entire internal dependency chain**

Run:

```powershell
node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs --filter "@tianwen/runtime-bundle..." build
```

Expected: `dist/index.js`, `dist/index.d.ts`, `dist/runtime.js`, and `dist/runtime.meta.json` exist. `runtime.d.ts` may exist locally from `tsc`, but it is not in the package `files` list and must not enter the tarball.

- [ ] **Step 6: Extend the test to enforce the exact build closure**

Add these assertions to `runtime-bundle.spec.ts`:

```ts
it('bundles Tianwen code and leaves only Cordis as a package external', () => {
  const source = readFileSync(resolve(packageRoot, 'dist/runtime.js'), 'utf8')
  const metafile = json(resolve(packageRoot, 'dist/runtime.meta.json')) as {
    inputs: Record<string, unknown>
    outputs: Record<string, { imports: { path: string; external?: boolean }[] }>
  }
  const output = Object.entries(metafile.outputs).find(([path]) =>
    path.replaceAll('\\', '/').endsWith('/dist/runtime.js')
    || path.replaceAll('\\', '/').endsWith('dist/runtime.js'))?.[1]
  expect(output).toBeDefined()
  const packageExternals = output!.imports
    .filter(item => item.external === true && !item.path.startsWith('node:'))
    .map(item => item.path)
    .sort()
  expect(packageExternals).toEqual(['@deepseek-ai/cordis'])
  expect(Object.keys(metafile.inputs).some(path =>
    /node_modules[\\/]@deepseek-ai/u.test(path))).toBe(false)
  expect(Object.keys(metafile.inputs).some(path =>
    /scripted-adapter|test-harness|dsh-probe-bundle/u.test(path))).toBe(false)
  expect(source).not.toMatch(/from\s+["']@tianwen\//u)
  expect(source).not.toMatch(/@deepseek-ai\/[^"']+\/src\//u)
  expect(source).not.toContain('@tianwen/dsh-probe-bundle')
})
```

- [ ] **Step 7: Use the narrow compat fallback only if Step 6 is RED**

If and only if the metafile shows extra `@deepseek-ai/*` externals caused by the broad compat index, preserve that RED and add:

```ts
// packages/tianwen-dsh-compat/src/runtime.ts
export { Context, Service } from '@deepseek-ai/cordis'
export const DSH_VERSION = '0.1.0-rc.6' as const
```

Expose it as `./runtime` in `packages/tianwen-dsh-compat/package.json`, then add this one esbuild alias to the Bundle build command:

```text
--alias:@tianwen/dsh-compat=@tianwen/dsh-compat/runtime
```

Do not modify Runtime, Evidence, Evolution, or any DSH package. If Step 6 is already GREEN, skip this step and record that no compat split was needed.

- [ ] **Step 8: Pack and verify the archive contents**

Extend the test with a fixed `tar` invocation (`$env:SystemRoot\System32\tar.exe` on Windows, `tar` elsewhere), always `shell: false`. Pack to `D:\DevData\tianwen-dsh-migration-phase-1\packs`, then assert the archive entries are exactly the manifest, patch, root JS/types, and Runtime JS. Assert there is no `src/`, `node_modules/`, `runtime.d.ts`, `runtime.meta.json`, `@tianwen`, probe adapter, or private DSH path.

Run:

```powershell
node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs --filter @tianwen/runtime-bundle pack --pack-destination D:\DevData\tianwen-dsh-migration-phase-1\packs
node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec vitest run tests/dsh-migration/runtime-bundle.spec.ts
```

Expected: focused test GREEN and tarball `D:\DevData\tianwen-dsh-migration-phase-1\packs\tianwen-runtime-bundle-0.0.0.tgz` exists.

- [ ] **Step 9: Commit Task 1**

```powershell
git add -- packages/tianwen-runtime-bundle tests/dsh-migration/runtime-bundle.spec.ts pnpm-lock.yaml
git diff --cached --check
git commit -m "feat: bundle the tianwen runtime for dsh"
```

If the evidence-driven compat fallback was required, include only its two exact files in this commit and document the preceding closure RED.

---

### Task 2: Prove Public Offline DSH Profile Installation

**Files:**

- Create: `tests/dsh-migration/runtime-profile.spec.ts`
- Modify: `scripts/verify-dsh-profile.mjs`

**Interfaces:**

- Consumes: `@tianwen/runtime-bundle` tarball and its public `./runtime` export from Task 1.
- Produces: `D:\DevData\tianwen-dsh-probe\migration-profile-report.json` with layer order, Runtime import, exact external closure, config row, fixed install boundary, hashes, and forbidden-effect counts.

- [ ] **Step 1: Write the migration-mode RED**

Create `runtime-profile.spec.ts` with one default contract test and one explicit gate:

```ts
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')
const enabled = process.env.TIANWEN_DSH_MIGRATION_PROFILE === '1'

describe('Tianwen Runtime Bundle Profile', () => {
  it('keeps the real migration Profile gate opt-in', () => {
    expect(existsSync(resolve(root, 'scripts/verify-dsh-profile.mjs'))).toBe(true)
  })

  it.runIf(enabled)('installs and imports the Runtime Bundle through public DSH', () => {
    const result = spawnSync(process.execPath, [
      resolve(root, 'scripts/verify-dsh-profile.mjs'),
    ], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, TIANWEN_DSH_MIGRATION_PROFILE: '1' },
      shell: false,
      timeout: 120_000,
    })
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    const report = JSON.parse(readFileSync(
      'D:/DevData/tianwen-dsh-probe/migration-profile-report.json',
      'utf8',
    ))
    expect(report.composition.layerOrder).toEqual([
      '@deepseek-ai/dsh-base',
      '@tianwen/dsh-probe-bundle',
      '@tianwen/runtime-bundle',
    ])
    expect(report.composition.runtimeBundle).toMatchObject({
      specifier: '@tianwen/runtime-bundle/runtime',
      name: 'tianwen-runtime',
      inject: ['dynamicCordisRunner'],
      supportedDshVersion: '0.1.0-rc.6',
      externalSpecifiers: ['@deepseek-ai/cordis'],
    })
    expect(report.forbiddenEffects).toEqual({
      interactiveAppStarts: 0,
      modelRequests: 0,
      paidModelRequests: 0,
      liveWebRequests: 0,
      dockerInvocations: 0,
    })
  }, 120_000)
})
```

- [ ] **Step 2: Run the explicit RED once**

Run with the existing D-drive environment and `TIANWEN_DSH_MIGRATION_PROFILE=1`.

Expected: FAIL because the current verifier only builds/installs the probe Bundle and does not write `migration-profile-report.json`. Do not count network, Corepack, permissions, or missing D-drive setup as a product RED.

- [ ] **Step 3: Add the minimal optional migration mode to the existing verifier**

Modify `scripts/verify-dsh-profile.mjs` without changing its default Task 3 behavior:

```js
const runtimeBundlePackage = '@tianwen/runtime-bundle'
const runtimeSpecifier = `${runtimeBundlePackage}/runtime`
const runtimeTarballBasename = 'tianwen-runtime-bundle-0.0.0.tgz'
const migrationMode = process.env.TIANWEN_DSH_MIGRATION_PROFILE === '1'
```

When `migrationMode` is true, perform these exact extra actions after the probe Bundle install and before dump-config:

1. Build `@tianwen/runtime-bundle...` in topological order.
2. Pack `@tianwen/runtime-bundle` to the same fixed `packsRoot`.
3. Validate the fixed basename/current-run boundary with no user/model-controlled argv.
4. Run one additional public `dsh plugin --profile tianwen-probe add --offline <runtime tarball>` command.
5. Dump config once after both installs.

Add `parseRuntimePatch(source)` that accepts exactly this semantic object and rejects extra operations:

```js
{
  insertedRuntime: {
    id: 'tianwen-runtime',
    name: '@tianwen/runtime-bundle/runtime',
    evolutionRoot: 'D:/DevData/tianwen-dsh-probe/evolution',
  },
}
```

Add `resolveAndImportRuntimeBundle(profileManifestPath)`:

```js
export async function resolveAndImportRuntimeBundle(profileManifestPath) {
  const requireFromProfile = createRequire(realpathSync(profileManifestPath))
  const runtimeResolved = requireFromProfile.resolve(runtimeSpecifier)
  const runtimeRoot = realpathSync(resolve(dirname(runtimeResolved), '..'))
  const runtimeManifestPath = resolve(runtimeRoot, 'package.json')
  const manifest = JSON.parse(readFileSync(runtimeManifestPath, 'utf8'))
  requireAssertion(
    JSON.stringify(manifest.dependencies) === JSON.stringify({
      '@deepseek-ai/cordis': '4.0.1',
    }),
    'Runtime Bundle external manifest differs from the build contract',
  )
  const requireFromRuntime = createRequire(runtimeManifestPath)
  const cordisResolved = requireFromRuntime.resolve('@deepseek-ai/cordis')
  await import(pathToFileURL(cordisResolved).href)
  const module = await import(pathToFileURL(runtimeResolved).href)
  requireAssertion(module.name === 'tianwen-runtime', 'wrong Runtime identity')
  requireAssertion(module.SUPPORTED_DSH_VERSION === '0.1.0-rc.6', 'wrong DSH version')
  requireAssertion(JSON.stringify(module.inject) === JSON.stringify(['dynamicCordisRunner']), 'wrong inject')
  requireAssertion(typeof module.apply === 'function', 'Runtime apply is unavailable')
  return {
    specifier: runtimeSpecifier,
    resolved: runtimeResolved,
    name: 'tianwen-runtime',
    inject: module.inject,
    supportedDshVersion: module.SUPPORTED_DSH_VERSION,
    externalSpecifiers: Object.keys(manifest.dependencies).sort(),
    externalResolved: { '@deepseek-ai/cordis': cordisResolved },
  }
}
```

Read `dist/runtime.meta.json` from the workspace build and require its non-Node external set to equal the installed manifest dependency keys. Importing the Runtime module must itself succeed, so any missing Landlock-style transitive dependency fails the gate.

- [ ] **Step 4: Validate installed files and dump-config**

In migration mode assert:

- Profile bundle order is exactly base, probe fixture, Runtime Bundle.
- Installed Runtime Bundle contains only `package.json`, `cordis.patch.yml`, `dist/index.js`, `dist/index.d.ts`, and `dist/runtime.js`, allowing package-manager metadata only if pnpm itself adds it.
- The authored and installed Runtime patch are equal.
- The dump has exactly one `tianwen-runtime` row whose name is `@tianwen/runtime-bundle/runtime` and whose evolution root is the fixed D-drive path.
- Runtime Bundle manifest/metafile/output contain no probe fixture or adapter reference.
- All four Tianwen-owned build/pack/dump subprocess layers report `shell: false`; only the already-approved fixed Windows DSH plugin-add inner implementation is disclosed as `shell: true`.

Write `migration-profile-report.json` using canonical pretty JSON plus one LF. Keep the existing `profile-report.json` behavior unchanged when migration mode is absent.

- [ ] **Step 5: Run focused GREEN and regress the old Profile seam**

Run serially:

```powershell
$env:TIANWEN_DSH_MIGRATION_PROFILE='1'
node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec vitest run tests/dsh-migration/runtime-profile.spec.ts
Remove-Item Env:TIANWEN_DSH_MIGRATION_PROFILE
node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec vitest run tests/dsh-probe/profile.spec.ts tests/dsh-migration/runtime-bundle.spec.ts tests/dsh-migration/runtime-profile.spec.ts
```

Expected: explicit migration gate passes; default suite passes with only the real migration case skipped; existing probe Profile tests remain green.

- [ ] **Step 6: Commit Task 2**

```powershell
git add -- scripts/verify-dsh-profile.mjs tests/dsh-migration/runtime-profile.spec.ts
git diff --cached --check
git commit -m "test: prove the tianwen runtime profile install"
```

---

### Task 3: Final Regression, Review, Handoff, and Push

**Files:**

- Create: `docs/operations/tianwen-self-contained-runtime-bundle-handoff.md`
- Test only: existing repository gates; no product code unless a reviewer proves a Critical/Important defect.

**Interfaces:**

- Consumes: Task 1 tarball and Task 2 migration report.
- Produces: reviewed branch tip and exact remote SHA; no migration cutover.

- [ ] **Step 1: Run the final gates strictly serially**

Use the existing D-drive pnpm store/virtual store and project D-drive Python environment. Run each gate once after final code:

```powershell
node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs install --offline --frozen-lockfile --trust-lockfile
node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs run check:dsh-install
node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs run check:no-private-dsh-imports
node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs run typecheck
node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs run test:dsh
$env:TIANWEN_DSH_MIGRATION_PROFILE='1'
node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec vitest run tests/dsh-migration/runtime-profile.spec.ts
Remove-Item Env:TIANWEN_DSH_MIGRATION_PROFILE
$env:TIANWEN_RUN_DSH_SANDBOX='1'
node D:\DevData\corepack-home\v1\pnpm\11.20.0\bin\pnpm.mjs exec vitest run tests/dsh-probe/sandbox.e2e.spec.ts
Remove-Item Env:TIANWEN_RUN_DSH_SANDBOX
$env:UV_CACHE_DIR='D:\DevData\uv-cache'
uv run pytest tests/alpha/test_task_packages.py -q
uv run pytest -q
uv run ruff check .
git diff --check 3daf3f05ba36b4db0d15020afa1978465181e5da..HEAD
git status --short
```

Expected:

- offline install downloads 0;
- closure remains 187 exact rc.6 packages and all required public surfaces;
- private imports remain 0;
- typecheck clean;
- all default Node tests pass with only planned skips;
- explicit migration Profile gate passes and records a fresh report;
- sandbox remains the already-recorded Windows partial result, not falsely upgraded;
- Python A1–A5 author proof and full Python suite pass;
- Ruff/diff/status clean.

- [ ] **Step 2: Record exact artifact evidence**

Hash with `Get-FileHash -Algorithm SHA256`:

- `D:\DevData\tianwen-dsh-probe\packs\tianwen-runtime-bundle-0.0.0.tgz`
- `D:\DevData\tianwen-dsh-probe\migration-profile-report.json`
- `packages/tianwen-runtime-bundle/dist/runtime.js`

Record the metafile external set, installed file list, Profile layer order, runtime export identity, exact test counts, and zero forbidden effects.

- [ ] **Step 3: Run two-stage independent review**

Spec reviewer checks only design/plan compliance, package/archive/external closure, Profile public seam, and forbidden effects. Quality reviewer checks correctness, determinism, Windows path/process behavior, test strength, and ponytail scope. Any Critical/Important gets one narrow TDD repair wave and a fresh scoped re-review; otherwise do not refactor.

- [ ] **Step 4: Write the canonical handoff**

Create `docs/operations/tianwen-self-contained-runtime-bundle-handoff.md` with:

- exact start SHA and all Task commits;
- tarball/runtime/report hashes;
- RED/GREEN evidence;
- exact external closure and Profile-anchor/Bundle-anchor resolution evidence;
- gate counts and skips;
- review IDs and findings;
- remaining rc.6, Windows partial sandbox, fixed installer exception, trusted-plugin, A1-only evaluator, and JSONL-ledger risks;
- explicit statement that Python/A1–A5 remain and no migration cutover occurred.

- [ ] **Step 5: Commit documentation and verify locally**

```powershell
git add -- docs/operations/tianwen-self-contained-runtime-bundle-handoff.md
git diff --cached --check
git commit -m "docs: hand off the self-contained runtime bundle"
git status --short --branch
```

- [ ] **Step 6: Push without rewriting history**

Verify the remote branch still descends from the exact starting tip, then perform a normal push:

```powershell
git merge-base --is-ancestor 3daf3f05ba36b4db0d15020afa1978465181e5da HEAD
git push origin HEAD:refs/heads/codex/tianwen-dsh-migration-phase-1
git ls-remote origin refs/heads/codex/tianwen-dsh-migration-phase-1
```

If direct GitHub access fails, use only the already-authorized command-scoped proxy `http://127.0.0.1:7897`; do not change global Git configuration and do not force-push.

- [ ] **Step 7: Update the architecture master memory on main**

After the migration branch remote SHA is exact, update `docs/architecture-master-session-memory.md` on `main` with the result, artifact/report hashes, remaining risks, and next unblocked work. Commit and push that docs-only main update separately. Do not merge the migration branch or start the next implementation phase in this task.
