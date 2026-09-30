# 独立检查记录实际请求配置的最小修复

**问题和根因：** 新状态任务根 completed，但固定检查在 `agent/request` proposal 阶段记录 config；DSH 随后按已绑定 adapter 在 `prepareCall` 加入 high 默认值并写原生请求头，实际摘要不一致。原 unverifiable 正确，不能删除默认值、宽松比较或事后回填。

**实施：** 基线 DEV `31dafff`。仅将 observer 的检查准备移到原有 `llm/stream` 普通原生请求监听：从原生 header 取实际 config，先 await prepare，再记录 task-model-observed，再交给 next/provider。此时仍没有模型输出或文件执行；原生 header 已绑定当前 adapter 与实际配置。删除原 agent/request 准备监听，不新增 dry resolve、配置改写、执行器、事件或治理许可。

**固定验证：** 两个首红机制案例覆盖提供者默认值以及外层 request hook 的最终配置；必须在提供者进入前固定，实际 header 摘要完全相等，检查闭包只准备/运行一次，结果与模型评价分开。一个漂移反例保证下一请求实际改变配置时仍不可核验且不调用 checker。继承文件/冷恢复/取消/同意/默认关闭与拒收边界回归，运行八包类型、目标与相关测试 strict、包根声明及只读审查。

运行证据放 D:/DevData/tianwen-code-check-effective-config-20261001；不重新运行已交付状态题，不修改其账本/合同或原始失败。反馈/研究/激活 0，完整目标 active，C—F、main/Daily NO-GO、隔离与原门槛/期限保持。完成后选择不同实际待办验证新普通入口，不能把本机制测试当成前瞻学习效果。
