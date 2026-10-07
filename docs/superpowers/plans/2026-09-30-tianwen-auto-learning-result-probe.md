# 完整自动学习阶段 A：独立结果验证原型 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Inline execution is selected under the user's standing authorization; no new execution-choice approval is needed.

**Goal:** 证明一个不依赖模型评分的文件事实表核验是否可行，并诚实保留它与完整自动学习之间的缺口。

**Architecture:** 复用 evolution 的 `capturedFileFacts()`，新增一个无副作用实验函数检查结构化结果。只有原型和测试，没有生产注册或账本变更。后续 B—F 依照[总路线](../specs/2026-09-30-tianwen-full-auto-learning-roadmap-design.md)及本阶段证据另行具体设计。

**Tech Stack:** 现有 TypeScript、Node 22、Vitest 4.1.8、pnpm 11.20.0；不安装依赖。

## Global Constraints

- 工作区 D:/DevData/tianwen-worktrees/tianwen-architecture-overview-v2-merge；基线 `212400363c0da3a453b6f900fb0c532e484b89a9`。
- 原话三个消费者、历史不可改写、当前 Run 不热换、同意与激活隔离均不变。
- 旧真实样本不重跑；脚本式测试不算自然学习效果；原十个工作日决策窗口不重置。
- 生成日志 D:/DevData/tianwen-auto-learning-plan-20260930；不复制 Profile、依赖、构建或桌面。
- 原型只检查结构化对象，不能签署自然语言语义安全或自动采用。

### Task A1：文件事实表独立核验

**Files:**
- Create: `scripts/learning-result-verifier-probe.ts`
- Create: `tests/dsh-migration/learning-result-verifier-probe.spec.ts`
- Reuse: `packages/tianwen-evolution/src/conversation-file-facts.ts`

**Interfaces:**
- Consumes: `ConversationFileEntry[]`（来自现有已冻结材料）及 `value: unknown`。
- Produces:
```ts
export type FileFactVerification =
  | { readonly status: 'verified' }
  | { readonly status: 'rejected' | 'unverifiable'; readonly reason: string }
export function verifyCapturedFileFactTable(
  value: unknown, inputs: readonly ConversationFileEntry[],
): FileFactVerification
```

- [x] 写正确表的测试（包括空文件、BOM、中文、emoji、CRLF、行顺序变化），及错误字节／行数／摘要、未知／重复／遗漏路径、额外解释字段、类型错误、不可恢复来源、自然语言值的反例。只断言状态与必要原因，不建立字符串提示镜像测试。
```ts
expect(verifyCapturedFileFactTable({ files: [{ path: 'empty.txt', bytes: 0,
  lines: 0, sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' }] },
  [{ path: 'empty.txt', content: '' }])).toEqual({ status: 'verified' })
expect(verifyCapturedFileFactTable({ files: [{ path: 'empty.txt', bytes: 1,
  lines: 0, sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' }] },
  [{ path: 'empty.txt', content: '' }])).toMatchObject({ status: 'rejected' })
```
- [x] 运行该测试，保存首次失败 `probe-red.log`；确认失败属于新接口缺失／尚无实现，不是依赖或环境故障。
```powershell
$env:TEMP='D:/DevData/tianwen-installer-temp'
$env:TMP=$env:TEMP
$env:PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN='false'
node D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs exec vitest run tests/dsh-migration/learning-result-verifier-probe.spec.ts
```
- [x] 实现单个纯函数：先确认来源非空、可恢复、路径唯一；再验证对象闭合字段、路径集合和每个数值／摘要完全相等。只用现有 `capturedFileFacts()`，无模型、磁盘执行、外部调用、注册或激活。
- [x] 运行新测试及已有 `conversation-file-facts.spec.ts`，保存 `probe-green.log`；首次失败仍保留。对本函数另做 TypeScript 检查，不为原型重建 Runtime／Desktop。初次夹具和类型目标错误、随后 27/27 及 ES2024 检查通过见[阶段 A 结果](../../operations/tianwen-auto-learning-result-probe-20260930.md)。
- [x] 只读审查核对：是否模型能指定“正确值”、是否只验部分字段却放行整个答案、是否路径覆盖不完整、是否实际进入生产。字段集合绕过反例先失败，修复后 **28/28** 和严格类型检查通过，独立复核关闭。
- [x] 更新本计划勾选项、当前交接和阶段 A 结果，提交准确检查点并推送开发分支。记录有限结论、生成字节数和未满足的 B—F 条件；目标保持 active。本项随这些文件的检查点提交收口，准确提交以 git HEAD 为准。

### 下一决策入口（本计划不直接编码）

阶段 A 通过只能证明局部结构化值可检查。下一步 B 必须先回答“原任务是否确实要求这种结果、所有反馈与标准是否被覆盖、检查合同谁在回答前固定”。没有可信绑定就保持诊断用途，不接自动采用；不靠新增模型解释包声称问题已经解决。
