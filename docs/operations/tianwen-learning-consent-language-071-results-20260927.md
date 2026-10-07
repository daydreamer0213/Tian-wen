# E071：中文任务后的自动学习通知沿用中文

在 E070 的新配置档中，中文普通任务完成后，天问自动插入的学习同意通知曾由模型用英文解释。根因是 `learning-consent-agent.ts` 向模型发送的通知指令和披露全文均为英文，且没有指定回复语言。本轮只为当前 v3 通知补充一条指令：按本会话最近一次真实用户请求的语言解释，不由英文内部通知决定回复语言。同意披露文本、授权规则、学习开关和旧版通知均未修改。

修正提交 `659aede8ece0af5259c5bbcec1faf7578c16c0db`。测试先复现缺失指令的失败，修正后同意通知测试 **38/38 通过**；八包 TypeScript 构建式类型检查通过。类型检查包装脚本被本机 pnpm 的自动安装确认阻断，因此直接调用已安装的同一 TypeScript 编译器执行同一组包检查，没有重装依赖。

真实核验在首次模型调用前冻结于 `D:/DevData/tianwen-acceptance-runs/071-consent-language/protocol.md`，使用全新 DSH Web Profile、DeepSeek-V4-Flash/High 与一次预写中文任务。运行包 SHA-256 `ff4ef08429b86be7698d878c741d5712356e908f192217946aa3127599ee6c3f`；安装后的 `dist/runtime.js` SHA-256 `52af6526f4789055a9b138e7c413dec74246c7fbbc0e349a9d830509d12d2e4d`。原生会话 `session-a9a059f1-d06f-4a14-8cdc-d724f8ba49fd` 中，普通任务首次回答为“提醒：请于周三整理好本周待确认事项，并在会上逐项核对。”随后的 `tianwen` 插件通知首次解释为中文，明确写出“这个功能默认没开”“这条通知本身也不会改变你当前的状态”，完整说明随后结束。原生会话导出 SHA-256 `a71ff948c9a07e926a9b6904c5215bed581c6a51b91e0838db419065a9478af7`，见同目录 `evidence/product-sessions-extracted.json`。

`learningLoop.enabled=false`；终态账本只有同意通知意图和投递两条，SHA-256 `d17117e44c8f19fce770a286be3d4e8c616cac13e1e8e9eeeb306ef9f4d1cc3e`。没有授权、普通任务学习分析、反馈归因、研究、方法激活或后续任务效果记录。Host 已停止。此轮证明一个新隔离中文场景的通知语言与授权边界，不证明其他语言、长期稳定性或语义安全。E068 过度概括漏判和主张类型误挡风险仍在；main/Daily **NO-GO**。后续先重设计整句事实与建议边界，再做新样本前瞻验证；不重跑旧题凑通过。
