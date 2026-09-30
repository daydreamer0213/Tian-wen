# 普通代码任务检查接线实施计划

沿用当前隔离 DEV worktree、既有授权，直接执行这个相互依赖的实施包，完成后按 requesting-code-review 做独立只读审查。设计见 ../specs/2026-09-30-tianwen-external-code-checks.md；不改全目标/原门槛/期限。

## 文件责任

- evolution 新 `conversation-external-check.ts`：有界准备/结果字段与输入身份辅助；`conversation-learning.ts`：新记录投影时序/绑定/不可改写；`index.ts` 导出；ledger新记录写入要求当前分析同意。
- runtime-bundle 新 `conversation-external-check.ts`：唯一宿主 prepare/evaluate 程序能力、原生前后核对、丢闭包恢复/撤回；observer 首次准入后准备、完成与重启检查；runtime 配置薄传递且默认无检查。
- 在现有 conversation-file-observer.spec.ts 原生 harness 补合同/结果及边界测试，在 conversation-learning.spec.ts 补投影反例；不新增第二套 Agent loop 或依赖。

## 执行

- [x] 新原生链路测试先红：要求候选前合同存在、完成后单独结果存在，模型 met仍inconclusive；保存失败。
- [x] 写严格两个记录/投影与轻量检查成员并接普通 observer，不改学习支持/研究/激活。
- [x] 新增late prepare、错身份、错输出、重复/重启、丢闭包、撤回/失败/缺捕获、不适用和未配置反例；八包类型/构建刷新dist后跑受影响组。只因新变更/失败复跑，不用旧真实模型求通过。
- [x] 独立只读审查并修复实际问题；存小证据、核对自有根与D空间；更新交接/总路线，目标active、NO-GO不变。
- [x] DEV提交推送并核对最终提交与干净状态，身份以本轮finish.json为准。

交付只证明接线机制，可信适配器覆盖和新实际任务前瞻结果仍需后续证据。发现接口要求无法绑定原请求或必须执行任意候选时保存失败并调整，不强行签署成功。
