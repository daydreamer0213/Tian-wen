# 原生任务请求观察 Implementation Plan

> 执行已授权设计，直接按executing-plans推进；独立审查由requesting-code-review处理，不反复询问已授权事项。

**Goal:** 移除未来宿主过早中止正常修改的请求计数门，同时保留原生工具与证据保护。

**Architecture:** 复用现有llm/stream事件、原生Agent/文件工具/取消能力，只抽取宿主请求观察；不增加运行框架。

**Tech Stack:** 当前Node/TypeScript/DSH 0.1.1-rc.2、Vitest；不安装依赖。

## Global Constraints

- 旧A/B/C脚本与原结果不改、不重跑；当前正式13task/0study账本8a5fb441…全部字节保持。
- 原门槛、十工作日窗口、NO-GO/隔离保持；当前内置目标active，不再把历史blocked当当前状态。
- 源码/材料/文件权限、14文件操作、12分钟期限与原模型/重试配置由调用方继续负责。
- 运行物及小目录在D:/DevData，清理本轮自有目录，D至少15GiB，不复制Profile或依赖。

## 单一任务：接通并核验未来宿主观察

**Files:** 新建`scripts/native-task-request-observer.ts`、`tests/dsh-migration/native-task-request-observer.spec.ts`；未来宿主配置及受控小回执在`D:/DevData/tianwen-native-task-request-observation-20261002`。

- [ ] 先写实际原生循环回归，确认未实现观察器或旧请求限制阻止第九次后的合法修改。
- [ ] 实现薄事件观察，不加入新请求上限；实际控制核对完成后的文件证据与独立结果检查。
- [ ] 核对14工具、路径权限、未准备、只读调用仍被阻止，未来宿主接线保留时间取消和模型配置。
- [ ] 聚焦与相关回归、完整类型范围核对及独立正确性/简洁性审查。
- [ ] 当前goal/旧正式账本/清理终态核对、文档更新、DEV提交推送；机制成功不代替自然研究或效果。
