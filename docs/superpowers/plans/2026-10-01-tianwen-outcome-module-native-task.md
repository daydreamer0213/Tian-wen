# 新真实开发任务：来源模块独立类型接入

## 事前任务与范围

所有者授权自主选择实际开发待办。9402016 的 `packages/tianwen-runtime-bundle/src/outcome-learning-intake.ts` 单独使用既有 selected strict 配置检查，唯一 TS2551：Context 未包含 tianwenLearningConsentAgent。声明已在同目录 learning-consent-agent.ts，当前目标未自行导入。原文件7322字节，SHA256 2ec077e26ef2a00e22fb50453bd4f4e88bfe1b9db69831c4b4e1833ba455bbce，初始事实保存在 D:/DevData/tianwen-outcome-module-native-20261001/initial-facts.json。

真实原要求：只新增一个来自 `./learning-consent-agent.js` 的纯 `import type`，使目标自身获得已有服务声明；不改现有非空行（包括缩进、注释、类型、运行表达式和断言），允许新增导入及空行，不新增检查屏蔽，不改其他文件。可信编译器转译的运行JS须与原文件完全一致。只读审查已确认该路线可行；目标前像105投影单元不保证最终模型复核在128以内，不抬限额。

## 复用与独立证据

复用正式 bundle、原生 Agent/files、持续 DEV Profile D:/DevData/tianwen-development-learning-20261001 和已有 frozen TypeScript checker。本任务薄合同/驱动只放本轮 D 运行根，不扩生产检查平台。冻结现有声明模块为上下文，但不能把上下文root自动带来的0诊断当成目标自行修复：必须核对新增导入实际解析到该冻结声明，去掉新增导入后原非空行完全相同，转译JS完全相同。原单文件 strict2551 与最终候选单文件 strict0 使用同一配置另核对。

准备先于实际根模型转发，绑定原输入/原请求/实际模型/合同/候选字节。直接违反事前导入或保护条件才带 failedRequiredConditionDigest；一般编译错误保持诊断。候选不执行。合成夹具仅验证合同，不提供自然学习来源。原模型复核、独立程序检查、工程采用和完整学习进展分别记录。

## 执行与停止

- [x] 纯编译假通过首红；薄合同合成13/13，冻结后改磁盘上下文保持；没有生产checker改动。
- [x] 冻结驱动/合同/原要求/原文件/编译配置，预检持续环境既有记录和正式服务，无模型调用。
- [x] 一个新实际原生尝试：实际5请求/4工具/重试0，原8根/12工具/32总/720秒预算保持；候选不执行。额外事实工具调用被guard拒绝，不重做旧题或修答案改合同。
- [x] 候选/会话/账本/原复核及结果保存；独立unverifiable，按停止条件恢复原hash、拒收。不进入候选工程接纳检查，不改变原模型review。
- [x] 本题工程检查因前一步停止而不适用，未声称目标strict修复；冷读0模型原记录精确保持，不回填。改走已证实的宿主事实工具曝光缺口，独立设计及检查见2026-10-01-tianwen-file-facts-exposure.md。
- [x] 交接/路线图/小收据、原生gzip和失败证据保存；自有夹具0，D18.58GiB；不复制依赖/旧运行根，不绕过旧删除拒绝。DEV推送在收口阶段记录。

完整目标仍 active。main/Daily NO-GO、新激活隔离、C—F剩余证据及原十工作日窗口保持。本任务成功只能证明一个真实有限开发任务，不能替代真实反馈、研究裁决、方法效果或语义安全。
