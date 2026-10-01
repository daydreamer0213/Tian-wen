# 文件操作证据 Implementation Plan

> **For agentic workers:** Execute inline under standing autonomous authorization with executing-plans. Do not ask for permission already given.

**Goal:** 原生成功操作成为新完整files原始复核的可信事实来源，旧历史与内容归因边界保持。

**Architecture:** 事前source可选policy、已有recoverFiles原生核对、独立v2操作表示、原始复核投影/版本指令，零额外模型。

**Tech Stack:** 已有TypeScript/DSH/Vitest，复用开发worktree和依赖，无新增安装。

### Task 1: 政策、恢复、原始复核及检查

- [x] 在conversation-learning.spec.ts、conversation-file-observer.spec.ts先加政策/流程/不自证/历史/冷恢复反例，保存首次失败。
- [x] conversation-learning.ts保存可选fileExecutionProjection，observer.ts仅新source写marker；task-material.ts新增v2严格parse/可信恢复和描述，旧v1保持。
- [x] claim-review.ts仅原始source加入v2动作，版本匹配输出kind及原始v2指令；method-study不带旧动作。
- [x] 覆盖乱序/重复/关联错误/失败结果拒绝、旧v1和无marker恢复、辅助工具与完整任务区间，并独立只读审查；Windows大小写P2先红后修复关闭。
- [x] 七组不同297项当前通过、八包类型/实际bundle；七主要TS旧0/现0，新增辅助工具反例后联合八完整TS旧18/现18、新增0，原18旧测试诊断保留。正式持续DEV零模型只读冷恢复精确保持，旧失败不改判。
- [x] 自有临时根0、约60KiB必要证据和交接/路线更新，提交开发分支；下一不同实际任务才验证新真实模型路径，D18.47GiB≥15GiB、未达20GiB偏好。
