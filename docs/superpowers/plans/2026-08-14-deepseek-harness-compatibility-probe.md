# DeepSeek Harness Compatibility Probe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用一个不调用付费模型、不使用真实 Docker、不会改写现有 Python 基线的兼容性探针，验证 DeepSeek Harness 能否作为天问的通用 Agent Runtime，并证明 Goal 权限、Session 恢复、Evidence 投影、Python A1 评测、版本晋升/回滚和本地沙盒这些承重边界。

**Architecture:** 从已经完成 Alpha-A Tasks 1–9 的精确分支建立独立探针分支。TypeScript 侧只通过 npm 发布包和公开导出使用 DeepSeek Harness；`tianwen-dsh-compat` 集中吸收上游变化，最小 Tianwen Bundle/Profile 证明可安装组合，`tianwen-evidence` 和 `tianwen-evolution` 分别验证执行事实投影与跨 Session 版本治理。现有 Python A1 任务包和 verifier 继续作为独立评测 Worker，不迁移、不复制。探针最终只给出“采用 / 限制性复用 / 暂不采用”的选型证据，不直接启动正式迁移。

**Tech Stack:** Node.js 22.23.1、pnpm 11.20.0、TypeScript 6.0.3、Vitest 4.1.8、DeepSeek Harness `0.1.0-rc.6` npm 发布包、Cordis 4.0.1、Python 3.11–3.14、现有 Tianwen Alpha A1、pytest、Ruff、Git

## Global Constraints

- 本计划只实施“兼容性探针”，不实施完整天问迁移，不开发 UI，不接入真实模型，不启动 Alpha Task 10。
- 实施基线固定为 `origin/codex/alpha-a-real-task` 的 `67ef50f673c7786872cf5729a808dd3fe85afcfb`。开始前远端 SHA 不一致时必须停止并报告主控，不得自行 rebase、merge 或换基线。
- 保留现有 Python Runtime、PydanticAI、Alpha Runtime、A1–A5 和全部历史交接；不得删除、废弃、重命名或大规模重构它们。
- 不 Fork DeepSeek Harness，不把其源码复制进天问仓库，不依赖上游 monorepo，不使用 `@deepseek-ai/*/src/*`、相对源码路径或未发布测试文件。
- npm 运行依赖精确锁定到 `0.1.0-rc.6`；`@deepseek-ai/cordis` 精确锁定到 `4.0.1`，`@deepseek-ai/cordis-plugin-timer` 精确锁定到 `1.1.3`。禁止 `latest`、`^`、`~` 和自动升级。
- 已审计的 GitHub 源码快照是 `47f943859bef60e4160492346772ded9b24f765a`，其仓库 manifest 仍为 `0.1.0-rc.5`；npm `rc.6` 没有可核对的 Git tag 或 `gitHead`。因此 Task 1 必须把 npm tarball、integrity、公开导出和实际 TypeScript 签名作为 `rc.6` 的权威，不得把 `rc.5` 源码审计直接冒充为 `rc.6` 证明。
- 只允许第一次精确依赖安装访问 npm registry，以及 Git push 访问 GitHub。此后所有测试必须使用 `pnpm --offline --frozen-lockfile`、`UV_OFFLINE=1`，不得调用 live web。
- Node/pnpm 大缓存统一放在 `D:\DevData\pnpm-store`；探针运行数据统一放在 `D:\DevData\tianwen-dsh-probe`；项目自身 `node_modules` 留在 D 盘 worktree。不得把大缓存和运行数据写入 C 盘。
- PowerShell 中使用 `npm.cmd`、`pnpm.cmd`，避免执行策略拦截 `npm.ps1` / `pnpm.ps1`。
- 所有由天问、探针脚本、评测 Worker、Agent 工具直接创建的子进程都使用程序名加 argv 数组和 `shell: false`；禁止拼接 shell 命令字符串，禁止继承模型密钥。
- 唯一例外是精确 `@deepseek-ai/dsh@0.1.0-rc.6` 的公开
  `dsh plugin --profile tianwen-probe add --offline <fixed-tarball>`
  在 Windows 内部调用 pnpm 时使用上游实现的 `shell: true`。该例外只
  允许 Task 3 一次性 Profile 安装控制面；Windows 根目录必须精确为
  `D:\DevData\tianwen-dsh-probe`，profile、tarball 和 argv 必须由代码
  固定，传给上游 shell 的字符串不得含 shell 元字符，也不得包含用户、
  模型或外部来源数据。外层仍必须 `shell: false`，报告必须分别
  披露两层边界。该例外不得复用于 Agent 运行期、动态插件、学习资产或
  用户指定 package spec。
- 默认测试不得联网、不得调用付费模型、不得要求 Docker Engine。真实 DSH 本地沙盒只在 Task 8 的显式开关下运行，并且只能操作 D 盘专用一次性目录。
- Windows 上 DSH 沙盒报告 `partial` 是上游公开语义：它可以支持普通本地任务，但不能被描述为高风险代码的强隔离。探针不得把 `partial` 伪装成 `full`。
- DSH Session Log 是单 Session 执行事实；Tianwen Ledger 是跨 Session 治理事实。探针不得把整段会话复制进 Tianwen Ledger。
- DSH Turn 不等于 Tianwen Run，DSH Todo 不等于 Tianwen Task，Dynamic Cordis Package 不等于持久 `ArtifactVersion`，Agent Preset generation 不等于 Promotion。
- Dynamic Cordis 版本只作为“当前进程里的运行挂载”。正式版本身份、评测、授权、Champion 指针和历史必须由 Tianwen 自己的持久账本保存。
- 顶层 Goal 的创建/编辑/暂停/恢复权限仍由用户掌握。任何后台插件如果能够直接调用低层 GoalService，必须在组合层显式列入高权限清单；普通 evidence/evolution 插件不得获得 Goal 变更能力。
- 正式装入同一 JavaScript 进程的已审核插件视为可信代码；消息
  `source` 是来源约定，不是恶意代码沙盒。Task 4 不测试已取得完整
  `Agent` / `Context` 的恶意插件。未晋升或第三方未知插件不得进入
  主进程；需要时再单独设计隔离。
- 每项任务先写失败测试，再写最小实现；每项任务完成后单独提交。提交前运行该任务聚焦测试、TypeScript typecheck、必要的 Python 测试和 `git diff --check`。
- 每项任务由 fresh scoped reviewer 复审。发现 Critical/Important 后最多允许两轮窄修复；仍有承重问题则停止并向主控交接，不得用后续任务掩盖。
- 探针结果只能由最终证据决定。不能因为已经投入代码就默认迁移，也不能因为某个非承重细节不理想就推翻可工作的公开接口方案。

---

## File Map

### Root files

- Modify: `.gitignore`
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `pnpm-lock.yaml`
- Create: `tsconfig.base.json`
- Create: `vitest.config.ts`
- Create: `scripts/check-dsh-install.mjs`
- Create: `scripts/typecheck-packages.mjs`
- Create: `scripts/verify-dsh-profile.mjs`
- Create: `scripts/dsh_probe_alpha_a1_evaluator.py`

### Compatibility package

- Create: `packages/tianwen-dsh-compat/package.json`
- Create: `packages/tianwen-dsh-compat/tsconfig.json`
- Create: `packages/tianwen-dsh-compat/src/index.ts`
- Create: `packages/tianwen-dsh-compat/src/scripted-adapter.ts`
- Create: `packages/tianwen-dsh-compat/src/test-harness.ts`

### Installable probe Bundle

- Create: `packages/tianwen-dsh-probe-bundle/package.json`
- Create: `packages/tianwen-dsh-probe-bundle/tsconfig.json`
- Create: `packages/tianwen-dsh-probe-bundle/cordis.patch.yml`
- Create: `packages/tianwen-dsh-probe-bundle/src/index.ts`
- Create: `packages/tianwen-dsh-probe-bundle/src/adapter.ts`

### Tianwen plugin prototypes

- Create: `packages/tianwen-evidence/package.json`
- Create: `packages/tianwen-evidence/tsconfig.json`
- Create: `packages/tianwen-evidence/src/index.ts`
- Create: `packages/tianwen-evidence/src/projector.ts`
- Create: `packages/tianwen-evolution/package.json`
- Create: `packages/tianwen-evolution/tsconfig.json`
- Create: `packages/tianwen-evolution/src/index.ts`
- Create: `packages/tianwen-evolution/src/ledger.ts`
- Create: `packages/tianwen-evolution/src/runtime-binding.ts`
- Create: `packages/tianwen-evaluator-python/package.json`
- Create: `packages/tianwen-evaluator-python/tsconfig.json`
- Create: `packages/tianwen-evaluator-python/src/index.ts`
- Create: `packages/tianwen-evaluator-python/src/protocol.ts`

### Probe tests

- Create: `tests/dsh-probe/install-closure.spec.ts`
- Create: `tests/dsh-probe/public-surface.spec.ts`
- Create: `tests/dsh-probe/profile.spec.ts`
- Create: `tests/dsh-probe/goal-authority.spec.ts`
- Create: `tests/dsh-probe/goal-recovery.spec.ts`
- Create: `tests/dsh-probe/evidence.spec.ts`
- Create: `tests/dsh-probe/python-a1-evaluator.spec.ts`
- Create: `tests/dsh-probe/evolution.spec.ts`
- Create: `tests/dsh-probe/sandbox.e2e.spec.ts`

### Result documents

- Create: `docs/operations/deepseek-harness-compatibility-probe-handoff.md`
- Create: `docs/research/2026-08-14-deepseek-harness-compatibility-probe-result.md`
- Modify after controller decision only: `docs/superpowers/specs/2026-08-14-deepseek-harness-runtime-selection-design.md`
- Modify after controller decision only: `docs/architecture-master-session-memory.md`

### Dependency order

```text
exact npm closure
  -> public compat seam
  -> installable Bundle/Profile
  -> Goal authority + durable recovery
  -> Evidence projection
  -> Python A1 evaluator bridge
  -> persistent Artifact/Champion governance + Dynamic Cordis binding
  -> real local sandbox gate
  -> final runtime-selection report
```

---

## Task 0: Seal the Alpha Baseline and Create an Isolated Probe Branch

**Files:** none

**Purpose:** 确保探针继承完整 A1–A5 和 Tasks 1–9 证据，同时不污染主控会话和现有 Alpha 分支。

- [ ] **Step 1: Read the controller memory and approved runtime-selection documents**

Read completely:

```text
D:\Guo\zuochong\AGi\docs\architecture-master-session-memory.md
D:\Guo\zuochong\AGi\docs\research\2026-08-14-deepseek-harness-source-audit.md
D:\Guo\zuochong\AGi\docs\superpowers\specs\2026-08-14-deepseek-harness-runtime-selection-design.md
D:\Guo\zuochong\AGi\docs\superpowers\plans\2026-08-14-deepseek-harness-compatibility-probe.md
```

Do not infer migration authority from these documents. They authorize only this probe.

- [ ] **Step 2: Verify the exact remote Alpha head**

Run:

```powershell
git ls-remote origin refs/heads/codex/alpha-a-real-task
```

Expected:

```text
67ef50f673c7786872cf5729a808dd3fe85afcfb	refs/heads/codex/alpha-a-real-task
```

If the SHA differs, stop and report the actual SHA to the main controller. Do not continue on an unreviewed base.

- [ ] **Step 3: Create the isolated worktree on D**

Run:

```powershell
git worktree add -b codex/deepseek-harness-probe D:\DevData\tianwen-dsh-probe-worktree 67ef50f673c7786872cf5729a808dd3fe85afcfb
git -C D:\DevData\tianwen-dsh-probe-worktree status --short --branch
```

Expected: branch `codex/deepseek-harness-probe`, clean worktree.

- [ ] **Step 4: Re-run the frozen Python baseline before adding Node**

Run from the probe worktree:

```powershell
$env:UV_CACHE_DIR = 'D:\DevData\uv-cache'
$env:UV_OFFLINE = '1'
uv run pytest -q
uv run ruff check .
git diff --check
```

Expected baseline: `424 passed, 4 skipped`, Ruff clean, diff clean. If counts legitimately differ because the precise branch has changed, stop under Step 2 rather than updating this expectation.

- [ ] **Step 5: Record the starting facts in the task progress ledger**

The implementation task may keep ignored working notes under:

```text
.superpowers/sdd/2026-08-14-deepseek-harness-compatibility-probe/progress.md
```

Record base SHA, worktree path, Python baseline, Node version, pnpm version, and that Task 10 remains frozen. Do not commit generated SDD working notes.

---

## Task 1: Pin and Prove the Published DeepSeek Harness Dependency Closure

**Files:**

- Modify: `.gitignore`
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `pnpm-lock.yaml`
- Create: `tsconfig.base.json`
- Create: `vitest.config.ts`
- Create: `scripts/check-dsh-install.mjs`
- Create: `tests/dsh-probe/install-closure.spec.ts`

**Interfaces:**

- Consumes: npm registry metadata and tarballs for exact `0.1.0-rc.6`.
- Produces:
  - frozen `pnpm-lock.yaml`;
  - a machine-readable installed-version report;
  - a hard failure if any installed `@deepseek-ai/dsh` or `@deepseek-ai/dsh-*` package is not `0.1.0-rc.6`;
  - a hard failure if the CLI package lacks its published `dsh` executable;
  - a hard failure if a Runtime library imported by
    `tianwen-dsh-compat` lacks its public root export or root types.

- [ ] **Step 1: Add the root Node workspace manifest**

Create `package.json` with exact versions:

```json
{
  "name": "tianwen-runtime-probe",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@11.20.0",
  "engines": {
    "node": ">=22.19.0 <23"
  },
  "scripts": {
    "build": "node scripts/typecheck-packages.mjs",
    "typecheck": "node scripts/typecheck-packages.mjs",
    "test:dsh": "vitest run",
    "test:dsh:sandbox": "vitest run tests/dsh-probe/sandbox.e2e.spec.ts",
    "check:dsh-install": "node scripts/check-dsh-install.mjs",
    "check:no-private-dsh-imports": "node scripts/check-dsh-install.mjs --imports",
    "check": "pnpm run check:dsh-install && pnpm run check:no-private-dsh-imports && pnpm run typecheck && pnpm run test:dsh"
  },
  "devDependencies": {
    "@deepseek-ai/cordis": "4.0.1",
    "@deepseek-ai/cordis-plugin-timer": "1.1.3",
    "@deepseek-ai/dsh": "0.1.0-rc.6",
    "@deepseek-ai/dsh-agent": "0.1.0-rc.6",
    "@deepseek-ai/dsh-agent-loop": "0.1.0-rc.6",
    "@deepseek-ai/dsh-agent-loop-testkit": "0.1.0-rc.6",
    "@deepseek-ai/dsh-cordis-host-runner": "0.1.0-rc.6",
    "@deepseek-ai/dsh-goal": "0.1.0-rc.6",
    "@deepseek-ai/dsh-goal-round-driver": "0.1.0-rc.6",
    "@deepseek-ai/dsh-llm": "0.1.0-rc.6",
    "@deepseek-ai/dsh-sandbox": "0.1.0-rc.6",
    "@deepseek-ai/dsh-sandbox-local": "0.1.0-rc.6",
    "@deepseek-ai/dsh-session": "0.1.0-rc.6",
    "@deepseek-ai/dsh-session-persistence-jsonl": "0.1.0-rc.6",
    "@deepseek-ai/dsh-system-prompt": "0.1.0-rc.6",
    "@deepseek-ai/dsh-tool-goal": "0.1.0-rc.6",
    "@deepseek-ai/dsh-tools": "0.1.0-rc.6",
    "@types/node": "22.20.0",
    "tsx": "4.22.4",
    "typescript": "6.0.3",
    "vitest": "4.1.8"
  }
}
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - packages/*
```

Append to `.gitignore`:

```gitignore
node_modules/
dist/
*.tsbuildinfo
.dsh-probe/
```

Do not ignore `pnpm-lock.yaml`, package manifests, source, tests, or result documents.

- [ ] **Step 2: Add strict TypeScript and Vitest configuration**

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true,
    "skipLibCheck": false,
    "types": ["node", "vitest/globals"]
  }
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/dsh-probe/**/*.spec.ts'],
    exclude: ['tests/dsh-probe/sandbox.e2e.spec.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
})
```

The sandbox suite remains a separate explicit gate because it changes ACL/file permissions in a disposable D drive directory.

- [ ] **Step 3: Write the dependency-closure check before installing**

Create `scripts/check-dsh-install.mjs`.

Required behavior:

1. Run `pnpm.cmd list --json --depth Infinity` on Windows or `pnpm list --json --depth Infinity` elsewhere, with `shell: false`.
2. Recursively inspect the returned dependency tree.
3. Every package named exactly `@deepseek-ai/dsh` or beginning `@deepseek-ai/dsh-` must have version exactly `0.1.0-rc.6`.
4. Read each direct DSH dependency's published `package.json`.
5. Treat `@deepseek-ai/dsh` as the CLI package documented by upstream:
   require a non-empty `bin.dsh`, require its target file to exist inside the
   installed package, and do not require `main`, `types`, or a root `"."`
   library export.
6. Treat every direct `@deepseek-ai/dsh-*` package imported by the planned
   `tianwen-dsh-compat` seam as a Runtime library: require a root `"."`
   export with both `types` and `default` targets, and require both target
   files to exist inside the installed package.
7. In `--imports` mode, recursively scan committed `.ts`, `.mts`, `.cts`, `.js`, `.mjs` files under `packages`, `tests/dsh-probe`, and `scripts`; fail on an import containing `@deepseek-ai/` followed later by `/src/`.
8. Emit sorted JSON with `expectedDshVersion`, `installedPackages`,
   `packageSurfaces`, and `privateImportViolations`.

The surface classes are intentionally different:

```text
@deepseek-ai/dsh
  kind = cli
  authority = bin.dsh

@deepseek-ai/dsh-agent and the other directly imported dsh-* packages
  kind = library
  authority = exports["."].types + exports["."].default
```

The absence of a root library export on the CLI package is not a
compatibility failure. Conversely, a library package cannot satisfy this gate
merely by exposing a CLI binary.

Use this exact version predicate:

```js
const isDshPackage = name =>
  name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')

if (isDshPackage(name) && version !== '0.1.0-rc.6') {
  failures.push(`${name}: expected 0.1.0-rc.6, got ${String(version)}`)
}
```

Do not accept “compatible” semver ranges; this is a probe against one exact release.

Create `scripts/typecheck-packages.mjs` at the same time. It must enumerate the
currently present `packages/*/tsconfig.json` files in sorted order and invoke:

```text
pnpm.cmd exec tsc -b followed by every discovered tsconfig path, then --pretty false
```

The script must pass every item as a separate argv entry through
`execFileSync(..., { shell: false })`. If no package tsconfig exists yet, the
script exits 0. Do not rely on shell glob expansion because Windows `cmd.exe`
does not expand `packages/*`.

- [ ] **Step 4: Add the failing install-closure test**

Create `tests/dsh-probe/install-closure.spec.ts`:

```ts
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

describe('published DeepSeek Harness closure', () => {
  it('pins every installed DSH package to rc.6', () => {
    const output = execFileSync(
      process.execPath,
      [resolve(root, 'scripts/check-dsh-install.mjs')],
      { cwd: root, encoding: 'utf8', shell: false },
    )
    const report = JSON.parse(output) as {
      expectedDshVersion: string
      installedPackages: Array<{ name: string; version: string }>
      packageSurfaces: Array<{
        name: string
        kind: 'cli' | 'library'
        rootExport: boolean
        typesTarget: boolean
        defaultTarget: boolean
        cliTarget: boolean
      }>
    }
    expect(report.expectedDshVersion).toBe('0.1.0-rc.6')
    expect(report.installedPackages.length).toBeGreaterThan(10)
    expect(new Set(report.installedPackages.map(item => item.version)))
      .toEqual(new Set(['0.1.0-rc.6']))

    const cli = report.packageSurfaces.find(
      item => item.name === '@deepseek-ai/dsh',
    )
    expect(cli).toMatchObject({
      kind: 'cli',
      rootExport: false,
      cliTarget: true,
    })

    const libraries = report.packageSurfaces.filter(
      item => item.kind === 'library',
    )
    expect(libraries.length).toBeGreaterThan(10)
    expect(libraries.every(
      item => item.rootExport && item.typesTarget && item.defaultTarget,
    )).toBe(true)
  })

  it('commits a lockfile and uses no floating DSH ranges', () => {
    expect(readFileSync(resolve(root, 'pnpm-lock.yaml'), 'utf8')).toContain('lockfileVersion:')
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      devDependencies: Record<string, string>
    }
    for (const [name, version] of Object.entries(manifest.devDependencies)) {
      if (name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')) {
        expect(version).toBe('0.1.0-rc.6')
      }
    }
    expect(() => execFileSync(pnpm, ['--version'], { cwd: root, shell: false }))
      .not.toThrow()
  })
})
```

- [ ] **Step 5: Run RED before dependency installation**

Run:

```powershell
pnpm.cmd run test:dsh -- tests/dsh-probe/install-closure.spec.ts
```

Expected: FAIL because `node_modules` and `pnpm-lock.yaml` do not exist. A syntax/import failure in the test itself is not a valid RED; fix the test until the failure is specifically missing installed closure/lockfile.

- [ ] **Step 6: Install once with all large data on D**

Run:

```powershell
$env:PNPM_HOME = 'D:\DevData\pnpm-home'
$env:PNPM_STORE_DIR = 'D:\DevData\pnpm-store'
pnpm.cmd install --save-exact --store-dir D:\DevData\pnpm-store
```

This is the only npm dependency-resolution step allowed to use the network. Commit the generated `pnpm-lock.yaml`.

- [ ] **Step 7: Prove the lockfile can reproduce offline**

Run:

```powershell
pnpm.cmd install --offline --frozen-lockfile --store-dir D:\DevData\pnpm-store
pnpm.cmd run check:dsh-install
pnpm.cmd run test:dsh -- tests/dsh-probe/install-closure.spec.ts
```

Expected: offline install succeeds; every installed DSH package is exactly `0.1.0-rc.6`.

- [ ] **Step 8: Save npm release authority in the handoff evidence**

Record at least these published facts in the ignored progress ledger:

```text
@deepseek-ai/dsh@0.1.0-rc.6
integrity sha512-brpZfED7ieRa2PQ5tUxMhHrM1pb2CmKFVM/f6yMULBDMicahk+Z2OsHgTwTDnoiZm23Ftu9rQz0NN4pflaoJcg==
GitHub master 47f943859bef60e4160492346772ded9b24f765a still carries rc.5 manifests
npm metadata exposes no gitHead/tag for rc.6
```

Also record the integrity values actually present in `pnpm-lock.yaml`; the lockfile, not this prose, is the execution authority.

- [ ] **Step 9: Commit the exact dependency baseline**

Run:

```powershell
git add .gitignore package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json vitest.config.ts scripts/check-dsh-install.mjs scripts/typecheck-packages.mjs tests/dsh-probe/install-closure.spec.ts
git commit -m "build: pin deepseek harness probe closure"
```

---

## Task 2: Build the Thin Public `tianwen-dsh-compat` Seam

**Files:**

- Create: `packages/tianwen-dsh-compat/package.json`
- Create: `packages/tianwen-dsh-compat/tsconfig.json`
- Create: `packages/tianwen-dsh-compat/src/index.ts`
- Create: `packages/tianwen-dsh-compat/src/scripted-adapter.ts`
- Create: `packages/tianwen-dsh-compat/src/test-harness.ts`
- Create: `tests/dsh-probe/public-surface.spec.ts`

**Interfaces:**

- Produces:
  - `DSH_VERSION = "0.1.0-rc.6"`;
  - public re-exports for the exact DSH classes/types used by the probe;
  - `ScriptedAdapter`;
  - `textResponse()`, `toolCallResponse()`;
  - `mountCoreHarness()`, `mountPersistentHarness()`, `waitForIdle()`;
  - no private upstream import.

- [ ] **Step 1: Create the compatibility package manifests**

Create `packages/tianwen-dsh-compat/package.json`:

```json
{
  "name": "@tianwen/dsh-compat",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "dependencies": {
    "@deepseek-ai/cordis": "4.0.1",
    "@deepseek-ai/dsh-agent": "0.1.0-rc.6",
    "@deepseek-ai/dsh-agent-loop": "0.1.0-rc.6",
    "@deepseek-ai/dsh-agent-loop-testkit": "0.1.0-rc.6",
    "@deepseek-ai/dsh-cordis-host-runner": "0.1.0-rc.6",
    "@deepseek-ai/dsh-goal": "0.1.0-rc.6",
    "@deepseek-ai/dsh-goal-round-driver": "0.1.0-rc.6",
    "@deepseek-ai/dsh-llm": "0.1.0-rc.6",
    "@deepseek-ai/dsh-sandbox": "0.1.0-rc.6",
    "@deepseek-ai/dsh-sandbox-local": "0.1.0-rc.6",
    "@deepseek-ai/dsh-session": "0.1.0-rc.6",
    "@deepseek-ai/dsh-session-persistence-jsonl": "0.1.0-rc.6",
    "@deepseek-ai/dsh-system-prompt": "0.1.0-rc.6",
    "@deepseek-ai/dsh-tool-goal": "0.1.0-rc.6",
    "@deepseek-ai/dsh-tools": "0.1.0-rc.6"
  },
  "scripts": {
    "build": "tsc -b",
    "typecheck": "tsc -b --pretty false"
  }
}
```

Create `packages/tianwen-dsh-compat/tsconfig.json`:

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

- [ ] **Step 2: Add a public-surface compile contract first**

Create `tests/dsh-probe/public-surface.spec.ts` with imports only from package roots:

```ts
import { describe, expect, it } from 'vitest'
import {
  AgentLoop,
  Context,
  DSH_VERSION,
  DynamicCordisRunnerService,
  GoalService,
  JsonlSessionPersistence,
  LocalSandboxProvider,
  ScriptedAdapter,
  SessionId,
  mountAgentLoopTestDependencies,
  textResponse,
} from '@tianwen/dsh-compat'

describe('tianwen-dsh-compat public seam', () => {
  it('exports the exact rc.6 load-bearing surface', () => {
    expect(DSH_VERSION).toBe('0.1.0-rc.6')
    expect(Context).toBeTypeOf('function')
    expect(AgentLoop).toBeTypeOf('function')
    expect(GoalService).toBeTypeOf('function')
    expect(JsonlSessionPersistence).toBeTypeOf('function')
    expect(DynamicCordisRunnerService).toBeTypeOf('function')
    expect(LocalSandboxProvider).toBeTypeOf('function')
    expect(SessionId('probe-session')).toBe('probe-session')
    expect(textResponse('ok').at(-1)).toEqual({
      type: 'finish',
      reason: { kind: 'stop' },
    })
  })

  it('can mount the published testkit and register a scripted adapter', async () => {
    const ctx = new Context()
    await mountAgentLoopTestDependencies(ctx)
    const adapter = new ScriptedAdapter([textResponse('ok')])
    ctx.llm.registerAdapter(['tianwen-probe'], adapter)
    expect(ctx.llm.listProviders().map(provider => provider.id))
      .toContain('tianwen-probe')
    await ctx.fiber.dispose()
  })
})
```

- [ ] **Step 3: Run RED against missing package**

Run:

```powershell
pnpm.cmd exec vitest run tests/dsh-probe/public-surface.spec.ts
```

Expected: FAIL because `@tianwen/dsh-compat` does not exist. A failure because a named rc.6 public export is absent is a valid compatibility failure and must be reported to the main controller before changing the plan.

- [ ] **Step 4: Implement the exact public re-export boundary**

In `packages/tianwen-dsh-compat/src/index.ts`, export only package-root APIs:

```ts
export { Context, Service } from '@deepseek-ai/cordis'
export { default as AgentRegistry, Inbox } from '@deepseek-ai/dsh-agent'
export type { Agent, AgentStatus } from '@deepseek-ai/dsh-agent'
export { default as AgentLoop } from '@deepseek-ai/dsh-agent-loop'
export { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
export { default as DynamicCordisRunnerService } from '@deepseek-ai/dsh-cordis-host-runner'
export type {
  CordisDynamicPackageId,
  CordisDynamicPluginId,
  DynamicCordisInventoryRow,
} from '@deepseek-ai/dsh-cordis-host-runner'
export { default as GoalService } from '@deepseek-ai/dsh-goal'
export type { GoalRef, GoalView } from '@deepseek-ai/dsh-goal'
export * as goalRoundDriver from '@deepseek-ai/dsh-goal-round-driver'
export {
  CallId,
  LlmAdapter,
  createUserMessage,
} from '@deepseek-ai/dsh-llm'
export type {
  GenerateOptions,
  MessageSource,
  StreamChunk,
} from '@deepseek-ai/dsh-llm'
export {
  SESSION_FORMAT_VERSION,
  Session,
  SessionId,
} from '@deepseek-ai/dsh-session'
export type {
  SessionEvent,
  SessionHeader,
  UserMessage,
} from '@deepseek-ai/dsh-session'
export { default as JsonlSessionPersistence } from '@deepseek-ai/dsh-session-persistence-jsonl'
export { default as SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
export { default as ToolRuntime, defineContentToolFixture, defineTool } from '@deepseek-ai/dsh-tools'
export type { ToolExecutionResult } from '@deepseek-ai/dsh-tools'
export * as toolGoal from '@deepseek-ai/dsh-tool-goal'
export {
  SANDBOX_UNAVAILABLE,
  SandboxUnavailableError,
} from '@deepseek-ai/dsh-sandbox'
export type {
  ConfinedArgv,
  SandboxEnforcement,
  SandboxPolicy,
} from '@deepseek-ai/dsh-sandbox'
export { default as LocalSandboxProvider } from '@deepseek-ai/dsh-sandbox-local'

export const DSH_VERSION = '0.1.0-rc.6' as const

export * from './scripted-adapter.js'
export * from './test-harness.js'
```

The read-only Tianwen services in later tasks extend the public Cordis
`Service` class; no private Cordis source path is needed.

If rc.6 TypeScript declarations do not expose one of these symbols at the package root, stop. Do not replace it with `/src/` imports.

- [ ] **Step 5: Implement the deterministic adapter**

In `packages/tianwen-dsh-compat/src/scripted-adapter.ts`:

```ts
import { CallId, LlmAdapter } from '@deepseek-ai/dsh-llm'
import type {
  GenerateOptions,
  StreamChunk,
} from '@deepseek-ai/dsh-llm'

export type ScriptEntry =
  | readonly StreamChunk[]
  | Error
  | ((request: GenerateOptions) => readonly StreamChunk[])

export class ScriptedAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []

  constructor(private readonly script: ScriptEntry[]) {
    super()
  }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    const entry = this.script.shift()
    if (entry === undefined) {
      throw new Error('ScriptedAdapter: script exhausted')
    }
    if (entry instanceof Error) {
      throw entry
    }
    const chunks = typeof entry === 'function' ? entry(options) : entry
    for (const chunk of chunks) {
      yield chunk
    }
  }
}

export function textResponse(text: string): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

export function toolCallResponse(
  id: string,
  name: string,
  argumentsValue: Record<string, unknown>,
): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    {
      type: 'block-end',
      index: 0,
      block: {
        type: 'tool-call',
        id: CallId(id),
        name,
        arguments: JSON.stringify(argumentsValue),
      },
    },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ]
}
```

- [ ] **Step 6: Implement reusable public harness mounting**

`packages/tianwen-dsh-compat/src/test-harness.ts` must provide:

```ts
export interface MountedHarness {
  readonly ctx: Context
  readonly adapter: ScriptedAdapter
}

export async function mountCoreHarness(
  script: ScriptEntry[],
): Promise<MountedHarness>

export async function mountPersistentHarness(
  root: string,
  script: ScriptEntry[],
): Promise<MountedHarness>

export function waitForIdle(
  ctx: Context,
  agent: Agent,
): Promise<void>
```

Mount order for the persistent harness must be:

```text
mountAgentLoopTestDependencies(ctx)
AgentLoop({ agents: [] })
JsonlSessionPersistence({ root, compression: "none" })
register ScriptedAdapter(["tianwen-probe"])
```

Use `compression: "none"` so the probe can independently inspect its small JSONL fixtures. Production may later choose zstd.

- [ ] **Step 7: Update the lockfile offline for the new workspace importer**

Run:

```powershell
pnpm.cmd install --offline --lockfile-only --store-dir D:\DevData\pnpm-store
pnpm.cmd install --offline --frozen-lockfile --store-dir D:\DevData\pnpm-store
```

The committed lockfile must now contain the `packages/tianwen-dsh-compat`
importer. No registry access is allowed.

- [ ] **Step 8: Prove build, public imports, and private-import ban**

Run:

```powershell
pnpm.cmd --filter @tianwen/dsh-compat build
pnpm.cmd exec vitest run tests/dsh-probe/public-surface.spec.ts
pnpm.cmd run check:no-private-dsh-imports
```

Expected: all pass; private import report contains an empty list.

- [ ] **Step 9: Commit the compatibility seam**

Run:

```powershell
git add packages/tianwen-dsh-compat tests/dsh-probe/public-surface.spec.ts pnpm-lock.yaml
git commit -m "feat: add deepseek harness compatibility seam"
```

---

## Task 3: Prove an Installable Tianwen Bundle and Isolated Profile

**Files:**

- Create: `packages/tianwen-dsh-probe-bundle/package.json`
- Create: `packages/tianwen-dsh-probe-bundle/tsconfig.json`
- Create: `packages/tianwen-dsh-probe-bundle/cordis.patch.yml`
- Create: `packages/tianwen-dsh-probe-bundle/src/index.ts`
- Create: `packages/tianwen-dsh-probe-bundle/src/adapter.ts`
- Create: `scripts/verify-dsh-profile.mjs`
- Create: `tests/dsh-probe/profile.spec.ts`

**Interfaces:**

- Produces an npm-packable Bundle declaring `dsh.bundle`.
- Creates a disposable Profile under `D:\DevData\tianwen-dsh-probe\home`.
- Overrides only the default model route and inserts one keyless scripted adapter.
- Proves `dsh --profile tianwen-probe --dump-config` without booting a paid provider.
- Accepts the one documented rc.6 Windows installation limitation: Tianwen's
  outer process is `shell: false`, while the published DSH CLI internally
  invokes pnpm with `shell: true` only for the fixed offline plugin-add argv.
- Does not authorize any runtime or user/model-directed package installation.

- [ ] **Step 1: Add the package and profile contract test**

Create `tests/dsh-probe/profile.spec.ts`:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')

describe('Tianwen DSH Bundle', () => {
  it('declares one distributable bundle patch', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(root, 'packages/tianwen-dsh-probe-bundle/package.json'), 'utf8'),
    ) as {
      name: string
      dsh: { bundle: { patch: string } }
      files: string[]
    }
    expect(manifest.name).toBe('@tianwen/dsh-probe-bundle')
    expect(manifest.dsh.bundle.patch).toBe('./cordis.patch.yml')
    expect(manifest.files).toContain('cordis.patch.yml')
    expect(manifest.files).toContain('dist')
  })

  it('overrides the default route and inserts the Tianwen adapter', () => {
    const patch = readFileSync(
      resolve(root, 'packages/tianwen-dsh-probe-bundle/cordis.patch.yml'),
      'utf8',
    )
    expect(patch).toContain('id: agent-default-model')
    expect(patch).toContain('provider: tianwen-probe')
    expect(patch).toContain('model: scripted')
    expect(patch).toContain("name: '@tianwen/dsh-probe-bundle/adapter'")
  })
})
```

- [ ] **Step 2: Run RED**

Run:

```powershell
pnpm.cmd exec vitest run tests/dsh-probe/profile.spec.ts
```

Expected: FAIL because the Bundle files do not exist.

- [ ] **Step 3: Create the packable Bundle manifest**

Create `packages/tianwen-dsh-probe-bundle/package.json`:

```json
{
  "name": "@tianwen/dsh-probe-bundle",
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
    "./adapter": {
      "types": "./dist/adapter.d.ts",
      "default": "./dist/adapter.js"
    }
  },
  "files": ["dist", "cordis.patch.yml"],
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    }
  },
  "dependencies": {
    "@deepseek-ai/cordis": "4.0.1",
    "@deepseek-ai/dsh-llm": "0.1.0-rc.6"
  },
  "scripts": {
    "build": "tsc -b",
    "typecheck": "tsc -b --pretty false"
  }
}
```

Although the package is private during the probe, `pnpm pack` must still produce a complete installable tarball.

- [ ] **Step 4: Add the no-op product layer and scripted adapter plugin**

`src/index.ts`:

```ts
export const name = 'tianwen-probe'

export function apply(): void {
  // The Bundle identity is explicit; runtime behavior lives in inserted plugins.
}
```

`src/adapter.ts` must export Cordis plugin fields:

```ts
import type { Context } from '@deepseek-ai/cordis'
import {
  LlmAdapter,
} from '@deepseek-ai/dsh-llm'
import type {
  GenerateOptions,
  StreamChunk,
} from '@deepseek-ai/dsh-llm'

class ProfileProbeAdapter extends LlmAdapter {
  override async *stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield {
      type: 'block-end',
      index: 0,
      block: { type: 'text', text: 'tianwen profile probe' },
    }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export const name = 'tianwen-probe-adapter'
export const inject = ['llm']

export function apply(ctx: Context): void {
  ctx.llm.registerAdapter(['tianwen-probe'], new ProfileProbeAdapter())
}
```

No API key, HTTP client, endpoint, or provider environment variable is allowed.

- [ ] **Step 5: Add the Bundle patch**

Create `cordis.patch.yml`:

```yaml
- id: agent-default-model
  config:
    provider: tianwen-probe
    model: scripted

- insert:
    - id: tianwen-probe-adapter
      name: '@tianwen/dsh-probe-bundle/adapter'
```

Do not override Goal, Session, Sandbox, Tools, UI, or other base rows in the compatibility probe.

- [ ] **Step 6: Implement the profile verifier**

`scripts/verify-dsh-profile.mjs` must:

1. Require `TIANWEN_DSH_PROBE_ROOT`; on Windows require its resolved and real
   path to equal exactly `D:\DevData\tianwen-dsh-probe`. Do not accept
   user-selected child directories for the shell exception.
2. Build and pack `@tianwen/dsh-probe-bundle` into `D:\DevData\tianwen-dsh-probe\packs`.
3. Set `DSH_HOME=D:\DevData\tianwen-dsh-probe\home` and `PNPM_STORE_DIR=D:\DevData\pnpm-store`.
4. Run `pnpm.cmd exec dsh plugin --profile tianwen-probe add --offline D:\DevData\tianwen-dsh-probe\packs\tianwen-dsh-probe-bundle-0.0.0.tgz` from the Tianwen-owned outer process with `shell: false`. Before invocation, require the exact profile name, exact tarball basename, lexical and real containment under the exact probe root, a tarball produced by the current run, and no shell metacharacters in any value forwarded to the upstream shell. On Windows, record that the published rc.6 DSH CLI internally invokes pnpm with `shell: true`; do not describe the whole chain as `shell: false`.
5. Run `pnpm.cmd exec dsh --profile tianwen-probe --dump-config`.
6. Parse the authored patch as exactly two top-level operations: one update of
   `id: agent-default-model` whose config is exactly
   `provider: tianwen-probe` and `model: scripted`, and one insertion of
   `id: tianwen-probe-adapter` using
   `@tianwen/dsh-probe-bundle/adapter`. Reject extra Goal, Session, Sandbox,
   Tools, UI or other base-row changes.
7. Parse the bounded `agent-default-model` row in the dumped config and bind
   `provider: tianwen-probe` plus `model: scripted` to that row; a matching
   value elsewhere in the dump is not sufficient.
8. Require the dump to contain the Bundle layer and
   `tianwen-probe-adapter`.
9. Require the generated profile manifest to list `@deepseek-ai/dsh-base` before `@tianwen/dsh-probe-bundle`.
10. Require the generated profile to resolve `@deepseek-ai/dsh-base` to `0.1.0-rc.6`.
11. Use the generated Profile `package.json` as the module-resolution anchor;
    actually resolve and import both public exports
    `@tianwen/dsh-probe-bundle` and
    `@tianwen/dsh-probe-bundle/adapter`. Require the root identity export and
    adapter Cordis plugin fields to match the frozen Bundle.
12. Write `profile-report.json` under the probe root with command argv, exit
    codes, SHA-256 of the tarball, normalized config assertions, public-export
    resolution/import evidence, and this explicit boundary:

    ```json
    {
      "executionBoundary": {
        "tianwenOuterShell": false,
        "upstreamDshWindowsPluginInstallShell": true,
        "scope": "fixed-offline-profile-install-only",
        "userOrModelControlledArguments": false
      }
    }
    ```

    On non-Windows hosts, record the observed upstream value instead of
    claiming `true`.

Do not start the interactive DSH app in this task.

- [ ] **Step 7: Update the workspace lockfile offline**

Run:

```powershell
pnpm.cmd install --offline --lockfile-only --store-dir D:\DevData\pnpm-store
pnpm.cmd install --offline --frozen-lockfile --store-dir D:\DevData\pnpm-store
```

- [ ] **Step 8: Run GREEN and the real profile composition**

Run:

```powershell
$env:TIANWEN_DSH_PROBE_ROOT = 'D:\DevData\tianwen-dsh-probe'
$env:PNPM_STORE_DIR = 'D:\DevData\pnpm-store'
pnpm.cmd --filter @tianwen/dsh-probe-bundle build
pnpm.cmd exec vitest run tests/dsh-probe/profile.spec.ts
node scripts/verify-dsh-profile.mjs
```

Expected:

- Bundle tests pass;
- offline profile install succeeds;
- `--dump-config` proves the Tianwen layer without sending a model request;
- `D:\DevData\tianwen-dsh-probe\profile-report.json` exists.

- [ ] **Step 9: Commit the installable composition**

Run:

```powershell
git add packages/tianwen-dsh-probe-bundle scripts/verify-dsh-profile.mjs tests/dsh-probe/profile.spec.ts pnpm-lock.yaml
git commit -m "feat: add installable tianwen harness profile"
```

---

## Task 4: Prove Goal Authority, Durable Recovery, and Explicit Goal-Round Resume

**Files:**

- Create: `tests/dsh-probe/goal-authority.spec.ts`
- Create: `tests/dsh-probe/goal-recovery.spec.ts`
- Modify only if a public rc.6 field changed: `packages/tianwen-dsh-compat/src/test-harness.ts`

**Interfaces:**

- Human accepted turn may create a top-level DSH Goal through model-facing tools.
- Honestly labelled plugin-sourced turn cannot create/edit the Goal.
- Goal state survives JSONL persistence and process restart.
- Recovered Goal is disarmed and sends zero model requests until explicit resume.
- Explicit resume admits exactly the configured number of Goal rounds.
- Same-process reviewed plugins are trusted. The known forged-`user` path from
  code holding the full root `Agent` is documented, not a Task 4 gate.

- [ ] **Step 1: Add the human-versus-plugin authority contract**

Use the public pattern from `@deepseek-ai/dsh-tool-goal`: mount `SystemPrompt`, `AgentRegistry`, `ToolRuntime`, `GoalService`, and `toolGoal`; create a registry-compatible stub `Agent` with a real `Session` and `Inbox`.

The test must execute these exact cases:

```ts
openTurn(root, { kind: 'user' })
const human = await executeGoalTool(
  ctx,
  root.agent,
  'create_goal',
  { objective: 'Keep the top-level goal human-owned', max_goal_rounds: 1 },
)
expect(human.isError).toBe(false)

closeTurn(root, 1)
openTurn(root, { kind: 'plugin', plugin: 'tianwen-evidence' })
const plugin = await executeGoalTool(
  ctx,
  root.agent,
  'update_goal',
  {
    goal_id: created.id,
    revision: created.revision,
    action: 'edit',
    objective: 'silently replaced',
  },
)
expect(plugin.error?.info?.code).toBe('GOAL_TOOL_AUTHORITY_REQUIRED')
expect(ctx.goals.get(root.agent)?.objective)
  .toBe('Keep the top-level goal human-owned')
```

Also prove a child agent with a user-looking turn cannot mutate the root Goal.

- [ ] **Step 2: Add the restart contract before implementation changes**

In `goal-recovery.spec.ts`:

1. Create a UUID-named child below `D:\DevData\tianwen-dsh-probe\sessions` with a fresh first Context.
2. Mount the persistent public harness plus `GoalService`, but do not mount `goalRoundDriver` in Context 1.
3. Create an agent and a Goal `{ objective: "resume safely", maxGoalRounds: 1 }`.
4. Flush the session and dispose the whole Context.
5. Create a new Context against the same JSONL root, mounting `GoalService` and `goalRoundDriver` before `AgentLoop`.
6. Resume through `ctx.agents.resume({ resumeSessionId, agentOptions: { provider: "tianwen-probe", model: "scripted" } })`.
7. Assert recovered Goal fields match and `activation === "disarmed"`.
8. Assert the second adapter has zero requests.
9. Read the recovered public Session events and record the durable event
   sequence before resume. Prove no event after restart has armed or advanced
   the Goal and no model request exists.
10. Call `ctx.goals.resume(resumed.agent, recoveredGoal)`.
11. Require the first durable Goal-resume/round event sequence to occur only
    after the explicit call above; bind it to the recovered Goal id and
    revision.
12. Wait until the Goal reaches the one-round cap; assert exactly one request,
    exactly one admitted goal-round message and final phase `blocked` with
    code `round-limit`.

- [ ] **Step 3: Run RED against missing probe helpers or incompatible public behavior**

Run:

```powershell
pnpm.cmd exec vitest run tests/dsh-probe/goal-authority.spec.ts tests/dsh-probe/goal-recovery.spec.ts
```

Valid RED:

- helper/public seam not yet sufficient;
- recovered Goal fails to project;
- recovered activation is not disarmed;
- model request occurs before explicit resume.

An rc.6 public API mismatch is a probe finding. Do not import an upstream private helper to make the test pass.

- [ ] **Step 4: Add only the minimum compat helpers**

If needed, add public helper functions to `tianwen-dsh-compat`:

```ts
export async function mountGoalHarness(
  persistenceRoot: string,
  script: ScriptEntry[],
): Promise<MountedGoalHarness>

export async function executeRegisteredTool(
  ctx: Context,
  agent: Agent,
  name: string,
  argumentsValue: unknown,
): Promise<ToolExecutionResult>
```

`mountGoalHarness()` may mount only public package roots and may return its
test Context. Product evidence/evolution packages must not add Goal mutation
dependencies.

Provide an explicit `goalRoundDriver: boolean` option. Context 1 uses `false`
so Goal creation cannot start an autonomous round; Context 2 uses `true` and
must still recover disarmed.

- [ ] **Step 5: Prove authority and restart behavior**

Run:

```powershell
pnpm.cmd exec vitest run tests/dsh-probe/goal-authority.spec.ts tests/dsh-probe/goal-recovery.spec.ts
pnpm.cmd run typecheck
pnpm.cmd run check:no-private-dsh-imports
```

Expected: all pass, no model request before explicit resume.

- [ ] **Step 6: Scoped review and commit**

Reviewer must specifically inspect:

- whether an honestly plugin-sourced turn and a child-sourced turn are rejected;
- whether evidence/evolution product packages gained GoalService dependencies;
- whether restart uses a fresh Context and real JSONL backend;
- whether durable event sequence proves resume occurs after the explicit call;
- whether any hidden model request occurs before explicit resume;
- whether the handoff records the known same-process forged-`user` limitation.

Commit:

```powershell
git add packages/tianwen-dsh-compat tests/dsh-probe/goal-authority.spec.ts tests/dsh-probe/goal-recovery.spec.ts
git commit -m "test: prove harness goal authority and recovery"
```

---

## Task 5: Project DSH Session Events into Minimal, Replay-Safe Tianwen Evidence

**Files:**

- Create: `packages/tianwen-evidence/package.json`
- Create: `packages/tianwen-evidence/tsconfig.json`
- Create: `packages/tianwen-evidence/src/index.ts`
- Create: `packages/tianwen-evidence/src/projector.ts`
- Create: `tests/dsh-probe/evidence.spec.ts`

**Interfaces:**

- Consumes: one DSH `Session` and its append-only public `SessionEvent[]`.
- Produces:

```ts
export interface EvidenceRecord {
  readonly schemaVersion: 'tianwen.evidence.v1'
  readonly evidenceId: `sha256:${string}`
  readonly source: {
    readonly kind: 'dsh-session-events'
    readonly sessionId: string
    readonly callSeq: number
    readonly resultSeq?: number
  }
  readonly action: {
    readonly callId: string
    readonly toolName: string
    readonly argumentsDigest: `sha256:${string}`
  }
  readonly outcome:
    | {
      readonly status: 'complete'
      readonly resultDigest: `sha256:${string}`
      readonly errorCode?: string
    }
    | {
      readonly status: 'missing-result'
    }
}
```

- Does not copy raw user conversation, raw tool arguments, or raw tool result into the Tianwen record.
- Replaying the same Session events returns byte-for-byte equivalent evidence in the same order.

- [ ] **Step 1: Create the evidence package manifests**

Use the same package/tsconfig pattern as `@tianwen/dsh-compat`, with:

```json
{
  "name": "@tianwen/evidence",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "dependencies": {
    "@tianwen/dsh-compat": "workspace:*"
  },
  "scripts": {
    "build": "tsc -b",
    "typecheck": "tsc -b --pretty false"
  }
}
```

Do not give this package `GoalService`, `DynamicCordisRunnerService`, sandbox, filesystem-write, or approval dependencies.

- [ ] **Step 2: Write the pure projection RED tests**

In `tests/dsh-probe/evidence.spec.ts`, first construct a small event list with:

- one `tool/call` and matching `tool/result`;
- one `tool/call` without a result;
- one unrelated user message.

Assert:

```ts
const first = projectEvidence(SessionId('evidence-replay'), events)
const second = projectEvidence(SessionId('evidence-replay'), structuredClone(events))

expect(first).toEqual(second)
expect(first).toHaveLength(2)
expect(first[0]).toMatchObject({
  source: { callSeq: 3, resultSeq: 4 },
  action: { callId: 'call-complete', toolName: 'echo' },
  outcome: { status: 'complete' },
})
expect(first[1]).toMatchObject({
  source: { callSeq: 5 },
  outcome: { status: 'missing-result' },
})
expect(JSON.stringify(first)).not.toContain('raw-secret-argument')
expect(JSON.stringify(first)).not.toContain('raw-secret-result')
```

The test must use real `SessionEvent` shapes from the public rc.6 types, including `surfaceOp` / `sourceEventSeqs` where the event schema requires them.

- [ ] **Step 3: Write a real AgentLoop tool-call projection test**

Use:

```ts
const harness = await mountCoreHarness([
  toolCallResponse('call-1', 'echo', { text: 'private input' }),
  textResponse('done'),
])
harness.ctx.tools.register(defineTool({
  name: 'echo',
  description: 'return one fixed value',
  parameters: { text: { type: 'string', required: true } },
  output: {
    schema: { type: 'string' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  async execute(args) {
    return `private result:${args.text}`
  },
}))
```

Create an agent, send one human message, wait for idle, then project its real `session.events`.

Require:

- exactly one complete EvidenceRecord;
- `callSeq < resultSeq`;
- matching `callId`;
- arguments and result digests are stable;
- JSON projection does not contain `private input` or `private result`;
- DSH Session still contains the original facts, proving the two-ledger split.

- [ ] **Step 4: Add a persistence/replay test**

Repeat the real tool flow with `mountPersistentHarness()`:

1. flush and dispose Context 1;
2. mount fresh Context 2 on the same JSONL root;
3. resume the session without sending a new message;
4. compare Evidence projected before and after restart.

Require exact deep equality and identical canonical JSON bytes. No new model request may occur during the comparison.

- [ ] **Step 5: Run RED**

Run:

```powershell
pnpm.cmd exec vitest run tests/dsh-probe/evidence.spec.ts
```

Expected: FAIL because `@tianwen/evidence` and `projectEvidence()` do not exist.

- [ ] **Step 6: Implement canonical hashing and call/result folding**

`projector.ts` must:

1. sort object keys recursively before JSON serialization;
2. hash UTF-8 bytes with SHA-256 and prefix `sha256:`;
3. index `tool/call` by `String(callId)`;
4. pair `tool/result` through `message.toolCallId`;
5. reject duplicate call IDs that point to different call seqs;
6. reject a duplicate result for the same call and a result with no matching call;
7. preserve tool-call order, not result completion order;
8. emit one `missing-result` record when no result exists;
9. derive `evidenceId` from the canonical `{ sessionId, callSeq, resultSeq, callId, toolName, argumentsDigest, resultDigest, status }`.

Use this canonicalization boundary:

```ts
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    return `{${entries.join(',')}}`
  }
  const encoded = JSON.stringify(value)
  if (encoded === undefined) {
    throw new TypeError('canonical JSON does not support this value')
  }
  return encoded
}
```

Fail on unsupported values rather than silently stringifying functions or symbols. DSH events are already JSON-serializable.

- [ ] **Step 7: Expose a read-only Cordis service**

`packages/tianwen-evidence/src/index.ts` may expose:

```ts
export class TianwenEvidenceService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'tianwenEvidence')
  }

  project(session: Session): readonly EvidenceRecord[] {
    return projectEvidence(session.id, session.events)
  }
}
```

Augment Cordis `Context` with `tianwenEvidence`. The service has no mutation methods and no injected capabilities.

- [ ] **Step 8: Update the workspace lockfile offline**

Run:

```powershell
pnpm.cmd install --offline --lockfile-only --store-dir D:\DevData\pnpm-store
pnpm.cmd install --offline --frozen-lockfile --store-dir D:\DevData\pnpm-store
```

- [ ] **Step 9: Prove projection and privacy**

Run:

```powershell
pnpm.cmd --filter @tianwen/evidence build
pnpm.cmd exec vitest run tests/dsh-probe/evidence.spec.ts
pnpm.cmd run typecheck
pnpm.cmd run check:no-private-dsh-imports
```

Expected: complete, missing-result, restart idempotence, and privacy assertions all pass.

- [ ] **Step 10: Scoped review and commit**

Reviewer must verify that:

- the Tianwen record cites stable Session/event locations;
- it does not duplicate raw conversation/tool payloads;
- missing results cannot be mistaken for success;
- replay does not create duplicate Evidence;
- evidence code cannot mutate Goal or versions.

Commit:

```powershell
git add packages/tianwen-evidence tests/dsh-probe/evidence.spec.ts pnpm-lock.yaml
git commit -m "feat: project harness events into tianwen evidence"
```

---

## Task 6: Reuse the Existing Python A1 Evaluator Through a Typed Worker Bridge

**Files:**

- Create: `packages/tianwen-evaluator-python/package.json`
- Create: `packages/tianwen-evaluator-python/tsconfig.json`
- Create: `packages/tianwen-evaluator-python/src/index.ts`
- Create: `packages/tianwen-evaluator-python/src/protocol.ts`
- Create: `scripts/dsh_probe_alpha_a1_evaluator.py`
- Create: `tests/dsh-probe/python-a1-evaluator.spec.ts`

**Interfaces:**

```ts
export interface EvalRequestV1 {
  readonly schema_version: 'tianwen.eval_request.v1'
  readonly request_id: string
  readonly task_id: 'A1'
  readonly candidate_kind: 'nop' | 'oracle'
  readonly expected_task_bundle_digest: `sha256:${string}`
  readonly expected_model_input_digest: `sha256:${string}`
}

export interface EvalReceiptV1 {
  readonly schema_version: 'tianwen.eval_receipt.v1'
  readonly request_id: string
  readonly task_id: 'A1'
  readonly candidate_kind: 'nop' | 'oracle'
  readonly candidate_digest: `sha256:${string}`
  readonly task_bundle_digest: `sha256:${string}`
  readonly model_input_digest: `sha256:${string}`
  readonly verdict: 'met' | 'not_met' | 'inconclusive'
  readonly raw_stdout: string
  readonly raw_stdout_digest: `sha256:${string}`
}
```

The bridge owns all filesystem paths and process argv. Callers choose only `nop` or `oracle`.

- [ ] **Step 1: Create the TypeScript package manifests**

Use package name `@tianwen/evaluator-python` and the same private ESM build pattern. It may depend only on Node built-ins and `@tianwen/dsh-compat`; it must not add another Agent framework.

- [ ] **Step 2: Add protocol validation tests before the worker**

In `python-a1-evaluator.spec.ts`, add pure tests that reject:

- wrong schema version;
- wrong `request_id`;
- `task_id` other than A1;
- missing `sha256:` prefix;
- receipt digest not matching `raw_stdout`;
- receipt task/model digests not matching the request.

The TypeScript parser must fail closed with a specific `EvalProtocolError`.

- [ ] **Step 3: Add the end-to-end RED test**

Use the existing frozen files:

```text
alpha/tasks/A1/task.json
alpha/tasks/A1/seed/records.py
alpha/tasks/A1/reference/solution.patch
alpha/tasks/A1/verifier/verify.py
alpha/environment/image.lock
```

Run twice for each candidate:

```ts
const nop1 = await evaluator.evaluateA1('nop')
const nop2 = await evaluator.evaluateA1('nop')
const oracle1 = await evaluator.evaluateA1('oracle')
const oracle2 = await evaluator.evaluateA1('oracle')

expect(nop1.verdict).toBe('not_met')
expect(nop1.raw_stdout).toBe(nop2.raw_stdout)
expect(nop1.raw_stdout_digest).toBe(nop2.raw_stdout_digest)
expect(oracle1.verdict).toBe('met')
expect(oracle1.raw_stdout).toBe(oracle2.raw_stdout)
expect(oracle1.raw_stdout_digest).toBe(oracle2.raw_stdout_digest)
expect(nop1.task_bundle_digest).toBe(oracle1.task_bundle_digest)
expect(nop1.model_input_digest).toBe(oracle1.model_input_digest)
```

Also parse `raw_stdout` and require the exact A1 `7/7 checks passed` Oracle result.

- [ ] **Step 4: Run RED**

Run:

```powershell
$env:TIANWEN_DSH_PROBE_ROOT = 'D:\DevData\tianwen-dsh-probe'
pnpm.cmd exec vitest run tests/dsh-probe/python-a1-evaluator.spec.ts
```

Expected: FAIL because the evaluator package and Python worker do not exist.

- [ ] **Step 5: Implement the Python worker with fixed authority**

`scripts/dsh_probe_alpha_a1_evaluator.py` must:

1. accept exactly `--repo-root`, `--state-root`, `--request`, `--result`;
2. resolve and require the repository to be the current Tianwen worktree;
3. require `state-root`, request file, result file, TEMP and TMP to remain
   below `D:\DevData\tianwen-dsh-probe` on Windows;
4. construct A1 paths itself; request JSON cannot supply verifier, patch, command, task directory, or arbitrary workspace path;
5. call `load_task_bundle(repo_root / "alpha/tasks/A1", repo_root / "alpha/environment/image.lock")`;
6. compare request task/model digests before any candidate action;
7. create one new workspace below the D drive `state-root`;
8. copy only A1 `seed/`;
9. resolve Git once with `shutil.which("git")`, require an absolute executable
   path, and do not rely on a mutable `PATH` inside the worker;
10. for `oracle`, apply the frozen `solution.patch` with:

```python
subprocess.run(
    [git_executable, "apply", "--whitespace=nowarn", str(solution_patch)],
    cwd=workspace,
    check=True,
    capture_output=True,
    timeout=15,
    env=minimal_env(),
)
```

11. run the verifier with:

```python
subprocess.run(
    [
        sys.executable,
        "-I",
        str(task_dir / "verifier" / "verify.py"),
        str(workspace),
    ],
    check=True,
    capture_output=True,
    text=True,
    timeout=15,
    env=minimal_env(),
)
```

12. preserve stdout exactly, including its final newline;
13. compute candidate, stdout, task bundle, and model input digests;
14. atomically write canonical UTF-8 + LF JSON to the exact result path;
15. never use `shell=True`, network, Docker, or model credentials.

For Nop, `candidate_digest` is SHA-256 of empty bytes. For Oracle, it is SHA-256 of the exact frozen patch bytes.

- [ ] **Step 6: Implement the TypeScript bridge**

`PythonA1Evaluator` constructor:

```ts
export interface PythonA1EvaluatorOptions {
  readonly repoRoot: string
  readonly stateRoot: string
  readonly pythonExecutable: string
}
```

`evaluateA1(candidateKind)` must:

1. require `stateRoot` below `D:\DevData\tianwen-dsh-probe` on Windows;
2. bind the exact A1 task/model digest constants specified in this plan;
3. write a request file with a fresh UUID;
4. invoke `pythonExecutable` directly with argv, `shell: false`;
5. supply a minimal environment containing only Windows runtime paths, TEMP/TMP under D, `UV_OFFLINE=1`, and no key/token/secret variables;
6. require exit code 0;
7. validate the result with `parseEvalReceipt()`;
8. return the typed receipt;
9. retain request/result files for audit.

The exact frozen A1 authorities on the required base commit are:

```text
task_bundle_digest = sha256:15e08373a535c14bb0de636724170afb05cbb2e8ace1f91ca53bc877f73184d0
model_input_digest = sha256:b8f76aae549aeca56d9a4749aa188788648fc0fae578f422c85cfb6da28eb490
```

The TypeScript bridge must put these exact constants in each request. The
Python worker independently loads A1 and rejects a mismatch before applying a
candidate. Do not try to read these fields from `task.json`; they are derived
bundle authorities and are not stored there.

Default Python executable for this repository is the `Scripts\python.exe`
file inside the `.venv` directory below `options.repoRoot`.

If absent, fail with a clear instruction to run the frozen Python baseline first. Do not silently use an unrelated global interpreter.

- [ ] **Step 7: Update the workspace lockfile offline**

Run:

```powershell
pnpm.cmd install --offline --lockfile-only --store-dir D:\DevData\pnpm-store
pnpm.cmd install --offline --frozen-lockfile --store-dir D:\DevData\pnpm-store
```

- [ ] **Step 8: Prove the reused A1 contract**

Run:

```powershell
$env:TIANWEN_DSH_PROBE_ROOT = 'D:\DevData\tianwen-dsh-probe'
$env:UV_CACHE_DIR = 'D:\DevData\uv-cache'
$env:UV_OFFLINE = '1'
pnpm.cmd --filter @tianwen/evaluator-python build
pnpm.cmd exec vitest run tests/dsh-probe/python-a1-evaluator.spec.ts
uv run pytest tests\alpha\test_task_packages.py -k A1 -q
uv run ruff check scripts\dsh_probe_alpha_a1_evaluator.py
```

Expected:

- Nop `not_met`;
- Oracle `met`;
- raw stdout repeatability exact;
- task/model digests equal existing frozen authority;
- existing Python A1 author proof remains green.

- [ ] **Step 9: Scoped review and commit**

Reviewer must verify:

- no arbitrary command/path from request reaches subprocess;
- no shell string;
- task package/verifier/patch are reused, not rewritten;
- EvalReceipt cannot lie about request/task/candidate/stdout digests;
- failure becomes `inconclusive` or a hard protocol failure, never `met`.

Commit:

```powershell
git add packages/tianwen-evaluator-python scripts/dsh_probe_alpha_a1_evaluator.py tests/dsh-probe/python-a1-evaluator.spec.ts pnpm-lock.yaml
git commit -m "feat: bridge harness trials to python a1 evaluator"
```

---

## Task 7: Keep Formal Artifact Governance Outside Process-Local Dynamic Cordis Versions

**Files:**

- Create: `packages/tianwen-evolution/package.json`
- Create: `packages/tianwen-evolution/tsconfig.json`
- Create: `packages/tianwen-evolution/src/index.ts`
- Create: `packages/tianwen-evolution/src/ledger.ts`
- Create: `packages/tianwen-evolution/src/runtime-binding.ts`
- Create: `tests/dsh-probe/evolution.spec.ts`

**Interfaces:**

```ts
export type ArtifactId = `artifact:${string}`

export interface ArtifactVersion {
  readonly artifactId: ArtifactId
  readonly parentArtifactId?: ArtifactId
  readonly sourceDigest: `sha256:${string}`
  readonly createdAt: string
}

export interface EvaluationRecord {
  readonly artifactId: ArtifactId
  readonly receiptDigest: `sha256:${string}`
  readonly verdict: 'met' | 'not_met' | 'inconclusive'
}

export interface ApprovalRecord {
  readonly artifactId: ArtifactId
  readonly authority: 'human'
  readonly approvalId: string
}

export interface ChampionPointer {
  readonly artifactId: ArtifactId
  readonly revision: number
}
```

The ledger is append-only JSONL. Immutable source blobs live by digest. `champion.json` is a derived atomic pointer and must be reconstructable from the ledger.

- [ ] **Step 1: Create the package without Goal authority**

Use package name `@tianwen/evolution`. Dependencies:

```json
{
  "@deepseek-ai/cordis-plugin-timer": "1.1.3",
  "@tianwen/dsh-compat": "workspace:*"
}
```

The package may inject `dynamicCordisRunner`; it must not import or inject `GoalService`, model-facing Goal tools, session persistence internals, or user conversation data.

- [ ] **Step 2: Write pure ledger RED tests**

Test these rules before mounting Dynamic Cordis:

1. the same source bytes replay to the same `ArtifactId`;
2. different bytes create a different Artifact;
3. immutable source file cannot be replaced at the same digest;
4. `promote()` rejects missing evaluation;
5. `promote()` rejects `not_met` / `inconclusive`;
6. `promote()` rejects missing human approval;
7. champion revision increases monotonically;
8. reload from disk reproduces all events and the same Champion;
9. rollback appends history and never deletes the rejected/promoted versions.

Use an injected deterministic clock in unit tests.

- [ ] **Step 3: Write the Dynamic Cordis integration RED test**

Mount only public packages:

```text
Context
cordis-plugin-timer
SystemPrompt
ToolRuntime
DynamicCordisRunnerService
TianwenEvolutionService
```

Use a host-only stub Agent and these exact source bodies:

```ts
const V1 = 'return { name: "v1", apply() {} }'
const V2 = 'return { name: "v2", apply() {} }'
const BROKEN = 'throw new Error("broken update")'
const UNAPPROVED = 'return { name: "unapproved", apply() {} }'
```

Run this sequence:

1. record/evaluate/approve/promote V1;
2. require formal Champion V1 and Dynamic current/active package V1;
3. record/evaluate/approve/promote V2;
4. require Champion V2, with V1 history preserved;
5. rollback to V1 under a second human approval;
6. require Champion V1 and V2 history preserved;
7. record/evaluate BROKEN as `met`, approve it, attempt promotion;
8. require activation failure, Champion still V1, and V1 is reactivated;
9. record/evaluate UNAPPROVED as `met`, attempt promotion without approval;
10. require refusal before `define()` / `run()` and no Dynamic inventory change.

- [ ] **Step 4: Add a process-restart rehydration contract**

After the sequence:

1. dispose the first Context;
2. create a fresh Context and Dynamic runner;
3. reload the same Tianwen Ledger;
4. require Dynamic inventory initially empty, proving process-local state was not mistaken for persistence;
5. call `rehydrateChampion(agent)`;
6. require the same formal V1 `ArtifactId` to bind to a newly minted Dynamic `pluginId/packageId`;
7. require one `runtime-bound` ledger event citing the new opaque IDs without changing Champion revision.

The immutable source blob, not the old Dynamic package ID, is restart authority.

- [ ] **Step 5: Run RED**

Run:

```powershell
$env:TIANWEN_DSH_PROBE_ROOT = 'D:\DevData\tianwen-dsh-probe'
pnpm.cmd exec vitest run tests/dsh-probe/evolution.spec.ts
```

Expected: FAIL because the evolution ledger/service do not exist.

- [ ] **Step 6: Implement the append-only ledger**

`ledger.ts` must:

- store immutable source under the configured ledger root in
  `artifacts/sha256-` followed by the 64-character digest and `.mjs`;
- write the file with `wx` semantics; exact same replay is allowed, different bytes at the same claimed digest fail;
- append one canonical JSON object plus `\n` per event to `ledger.jsonl` under
  the configured ledger root;
- `fsync` the file before reporting an accepted event;
- atomically replace `champion.json` under the configured ledger root only
  after the corresponding runtime activation succeeds;
- rebuild Champion from ledger at startup and reject pointer disagreement;
- retain failed activation, rejected evaluation, promotion, rollback, and runtime-binding events.

No recursive database abstraction, plugin marketplace, migration system, or generic event bus is needed in this probe.

- [ ] **Step 7: Implement transactional runtime binding**

`runtime-binding.ts` must treat Dynamic Cordis IDs as ephemeral:

```ts
export interface RuntimeBinding {
  readonly artifactId: ArtifactId
  readonly pluginId: string
  readonly packageId: string
}
```

Promotion order:

```text
validate EvalReceipt
  -> validate human approval
  -> read immutable source by digest
  -> define Dynamic package
  -> run/update Dynamic package
  -> if success: append promotion + atomically move Champion
  -> if failure: append activation-failed + run previous Champion package again
  -> verify previous Champion is active before returning failure
```

If restoration of the previous Champion also fails, return a distinct `EvolutionRecoveryError` and mark the probe blocked. Never move the pointer to the failed candidate.

- [ ] **Step 8: Update the workspace lockfile offline**

Run:

```powershell
pnpm.cmd install --offline --lockfile-only --store-dir D:\DevData\pnpm-store
pnpm.cmd install --offline --frozen-lockfile --store-dir D:\DevData\pnpm-store
```

- [ ] **Step 9: Prove formal history, failed update safety, rollback, and restart**

Run:

```powershell
pnpm.cmd --filter @tianwen/evolution build
pnpm.cmd exec vitest run tests/dsh-probe/evolution.spec.ts
pnpm.cmd run typecheck
pnpm.cmd run check:no-private-dsh-imports
```

Expected: all rules pass; no Dynamic ID is used as formal Artifact identity.

- [ ] **Step 10: Scoped review and commit**

Reviewer must focus on:

- any path where unapproved/unevaluated code can run;
- pointer updates before successful activation;
- failed update leaving no active Champion;
- process-local IDs being persisted as formal authority;
- rollback deleting history;
- direct Goal mutation capability leaking into evolution.

Commit:

```powershell
git add packages/tianwen-evolution tests/dsh-probe/evolution.spec.ts pnpm-lock.yaml
git commit -m "feat: govern dynamic harness artifact versions"
```

---

## Task 8: Run the Real DSH Local Sandbox Gate on a Disposable D Drive Workspace

**Files:**

- Modify: `vitest.config.ts`
- Create: `tests/dsh-probe/sandbox.e2e.spec.ts`

**Interfaces:**

- Uses real `LocalSandboxProvider.confine(argv, policy)`.
- Proves read-only mode blocks a workspace write.
- Proves workspace-write mode permits a workspace write.
- On `full` enforcement, additionally proves a sibling directory write is denied.
- On `partial` enforcement, records that sibling protection is not proven and classifies high-risk execution as requiring a stronger provider.

- [ ] **Step 1: Make the e2e file discoverable but skipped by default**

Remove the hard `exclude` entry for `sandbox.e2e.spec.ts` from `vitest.config.ts`.

At the top of the test:

```ts
const runSandbox = process.env.TIANWEN_RUN_DSH_SANDBOX === '1'
const describeSandbox = runSandbox ? describe : describe.skip
```

Default `pnpm test:dsh` should show the suite as skipped. Final probe acceptance must run it with the environment switch.

- [ ] **Step 2: Write the real sandbox RED test**

Use a dedicated root:

```text
D:\DevData\tianwen-dsh-probe\sandbox
```

For each test create a unique child directory. Never pass the repository, user profile, DSH home, credentials, or another project as `workspaceRoot`.

Mount:

```ts
const ctx = new Context()
await ctx.plugin(LocalSandboxProvider, {})
```

Create confined argv:

```ts
const confined = ctx.sandbox.confine(
  [
    process.execPath,
    '-e',
    'require("node:fs").writeFileSync(process.argv[1], "probe")',
    targetPath,
  ],
  {
    mode: 'read-only',
    workspaceRoot,
    sessionId: SessionId('sandbox-read-only'),
  },
)
```

Spawn `confined.argv[0]` with `confined.argv.slice(1)`, `shell: false`, a minimal environment, and a 15-second timeout.

- [ ] **Step 3: Distinguish denial from runner failure**

Implement a test-local classifier that:

1. applies each `runnerFailureRule.allowedExitCodes`;
2. removes exact informational stderr lines;
3. checks `fatalSignatures`;
4. checks only the selected backend's `denialSignatures`.

Read-only acceptance requires:

- process exit nonzero;
- no runner-failure rule match;
- at least one denial signature match;
- target file absent.

A nonzero exit by itself is not proof that sandboxing worked.

- [ ] **Step 4: Add workspace-write and outside-root cases**

Workspace-write acceptance requires:

- process exit 0;
- file created with exact content `probe`;
- no runner-failure signature.

Then attempt a write to a sibling path:

- if `enforcement === "full"`, require denial and absent file;
- if `enforcement === "partial"`, record `outsideRootProtection: "not-proven"` and do not describe it as safe for adversarial code.

On Windows, require the provider to report `partial`. A future upstream release reporting `full` must be treated as a compatibility change and reviewed, not silently accepted.

- [ ] **Step 5: Preserve a machine-readable sandbox report**

Write:

```text
D:\DevData\tianwen-dsh-probe\sandbox-report.json
```

Fields:

```json
{
  "schemaVersion": "tianwen.dsh_sandbox_probe.v1",
  "platform": "win32",
  "provider": "@deepseek-ai/dsh-sandbox-local@0.1.0-rc.6",
  "enforcement": "partial",
  "readOnlyWorkspaceWrite": "denied",
  "workspaceWriteInsideRoot": "allowed",
  "outsideRootProtection": "not-proven",
  "highRiskRecommendation": "use-container-remote-or-microvm"
}
```

Use actual observed platform and enforcement values; the JSON above is the expected Windows shape.

- [ ] **Step 6: Run the real controlled gate**

Run:

```powershell
$env:TIANWEN_DSH_PROBE_ROOT = 'D:\DevData\tianwen-dsh-probe'
$env:TIANWEN_RUN_DSH_SANDBOX = '1'
pnpm.cmd exec vitest run tests/dsh-probe/sandbox.e2e.spec.ts
```

Expected on the current Windows host:

- read-only write denied;
- workspace-write inside root allowed;
- enforcement `partial`;
- report written;
- no Docker, network, or paid model.

If DSH reports `SANDBOX_UNAVAILABLE`, runner failure, or read-only permits the write, mark the sandbox gate failed. Do not retry unconfined.

- [ ] **Step 7: Re-run default tests without the opt-in**

Run:

```powershell
Remove-Item Env:TIANWEN_RUN_DSH_SANDBOX -ErrorAction SilentlyContinue
pnpm.cmd run test:dsh
```

Expected: ordinary probe tests pass; real sandbox suite is reported skipped.

- [ ] **Step 8: Scoped review and commit**

Reviewer must verify:

- the test touched only the D drive probe directory;
- nonzero exit was not mistaken for denial;
- `partial` was not promoted to strong isolation;
- no fallback to `danger-full-access`;
- no Docker or network call.

Commit:

```powershell
git add vitest.config.ts tests/dsh-probe/sandbox.e2e.spec.ts
git commit -m "test: prove local harness sandbox boundary"
```

---

## Task 9: Run the Whole Probe, Obtain Independent Review, and Produce a Runtime-Selection Decision

**Files:**

- Create: `docs/operations/deepseek-harness-compatibility-probe-handoff.md`
- Create: `docs/research/2026-08-14-deepseek-harness-compatibility-probe-result.md`
- Do not modify yet: `docs/superpowers/specs/2026-08-14-deepseek-harness-runtime-selection-design.md`
- Do not modify yet: `docs/architecture-master-session-memory.md`

**Purpose:** 把测试事实转换成主控和用户能看懂的选型结论，但不替用户做正式迁移决策。

- [ ] **Step 1: Run the exact final offline gates**

Set:

```powershell
$env:PNPM_STORE_DIR = 'D:\DevData\pnpm-store'
$env:TIANWEN_DSH_PROBE_ROOT = 'D:\DevData\tianwen-dsh-probe'
$env:UV_CACHE_DIR = 'D:\DevData\uv-cache'
$env:UV_OFFLINE = '1'
```

Run:

```powershell
pnpm.cmd install --offline --frozen-lockfile --store-dir D:\DevData\pnpm-store
pnpm.cmd run check:dsh-install
pnpm.cmd run check:no-private-dsh-imports
pnpm.cmd run typecheck
pnpm.cmd run test:dsh
$env:TIANWEN_RUN_DSH_SANDBOX = '1'
pnpm.cmd exec vitest run tests/dsh-probe/sandbox.e2e.spec.ts
Remove-Item Env:TIANWEN_RUN_DSH_SANDBOX -ErrorAction SilentlyContinue
uv run pytest tests\alpha\test_task_packages.py -k A1 -q
uv run pytest -q
uv run ruff check .
git diff --check 67ef50f673c7786872cf5729a808dd3fe85afcfb..HEAD
git status --short
```

All commands must have clean exit codes. Record exact counts and durations instead of predicting them in advance.

- [ ] **Step 2: Verify zero forbidden effects**

Use test logs and process invocation records to assert:

- paid model requests: 0;
- real Docker invocations: 0;
- live web/search requests: 0;
- private DSH source imports: 0;
- writes outside repository and `D:\DevData\tianwen-dsh-probe`: 0;
- automatic Goal mutation before human authority: 0;
- unapproved candidate activation attempts: 0.

Dependency installation and Git push are recorded separately and are not model/web exploration.

- [ ] **Step 3: Write the technical result document**

`docs/research/2026-08-14-deepseek-harness-compatibility-probe-result.md` must contain:

1. exact Alpha base SHA and final probe SHA;
2. exact npm DSH version and lockfile evidence;
3. explicit rc.5-source / rc.6-published-package distinction;
4. Profile composition result;
5. Goal authority and restart result;
6. Evidence pairing, privacy, and replay result;
7. Python A1 Nop/Oracle/repeatability result;
8. Artifact/Champion failed-update, rollback, and rehydration result;
9. sandbox enforcement result;
10. all open Critical/Important/Minor findings;
11. one of the decision labels below.

Decision labels:

```text
ADOPT_DSH_RUNTIME_CANDIDATE
  All load-bearing gates pass through public packages.
  Use DSH as runtime kernel, Tianwen plugins/ledger for continual learning,
  Python for independent evaluation, and a stronger optional provider for high-risk code.

LIMITED_DSH_REUSE
  Agent loop/session/goal are usable, but one or more plugin, version-governance,
  evaluator, or sandbox seams require a narrower hybrid boundary.

KEEP_PYTHON_RUNTIME
  A load-bearing public seam fails, requires private imports/forking, weakens Goal authority,
  loses audit/recovery facts, or cannot keep candidates separate from Champion.
```

Do not label Windows `partial` sandbox alone as failure if ordinary read-only/workspace-write behavior passes; instead record that high-risk evaluation still needs Docker/remote/microVM.

- [ ] **Step 4: Write the operational handoff**

`docs/operations/deepseek-harness-compatibility-probe-handoff.md` must include:

- status: complete / blocked;
- branch;
- exact commits;
- exact remote SHA after push;
- package versions;
- command outputs;
- D drive artifact/report paths;
- independent review findings and fix waves;
- what existing Python code remains authoritative;
- whether Task 10 remains frozen;
- exact recommended next plan if adopted.

The handoff must state plainly:

```text
This probe does not make Tianwen production-ready and does not authorize full migration.
```

- [ ] **Step 5: Obtain a fresh whole-probe review**

The reviewer reads:

- runtime-selection design;
- source audit;
- this implementation plan;
- all commits from `67ef50f673c7786872cf5729a808dd3fe85afcfb`
  to final HEAD;
- both result documents;
- final command evidence.

Review focus:

- public package usage only;
- Goal human authority;
- restart and event replay;
- evidence privacy and traceability;
- Python evaluator request/receipt binding;
- unapproved candidate zero-effect;
- transactional Champion movement;
- failed update restoration;
- Dynamic ID ephemerality;
- sandbox result classification;
- hidden migration or scope expansion.

No open Critical or Important is allowed for a passing recommendation.

- [ ] **Step 6: Apply at most one final cross-task repair wave**

If the whole-probe reviewer finds Critical/Important issues:

1. create one bounded repair plan listing exact findings;
2. add failing regression tests;
3. implement only the minimum fixes;
4. rerun affected focused tests plus every final gate;
5. request one narrow re-review.

If Critical/Important remains, mark the probe blocked and recommend `LIMITED_DSH_REUSE` or `KEEP_PYTHON_RUNTIME` based on the failed seam. Do not keep repairing indefinitely.

- [ ] **Step 7: Commit documents and push the probe branch**

Run:

```powershell
git add docs/operations/deepseek-harness-compatibility-probe-handoff.md docs/research/2026-08-14-deepseek-harness-compatibility-probe-result.md
git commit -m "docs: hand off deepseek harness compatibility probe"
git push -u origin codex/deepseek-harness-probe
git ls-remote origin refs/heads/codex/deepseek-harness-probe
```

Use the already authorized command-scoped local proxy only if direct GitHub access fails. Do not change global Git configuration and do not force-push.

- [ ] **Step 8: Return control to the architecture master**

Send a structured handoff to the main controller. The main controller, not the implementation task, will:

1. independently read the result and remote SHA;
2. explain the conclusion to the user in plain Chinese;
3. ask for a decision only if the evidence leaves a real value tradeoff;
4. after user approval, update the runtime-selection design and master memory;
5. create a new migration plan if `ADOPT_DSH_RUNTIME_CANDIDATE`;
6. keep Task 10 frozen until the sandbox/evaluator boundary is redesigned.

The implementation task must not start the migration, merge branches, modify `main`, or launch another task by itself.

---

## Probe Completion Gates

The probe is complete only when all applicable gates have direct evidence:

1. exact rc.6 npm closure and frozen lockfile;
2. public-package imports only;
3. installable Tianwen Bundle/Profile and keyless adapter;
4. human Goal authority and plugin/child rejection;
5. recovered Goal disarmed with zero pre-resume model requests;
6. DSH tool call/result projected into minimal replay-safe Evidence;
7. Python A1 Nop/Oracle/raw-repeatability retained;
8. candidate cannot become Champion without independent evaluation and human approval;
9. failed Dynamic update leaves formal and active Champion unchanged/restored;
10. rollback preserves history;
11. process restart rehydrates the formal Champion without trusting old Dynamic IDs;
12. DSH local sandbox proves read-only/workspace-write behavior and reports enforcement honestly;
13. no paid model, live web, or real Docker;
14. full Python baseline remains green;
15. fresh whole-probe review has no open Critical/Important;
16. branch is pushed and remote SHA verified.

## Explicit Non-Goals

- full Tianwen Goal Graph;
- nested user/meta continual-learning loops;
- LearningSignal generation;
- A2–A5 migration;
- production database design;
- Tianwen UI;
- real DeepSeek model integration;
- live search/fetch;
- Docker, remote runner, or microVM implementation;
- replacing all Python governance;
- merging the Alpha branch into main;
- upstream DSH contribution or fork.

These remain future work and must be planned only after the probe result is accepted.
