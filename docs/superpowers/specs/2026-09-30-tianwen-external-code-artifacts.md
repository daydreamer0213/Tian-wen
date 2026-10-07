# 阶段 B 普通外部代码任务的文件证据接缝

## 已证实缺口

6bb686b 的前瞻任务已验证未知文件修改能由固定编译器检查，但普通任务的 observer/current 和 ConversationTaskProjection 只接受 local-files 文件捕获，recoverFiles 也只读取该准入的 fileOutputKind。因此 external/code 的实际文件修改没有可恢复 preimage/output，不能直接接独立检查。保持现有 external 准入：需要编译/测试仍不能靠文本宣布 met。

## 方案取舍

选择复用既有有界文件记录，并加默认关闭的 `captureExternalCodeArtifacts` 配置。将外部代码任务改称 local-files 会改变判断语义；另造旁路 artifact store/普通 Agent loop 会重复既有来源恢复。此次只补普通任务证据入口，不造 verifier 注册表/结果证书，不把上一已完成待办重新运行。

## 具体责任

- 普通 root、当前分析同意 v3、明确 task/external/code、cwd 可用、开关 true 时，文件观察器使用现有 read/write/edit 首次内容、native调用身份、结束时输出和原生 span 记录；输出固定为 files。无写入或输出/安全/原生身份不全时不形成完整结果。
- 外部路径仍沿用既有拒绝链接/越界/大小/数量规则；不读取检查器猜测的文件、不扫描工作区、不回填旧外部任务。保留 8 文件、96 KiB 单文件、128 KiB 总内容上限。
- 外部任务遇到执行命令、导航等其他工具时，仅标明此文件证据不能完整认证，并执行原工具。不进入 local-files 的严格 ancillary/pwsh 拦截或改变任务权限。事实工具仍只服务 local-files，不因开关扩权。
- Projection 仅接受 local-files 或 external/code 文件输入/状态；external/code 完成文件必须为 files，其他原生边界/摘要/完整性规则继续。ancillary 记录不扩大准入。历史无文件外部任务原样回放。
- recoverFiles 从 exact completed span 恢复 external/code files；request/context/模型身份恢复维持既有规则，不能从当前磁盘补证据。恢复后模型 review 仍不能提供 external met，学习支持/研究/激活选择器不变。
- Runtime 把默认关闭的配置薄传给 observer，Daily 不部署；这不是可信独立结果的持久记录或最终采用许可。后续另设计候选之前绑定原请求和检查合同，再承接独立结果；不能事后从答案生成合同。

## 三个故事与证据

正常：普通外部代码任务以 native write/edit 更新文件→taskId 记录旧内容和结束输出→冷恢复请求/上下文/文件→仍 external/inconclusive，无研究激活。

反例：开关关闭、external/writing、子代理、缺同意或只聊天不写文件→不建立完整文件输出。

失败：外部代码任务用了真实命令→命令正常执行，文件证据标 unavailable，不用其工具文本当独立评估；同意撤回/文件越界/缺原生结果时亦不可恢复。改原生 span/调用/结果摘要时恢复停止，不回填。

机制测试先红后绿，复用原生 mock harness，不算真实模型或学习收益。分别验证 passive 工具行为、捕获与冷恢复、错误 identity/非代码拒绝、默认开关关闭及 external met 保护，再跑受影响现有组/八包类型和独立审查。运行物 D:/DevData/tianwen-external-code-artifacts-20260930；只保留必要小记录，自有新根正常清理，15 GiB 底线/20 GiB 目标、原发布门槛/窗口和 main/Daily NO-GO 不变。
