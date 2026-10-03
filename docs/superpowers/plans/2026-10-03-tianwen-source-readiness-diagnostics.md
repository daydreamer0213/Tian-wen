# 学习来源就绪诊断 Implementation Plan

> **For agentic workers:** Use executing-plans to implement this single scoped task. No additional implementation agents; independent read-only review uses the existing reviewer.

**Goal:** 从原筛选过程输出有限来源诊断，支持下一实际决策而不改变资格。

**Architecture:** 原 scan 收集互斥排除计数和原配对事实；默认 readiness 保持；learning status 仅接受闭合诊断结构。

**Tech Stack:** 现有 TypeScript、Cordis、Vitest、D 盘 Node/pnpm。

## Global Constraints

- 原门槛/同意/隔离/历史/十工作日窗口/main Daily NO-GO 保持。
- 无新模型、自然题、研究、激活或历史重判；只读查询 ledger 不变。
- D 空闲至少15GiB；复用依赖，无 Docker/下载/Profile 副本。

## Task 1: 完整只读诊断

Files: `packages/tianwen-runtime-bundle/src/conversation-guidance-loop.ts`、`learning-consent-agent.ts`；测试 `tests/dsh-migration/conversation-source-readiness-diagnostics.spec.ts`、`learning-consent-agent.spec.ts`。

- [ ] 写诊断首红：全部原资格排除与 scoped/eligible/problem/counter 计数、pair 状态、无原始字段。
- [ ] 确认失败为当前缺失诊断；保存首红日志。
- [ ] 原 scan 同次计数；默认 readiness 返回原 state；显式 true 返回诊断。
- [ ] learning status 显式请求并验证/投影有限数字结构；无效诊断丢弃，未知 state unavailable。
- [ ] 检验原 readiness 回归、checked counter、文件材料、状态隐私与同意/取消。
- [ ] 产品类型、实际发行、独立静态审查；修复有据重要问题。
- [ ] 当前正式档只读状态，模型/程序请求0、ledger 字节前后相同；生成物和磁盘审计。
- [ ] 更新权威交接/资格检查点、提交并核对远端；目标保持 active/incomplete。
