# DEV 原 CLI Profile 接入 Implementation Plan

> **For agentic workers:** 用 executing-plans 在当前已隔离工作树直接执行；完成后按 requesting-code-review 独立只读审查。

**Goal:** 在专用DEV数据树中消费原CLI的Profile布局，保持实际隔离、存储和学习规则。

**Architecture:** Runtime公开只读根验证器，原配置及合同插件共享；原CLI照常解析其Profile与Loader，不新建宿主。

**Tech Stack:** 原DSH0.1.1-rc.2、Cordis4.0.1、Node22、TypeScript、现有发行构建与Vitest。

## Global Constraints

生成物D:/DevData、D≥15GiB；不复制依赖树；71拒删根不操作。main/Daily NO-GO、同意/双审/语义/原门槛/十工作日窗口保持，0脚本控制充自然来源，旧Task不重跑。

### Task 1: 共享 canonical DEV 目录验证

Files: `packages/tianwen-runtime-bundle/src/development-runtime-boundary.ts`、`src/runtime.ts`、`scripts/development-native-runtime.mjs`；Tests: `tests/dsh-migration/development-runtime.spec.ts`、`development-native-runtime.spec.ts`。

Produces: `resolveDevelopmentRuntimeRoot(root: unknown): string`，不写文件；Consumers: 原DEV配置与合同插件。

- [x] 首红：真实新 `home/profiles/owned-dev` 载DEV，当前直接子限制拒绝；读合同同场景亦拒绝。
- [x] 实现两个精确布局，`key(dirname(root))===key(base)` 或 `basename(dirname(root))==='profiles' && key(dirname(dirname(dirname(root))))===key(base)`，后者拒node_modules，逐层canonical验证；原ctx.baseUrl与派生路径/真实JSONL检查不变。公开同一函数，插件调用，不复刻逻辑。
- [x] 相关回归和完整Runtime依赖/发行/声明构建；实际发布入口导入同一函数验证无源代码替代。

### Task 2: 实际原 CLI 零请求接入

Files: 新 `tests/fixtures/development-native-cli-profile/probe.mjs`、`tests/dsh-migration/development-native-cli-profile.spec.ts`。

- [x] 新自有canonical home内原manifest bundles空，原profile插入基础服务、JSONL、公开DEV合同插件及依赖Evolution的probe。probe不造Task、请求、同意或裁决；只保存原运行事实，正常appExit(0)。
- [x] Node实际执行原CLI，原服务挂载/0任务/0研究/同意未提供/退出0且原账本保持；避免`process.exit()`绕过原关闭，拒脚本重建Runtime；stdout/stderr/超时首结果留存。新自有home检查真实路径后只清自有根，不追随fallback链接。首URL尾斜杠断言错误留存，最终以实际目录身份比对通过，110相关检查。
- [x] 独立审查无有据P1/P2、文档同步真实范围并开发分支提交推送。原账本/七Task/原验收和index检查器字节保持，两新自有CLIhome释放，生成包约39KiB/D17.819GiB/Docker未启动；下一实际任务入口固定需求/独立检查后唯一首次消费，不能以本控制宣布自然学习或完整目标完成。
