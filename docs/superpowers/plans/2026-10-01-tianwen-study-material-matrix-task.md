# 五案例材料回归任务 Implementation Plan

> **For agentic workers:** Execute inline with executing-plans; standing autonomous authorization applies.

**Goal:** 由天问完成一次真实未完成回归覆盖，事前有限程序合同与模型结论分别保存。

**Architecture:** 复用持续DEV原生file observer及冻结TypeScript检查；运行薄包装放D:/DevData/tianwen-study-material-matrix-20261001。只修改一个原测试。

**Tech Stack:** 既有DSH/TypeScript/Vitest，无新依赖。

## Global Constraints

8根请求/12工具/32总请求/12分钟、0重试；只read/edit目标；NO-GO/正式隔离/原窗口保持；不能写替代候选；运行数据D盘。

### Task 1: 冻结与一次原生尝试

- [ ] 冻结target/request/requiredCondition/compilerOptions、原完整前像及干净源码HEAD。
- [ ] 写独立AST投影检查，控制首红/修复及可信正负控制保留；不触碰目标、不调用模型。
- [ ] 0模型预检同意/工具/旧账本不变，准备当前合同和实际配置后执行唯一新session。
- [ ] 保存实际调用/成功read→edit/模型评价/独立结果/原候选；不合格恢复原目标并保留原失败，绝不重跑。

### Task 2: 结果与交接

- [ ] 若证据允许接纳，原样候选跑12项原测试、单目标strict及只读审查；否则准确收口。
- [ ] 冷恢复精确任务和账本，0模型，核对持续档readiness；不手动造研究来源。
- [ ] 压缩原生快照，仅保留小记录、原输入/候选；无副本，核对D余量并交接。
