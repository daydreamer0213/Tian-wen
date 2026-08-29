# Tianwen Chinese Product UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Chinese Windows open Tianwen Desktop in Chinese and make the Tianwen long-task UI follow DSH's existing Chinese/English setting, with one visible language and a concise first-use workflow.

**Architecture:** Desktop supplies Chromium's provisional locale from the operating system and localizes only its own pre-Web dialogs. The Runtime Bundle client injects DSH's public locale service, registers one Tianwen `zh`/`en` namespace, and resolves all Tianwen-owned browser copy through it. DSH remains the sole language-preference authority and no Tianwen language state is persisted.

**Tech Stack:** TypeScript 6, Electron 43, React 18, DSH `0.1.1-rc.2` client locale service, Vitest 4, esbuild.

## Global Constraints

- The screen displays exactly one language at a time; never render bilingual labels.
- Chinese locale uses `长期任务`; English locale uses `Learn Loop`.
- DSH `locale.preference` remains the only saved Web-language preference.
- Tianwen adds no language settings page, tutorial framework, DSH fork, model request, natural task, or controlled Activity.
- Existing `tianwen.*` schemas, RPC payloads, stored user text, CLI output, Goal/Session behavior, and process lifecycle remain unchanged.
- Large build, dependency, proof, and temporary data remain on `D:`.
- Each implementation task uses RED → GREEN and ends with a focused commit.

---

### Task 1: Desktop system locale and native copy

**Files:**
- Create: `packages/tianwen-desktop-host/src/locale.ts`
- Modify: `packages/tianwen-desktop-host/src/main.ts`
- Modify: `packages/tianwen-desktop-host/src/bootstrap.ts`
- Modify: `packages/tianwen-desktop-host/package.json`
- Test: `tests/dsh-migration/tianwen-desktop-locale.spec.ts`
- Test: `tests/dsh-migration/tianwen-desktop-bootstrap.spec.ts`

**Interfaces:**
- Produces: `desktopLocale(systemLocale?: string): 'zh' | 'en'`.
- Produces: `chromiumLocale(locale: 'zh' | 'en'): 'zh-CN' | 'en'`.
- Produces: `desktopCopy(locale: 'zh' | 'en')`, one fixed object containing all Tianwen-owned bootstrap/profile/fatal-dialog headings, actions, and instructions.
- Changes: `createDesktopBootstrapInteractions(dialog, locale?)`; omitted locale retains deterministic English behavior in existing tests.

- [ ] **Step 1: Write the failing locale tests**

Create `tests/dsh-migration/tianwen-desktop-locale.spec.ts` with literal expectations:

```ts
import { describe, expect, it } from 'vitest'
import { chromiumLocale, desktopCopy, desktopLocale } from '../../packages/tianwen-desktop-host/src/locale.js'

describe('Tianwen Desktop locale', () => {
  it.each([
    ['zh-CN', 'zh'],
    ['zh-Hans-CN', 'zh'],
    ['en-US', 'en'],
    ['ja-JP', 'en'],
  ] as const)('maps system locale %s to %s', (system, expected) => {
    expect(desktopLocale(system)).toBe(expected)
  })

  it('uses a Chinese Chromium locale only for the Chinese product locale', () => {
    expect(chromiumLocale('zh')).toBe('zh-CN')
    expect(chromiumLocale('en')).toBe('en')
  })

  it('keeps native copy in one selected language', () => {
    expect(desktopCopy('zh').selectNodeTitle).toBe('选择 Node 可执行文件')
    expect(desktopCopy('en').selectNodeTitle).toBe('Select Node executable')
  })
})
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```powershell
pnpm exec vitest run tests/dsh-migration/tianwen-desktop-locale.spec.ts
```

Expected: FAIL because `src/locale.ts` does not exist.

- [ ] **Step 3: Implement the pure locale boundary**

Create `locale.ts` without a dependency:

```ts
export type DesktopLocale = 'zh' | 'en'

export function desktopLocale(systemLocale = Intl.DateTimeFormat().resolvedOptions().locale): DesktopLocale {
  try {
    return new Intl.Locale(systemLocale).language === 'zh' ? 'zh' : 'en'
  } catch {
    return 'en'
  }
}

export function chromiumLocale(locale: DesktopLocale): 'zh-CN' | 'en' {
  return locale === 'zh' ? 'zh-CN' : 'en'
}
```

Add a literal `COPY` record and `desktopCopy(locale)` for the existing titles,
headings, buttons, and next-action instructions from `bootstrap.ts` and
`main.ts`. Do not translate upstream diagnostic `reason` or filesystem paths.

- [ ] **Step 4: Make the focused locale test GREEN**

Run the Step 2 command. Expected: all locale tests PASS.

- [ ] **Step 5: Add failing bootstrap tests for selected copy**

Extend `tianwen-desktop-bootstrap.spec.ts` to call
`createDesktopBootstrapInteractions(dialog, 'zh')` and assert the real dialog
options contain:

```ts
expect(dialog.showOpenDialog).toHaveBeenNthCalledWith(1, expect.objectContaining({
  title: '选择 Node 可执行文件',
}))
expect(dialog.showMessageBox).toHaveBeenCalledWith(expect.objectContaining({
  message: '已保存的 Tianwen Desktop 目标无效',
}))
```

Run:

```powershell
pnpm exec vitest run tests/dsh-migration/tianwen-desktop-bootstrap.spec.ts
```

Expected: FAIL because the factory still uses English literals and accepts no locale.

- [ ] **Step 6: Wire locale into the packaged app**

In `main.ts`, before `app.whenReady()` is reached, compute the locale once and
set Chromium's provisional language:

```ts
const locale = desktopLocale()
app.commandLine.appendSwitch('lang', chromiumLocale(locale))
```

Pass `locale` to `createDesktopBootstrapInteractions`. Use `desktopCopy(locale)`
for the missing-Profile confirmation, manual-preparation information, and fatal
startup dialog. Keep `reason`, `profileRoot`, and `command` as untranslated
details. In `bootstrap.ts`, replace its Tianwen-owned English literals with the
selected copy object. Do not read or write `$DSH_HOME/settings.yaml`.

Add `dist/locale.js` to the Desktop package's explicit `build.files` allowlist;
the packaged `main.js` imports it directly.

- [ ] **Step 7: Run focused Desktop verification**

Run:

```powershell
pnpm exec vitest run tests/dsh-migration/tianwen-desktop-locale.spec.ts tests/dsh-migration/tianwen-desktop-bootstrap.spec.ts tests/dsh-migration/tianwen-desktop-host.spec.ts
pnpm --filter '@tianwen/desktop-host' typecheck
```

Expected: all tests and typecheck PASS.

- [ ] **Step 8: Commit Task 1**

```powershell
git add -- packages/tianwen-desktop-host/src/locale.ts packages/tianwen-desktop-host/src/main.ts packages/tianwen-desktop-host/src/bootstrap.ts packages/tianwen-desktop-host/package.json tests/dsh-migration/tianwen-desktop-locale.spec.ts tests/dsh-migration/tianwen-desktop-bootstrap.spec.ts
git commit -m "feat: follow the system locale in Tianwen Desktop"
```

---

### Task 2: DSH-locale-aware long-task UI

**Files:**
- Modify: `packages/tianwen-runtime-bundle/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `packages/tianwen-runtime-bundle/src/client.tsx`
- Modify: `tests/dsh-migration/learn-loop-client.spec.ts`
- Modify: `tests/dsh-migration/learn-loop-client-module.spec.ts`
- Modify: `tests/dsh-migration/runtime-bundle.spec.ts`

**Interfaces:**
- Consumes: DSH `ctx.locale.register(namespace, locale, dictionary)`, `bind(namespace)`, `getSnapshot()`, and `subscribe(listener)`.
- Produces: client manifest injection of `@deepseek-ai/dsh-client-locale`.
- Produces: one internal namespace `tianwen.learn-loop` with complete `zh` and `en` dictionaries.
- Preserves: `taskAction()` business decisions and its existing English semantic labels; rendering translates those labels and known fixed reasons at the UI boundary.

- [ ] **Step 1: Add failing compiled-client locale tests**

Extend the compiled client test harness with a real in-memory locale double that
stores registered dictionaries, exposes an active `zh | en` snapshot, and
notifies subscribers. The double must translate literal keys from the registered
dictionary and perform no RPC.

Add a test that renders in `zh` and asserts:

```ts
expect(findElement(tree, element => element.props['aria-label'] === '长期任务')).toBeDefined()
expect(text(tree)).toContain('还没有长期任务')
expect(text(tree)).toContain('在 DSH 中打开或创建一个项目工作区')
expect(text(tree)).not.toContain('No Learn Loop plans yet')
```

Then switch the same locale double to `en`, render again, and assert `Learn
Loop` appears while `长期任务` does not. Record the RPC call count before the
switch and assert it is unchanged after the switch.

- [ ] **Step 2: Verify the client test is RED**

Run:

```powershell
pnpm --filter '@tianwen/runtime-bundle' build
pnpm exec vitest run tests/dsh-migration/learn-loop-client-module.spec.ts
```

Expected: FAIL because the client does not inject/register/subscribe to locale
and still renders English literals.

- [ ] **Step 3: Add the exact optional locale package boundary**

In the Runtime Bundle manifest:

```json
"dsh": {
  "client": {
    "inject": [
      "@deepseek-ai/dsh-client-connection",
      "@deepseek-ai/dsh-client-runtime",
      "@deepseek-ai/dsh-client-ui-sidebar",
      "@deepseek-ai/dsh-client-locale"
    ]
  }
}
```

Add exact `0.1.1-rc.2` locale entries to `devDependencies`, `peerDependencies`,
and optional `peerDependenciesMeta`. Do not add another i18n package.

Refresh only the workspace lockfile importer with:

```powershell
pnpm install --lockfile-only --offline
```

- [ ] **Step 4: Register dictionaries and render through DSH locale**

Extend the structural `ClientContext` with only this public surface:

```ts
readonly locale: {
  register(namespace: string, locale: string, dictionary: Readonly<Record<string, string>>): () => void
  bind(namespace: string): (key: string, params?: Readonly<Record<string, string | number>>) => string
  getSnapshot(): { readonly active: 'zh' | 'en', readonly revision: number }
  subscribe(listener: () => void): () => void
}
```

Use literal dictionaries with matching key sets. Include every Tianwen-owned
visible string, the four action labels, the fixed action reasons, phase labels,
form labels, validation/fallback messages, and the three Chinese first-use
steps from the design. Do not translate user objectives or upstream
`blockedReason.message`.

Inside the registered sidebar component, subscribe with closures so class
method receivers are preserved:

```ts
useSyncExternalStore(
  listener => ctx.locale.subscribe(listener),
  () => ctx.locale.getSnapshot(),
)
```

Bind the namespace and resolve all visible copy through `t`. Register the two
dictionaries beside the slot registration and return one disposer that removes
the slot and both dictionaries.

Update:

```ts
export const inject = ['slots', 'sessions', 'connection', 'locale'] as const
```

Map the existing `taskAction().label` and its fixed English reasons to dictionary
keys only when rendering. Preserve dynamic `blockedReason.message` verbatim.

- [ ] **Step 5: Make client tests GREEN**

Run:

```powershell
pnpm --filter '@tianwen/runtime-bundle' build
pnpm exec vitest run tests/dsh-migration/learn-loop-client.spec.ts tests/dsh-migration/learn-loop-client-module.spec.ts
```

Expected: client build and both files PASS. Existing English tests use an
English-active fake locale; the new test proves Chinese and live switching.

- [ ] **Step 6: Lock the packed client manifest**

Update `runtime-bundle.spec.ts` to expect the exact four client injection names
and the exact optional peer package. Run:

```powershell
pnpm exec vitest run tests/dsh-migration/runtime-bundle.spec.ts
```

Expected: PASS and no server/runtime import of a client-locale package.

- [ ] **Step 7: Commit Task 2**

```powershell
git add -- packages/tianwen-runtime-bundle/package.json packages/tianwen-runtime-bundle/src/client.tsx pnpm-lock.yaml tests/dsh-migration/learn-loop-client.spec.ts tests/dsh-migration/learn-loop-client-module.spec.ts tests/dsh-migration/runtime-bundle.spec.ts
git commit -m "feat: localize the Tianwen long-task interface"
```

---

### Task 3: Product integration, packaged Chinese smoke, and handoff

**Files:**
- Modify only if the facts changed: `docs/operations/tianwen-learn-loop-web-entry-handoff.md`
- Generated on `D:` only: Runtime tarball, staged Desktop Runtime, unpacked Desktop, and GUI-smoke temporary data.

**Interfaces:**
- Consumes: Task 1 Desktop locale selection and Task 2 locale-aware Runtime Bundle.
- Produces: one audited packaged Desktop using the exact freshly built Runtime tarball.
- Produces: one no-model GUI observation of the Chinese `长期任务` entry and its first-use instructions.

- [ ] **Step 1: Review the combined diff before integration**

Run:

```powershell
git diff af3bfcd..HEAD --check
git diff --stat af3bfcd..HEAD
```

Reject unrelated refactors, duplicate locale state, bilingual visible copy,
DSH settings writes, or changes to Goal/Session/RPC behavior.

- [ ] **Step 2: Run the focused combined gate**

Run:

```powershell
pnpm exec vitest run tests/dsh-migration/tianwen-desktop-locale.spec.ts tests/dsh-migration/tianwen-desktop-bootstrap.spec.ts tests/dsh-migration/tianwen-desktop-host.spec.ts tests/dsh-migration/learn-loop-client.spec.ts tests/dsh-migration/learn-loop-client-module.spec.ts tests/dsh-migration/runtime-bundle.spec.ts
pnpm run typecheck
```

Expected: all selected tests and repository typecheck PASS.

- [ ] **Step 3: Build one exact Runtime and Desktop artifact**

Use `D:\DevData\tianwen-chinese-product-ux` for pack, install, app-data,
package-store, and temporary paths. Build `@tianwen/runtime-bundle`, pack one
tarball, stage that exact tarball into Desktop, then run:

```powershell
pnpm --filter '@tianwen/desktop-host' build
pnpm --filter '@tianwen/desktop-host' pack:dir
node scripts/audit-desktop-artifact.mjs dist/tianwen-desktop/win-unpacked <exact-runtime-tarball>
```

Expected: the artifact audit passes and the tarball digest used by Desktop is
the digest just built.

- [ ] **Step 4: Run one no-model Chinese GUI smoke**

Prepare or update one disposable DSH Web Profile under the Task 3 `D:` root
with the exact tarball. Launch the packaged `Tianwen Desktop.exe` using the
real Node 22, exact DSH `0.1.1-rc.2`, and that DSH home with Provider secrets
removed. Observe, without creating a Goal or starting a Task:

1. the packaged app accepts all three explicit target arguments;
2. the DSH page and Tianwen sidebar entry display Chinese when no saved locale
   exists on this Chinese system;
3. opening `长期任务` shows the three Chinese workflow instructions and no
   simultaneous English labels;
4. closing the window removes the exact Desktop-owned DSH PID and closes its
   loopback endpoint.

One observation is sufficient. Do not repeat the smoke for timing noise and do
not call a Provider.

- [ ] **Step 5: Record only durable changed facts**

If the existing handoff still says GUI was not observed, update it with the
packaged Chinese smoke, Runtime digest, owned PID/endpoint closure, and zero
model requests. Keep Web Browser-plugin infrastructure failures separate from
Tianwen product facts. Do not add a new synthetic Activity or efficacy claim.

- [ ] **Step 6: Commit integration evidence and push**

```powershell
git add -- docs/operations/tianwen-learn-loop-web-entry-handoff.md
git commit -m "docs: close the localized Learn Loop product handoff"
git push origin main
```

Skip the documentation commit if the handoff requires no factual update; push
the two implementation commits instead.

- [ ] **Step 7: Check exact-main CI once**

Read the GitHub Actions run for the exact pushed SHA. Report Python,
TypeScript, installer-windows, and desktop-windows separately. Do not trigger,
cancel, rerun, or create a recurring monitor. A queued run may be reported as
external pending without blocking local cleanup.

- [ ] **Step 8: Clean generated stage data**

List the exact Task 3 `D:` root and repository-local GUI-smoke path, verify they
contain only generated artifacts from this task, dry-run the deletion, then
remove those exact paths. Do not touch historical Activity, evidence, debug,
product, deployment, or legacy worktree data. Finish with a clean Git status.
