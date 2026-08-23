# Tianwen controlled Runtime bundle export repair

日期：2026-08-23

状态：架构监督已冻结；只修 deployable Runtime 既有公共兼容接缝，不改受控生命周期
schema、归约、权限或真实 operation。

基线：`main@a4ce8c781688d7bf09cb3f0340c28bfc7bf9ada1`

## 1. 已保留的 exact-main 首次失败

自动 push run
[`32610648817`](https://github.com/daydreamer0213/Tian-wen/actions/runs/32610648817)
精确指向上述 main，`run_attempt=1`。Python 与 installer-windows 成功，TypeScript
在 `pnpm --filter @tianwen/runtime-bundle... build` 首次失败：esbuild 无法从
`@tianwen/dsh-compat/runtime` 找到 `defineTool` 与 `installModelSelection`。受控 specs
和 demo 因前置 build 失败而没有运行。该 run 不得重跑或改写成成功。

同一 build 命令已在 reviewed main 本机稳定复现同样两个错误，所以这不是 GitHub runner
偶发状态或缓存问题。

## 2. 根因与项目边界

`packages/tianwen-runtime/src/skill-evaluation.ts` 通过项目根兼容层
`@tianwen/dsh-compat` 使用两个 DSH 公共能力：

- `installModelSelection`：现有 Agent 的模型选择安装函数；
- `defineTool`：现有 DSH 工具定义函数。

TypeScript 编译读取根入口 `src/index.ts`，该入口已经导出二者，所以类型门通过。真正的
Runtime bundle 为保持部署边界，会把根入口 alias 到既有窄入口
`@tianwen/dsh-compat/runtime`；该入口没有同步导出二者，最终 JavaScript 打包因此失败。

项目既有做法是让 `src/runtime.ts` 明确列出 deployable Runtime 实际需要的 DSH 公共根，
而不是让 Runtime 直接依赖 DSH 包，也不是取消 bundle alias。2026-08-21 的既有修复已经用
同一模式加入 LLM、Session、Skill 与 scripted adapter。因此本次应沿用项目设计，补齐现有
接缝；不能只按根接口“看起来可编译”来判断产品可交付性。

## 3. 最小实现与 TDD

实现只允许三个文件：

- `packages/tianwen-dsh-compat/src/runtime.ts`
- `tests/dsh-probe/controlled-skill-evaluation-runtime.spec.ts`
- `tests/dsh-migration/runtime-bundle.spec.ts`

先写并观察两个 RED：

1. 从公开子路径 `@tianwen/dsh-compat/runtime` 动态读取，断言
   `defineTool` 与 `installModelSelection` 都是函数；当前应得到 `undefined`；
2. deployable runtime bundle 的 exact public DSH externals 应包含现有四项再加
   `@deepseek-ai/dsh-agent` 与 `@deepseek-ai/dsh-tools`；当前旧 bundle metafile 仍只有四项。

GREEN 只在 `src/runtime.ts` 增加两个值 re-export：

```ts
export { installModelSelection } from '@deepseek-ai/dsh-agent'
export { defineTool } from '@deepseek-ai/dsh-tools'
```

不增加包装函数、状态、adapter、依赖声明或直接 DSH import 到 Tianwen Runtime。两项 DSH
包已经是 dsh-compat 与 runtime-bundle 的锁定直接依赖；lockfile 不应变化。

## 4. 承重门与停止线

实现主控依次运行：

1. 上述两个 focused RED；
2. `pnpm --filter @tianwen/dsh-compat build`；
3. `pnpm --filter @tianwen/runtime-bundle... build`，必须从当前源码真实生成 bundle；
4. 两个 focused specs GREEN，并确认 runtime bundle exact externals 为
   `cordis, dsh-agent, dsh-llm, dsh-session, dsh-skill, dsh-tools`；
5. 受控 Runtime 相关 specs、`pnpm run typecheck`、`pnpm run check:no-private-dsh-imports`、
   `git diff --check`；
6. 使用已确认的 canonical D: 测试 root、固定 Python 与权威 Corepack source，只运行一次
   fresh `pnpm run check`。若失败，保留现场并停止，不选择性重跑。

提交固定为 `fix: expose controlled Runtime bundle dependencies`，报告 exact SHA 后停止。
架构监督复核后，才允许普通推送修复分支、一次 `--no-ff` main 合并和新 exact-main 自动
CI。新 CI 仍遵守首次失败即停止；只有 Python、TypeScript、installer-windows 三 job
全绿才进入 Task 9 runbook。

## 5. 明确不做

- 不修改 Runtime/Evolution 行为、受控 ledger、schema、receipt 或 task fixture；
- 不取消或放宽 runtime-bundle alias，不让 Runtime 绕过 dsh-compat 直连 DSH；
- 不新增 dependency、lockfile、通用 adapter、构建框架、重试或预算层；
- 不 rerun 失败 run `32610648817`；
- 不触碰 legacy dirty worktree，不调用 Provider、Goal、installed product 或真实数据。
