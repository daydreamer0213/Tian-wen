# 固定 DEV 宿主研究结果接入实施计划

> **For agentic workers:** 采用 executing-plans，执行者直接完成；requesting-code-review 只读独立审查，不改被评估历史。

**Goal:** 持续开发宿主复用现有公开单研究/五角色结果工厂，不改研究和资格规则。

**Architecture:** 原开发入口添加两薄转发，共用固定宿主配置；原材料与案例由调用者事前确定，原发行runtime接入 `studyResultCheck`。

**Tech Stack:** 已有Node22.23.1、原发行DSH/Runtime、固定Docker镜像，无新依赖。

## Global Constraints
不变更宿主JSON/发行JS/身份算法/正式隔离/原来源门槛/历史/同意/main-Daily NO-GO/十工作日窗口。运行生成物仅D:/DevData，D≥15GiB，复用档案及依赖；不重跑旧生命周期或造自然来源。

### Task 1：研究宿主薄接入与真实配置核验
**Files:** 修改 `scripts/development-isolated-node-check.mjs`；新增 `scripts/development-isolated-node-check.test.mjs`；更新本计划及权威交接。控制脚本/小回执仅 `D:/DevData/tianwen-dev-study-host-20261003`。

**Interfaces:** 增加 `createDevelopmentStudyIsolatedNodeCheck(config)` 与 `createDevelopmentStudyIsolatedNodeCohortCheck({modelConfigDigest,cases})`，禁止所有执行配置覆盖；返回原 `ConversationStudyResultCheck`。单研究与普通目标字段相同，cohort每角色用 `material.files.outputPaths[0]` 的JS/TS固定配置。

- [ ] 默认Node测试先红，确认两新导出缺失而非依赖错误。
- [ ] 只补薄转发与共享宿主选择，实际公开根消费；角色材料、期望、条件原样保留，漂移/覆写拒绝。
- [ ] 默认聚焦测试通过；小控制验证五角色准备与JS/TS各一次实际执行及原条件/身份，接实际发行Runtime `studyResultCheck`；原档案全字节/零模型/研究/隔离保持。
- [ ] 独立只读审查、diff核对；自有容器/临时目录清理、历史84ID、Docker停止、D≥15；保存事实范围并提交/DEV精确推送，完整目标active/incomplete。
