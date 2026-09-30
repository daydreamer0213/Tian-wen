# 阶段 B：真实测试待办的预先固定结果检查

## 实际任务与范围

前轮额外严格检查暴露 `tests/dsh-migration/conversation-file-trial.spec.ts` 未完成的类型问题。起点 c0afdaab670b14c101075abca3c867ced8ab2886；不是重开旧模型题目。统一 @tianwen 源码别名后五项诊断；加载实际 DSH sandbox-policy 类型后三项：冷恢复 retained 为 unknown，两处 source:'user' 不符合 source?:'delegation'。旧源码/dist 服务冲突是检查配置问题，不算产品错误。

实际待办：冷恢复 retained 使用现有 ConversationFileTrialReceipt 类型；两个用户模式切换使用官方 setSandboxMode 的事件形状（只有 mode）；其余执行语句、模式值、断言和既有类型均保持。可添加 type-only imports，不新增类型强转、声明或绕过检查。此要求来自既有测试意图、项目严格配置和官方类型，不由候选生成标准。

## 最小实现

一个未注册生产的脚本工厂，在候选前读取原文件、项目严格选项、单一源码别名、官方 sandbox-policy 声明和 TypeScript 编译读取闭包；只在内存保存闭包，不复制依赖/工程。身份摘要绑定要求、原文件、编译器版本、配置和闭包内容。返回只读摘要与 check(candidateText)；候选不能提供预期结果、修改配置/依赖或选择被检查的片段。

独立检查：完整候选文件严格编译零诊断；AST 只允许 retained 的类型注解、type-only imports 和上述两处 source 字段移除；该 retained 必须解析为已有 receipt 接口，而非 any/unknown/自造宽松类型。注释检查指令/三斜线引用不允许改变。编译仅解析/类型分析，noEmit，不执行候选或运行其导入代码。

结果只表示这个明确任务的检查通过/失败，不写任务 met、研究 accepted 或激活许可。未覆盖一般文本语义、案例独立、自动采用及未来效果；main/Daily NO-GO、隔离和原窗口不变。设计开始时全目标工具显示 blocked；正式尝试后的本轮读取实际返回 active，按实际工具状态记账，不把局部通过当目标 complete。

## 验证与停止

先保存原有三项失败；机制测试用小自有工程而非代写真实候选，检查严格失败、类型绕过、改断言/模式、额外导入/读取和准备后依赖变化。真实目标原文件不先修。后续原生模型至多一次正式尝试，保留完整未知输出和原生身份，不代写反馈、不凑来源；此原型尚未接原生证明。没有安全绑定就先交付明确范围的工程检查，不把它当完整链路。

运行物 D:/DevData/tianwen-test-typecheck-contract-20260930，复用现有工具；每轮自有临时工程正常收尾，D >=15 GiB，优先20 GiB。
