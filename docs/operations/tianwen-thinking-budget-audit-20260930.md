# OfferGo 首次生成失败：思考/正文总额度调查

上一目标轮实际进展为：收到所有者真实任务，完成首次原生尝试并保存失败，控制端另行交付稿件。当前 DEV b3c6e8c845e6790001a13a3ba80314009d933e7c，开始干净；原正式尝试驱动哈希、原生会话摘要与此前收据相同。没有再开 OfferGo 任务，没有把补写稿件接进失败候选，也没有收到该稿的用户读后反馈。

## 可以核实的原因

首次驱动在插件配置和实际根任务 callConfig 两处明确设置 high / maxTokens 8192。记录的根请求 usage 为 outputTokens 8192、reasoningTokens 8192，正文 text 块为 0，原终止 max-tokens，产品账本 failed/inconclusive。这证明本次在正文输出前耗尽总额度，不是已生成正文后来被 observer 丢失。

当前安装的 @deepseek-ai/dsh-llm-deepseek 0.1.1-rc.2 源码按 GenerateOptions.maxTokens 序列化为 max_tokens（lib/index.js:245），没有额外的独立思考 token 上限字段；服务端 length 映射为 max-tokens（:914），usage 原样使用 completion_tokens 和 reasoning_tokens。LLM.resolveCallWithInfo 仅在显式 maxTokens 缺失时使用模型默认值（dsh-llm/lib/index.js:1463）；插件缺省上限为 256000，但被本次显式 8192 覆盖。上次成功的代码修复任务采用同一 8K 限制，不足以推出开放式文案也能在该额度内完成。

上述为当前源码路径与原生记录的对照；没有保存首次完整 HTTP 请求体，不把源码推导描述成该请求逐字节的抓包证明。现有证据没有指出 Tianwen 或 DSH 的正文丢失缺陷，因此不新增运行循环、自动续写、故障重试或提供者补丁。

2026-09-30 查询 [DeepSeek 官方 Chat Completions 文档](https://api-docs.deepseek.com/api/create-chat-completion/)：max_tokens 是生成总数上限；未显式设置时，非思考默认 8K、思考默认 64K，max effort 默认 128K。本次显式 8K 与思考模式默认额度不同。文档现在列出的模型名称不能改写旧原生身份；本轮不升级依赖或替换旧模型别名。思考指南/定价页获取失败，仅使用成功读取的 API 页面，不引用那些失败页。

## 后续真实任务的运行配置

下一项**新且实际未完成的普通文本任务**采用现有公开配置能力：同一模型与 high，显式 maxTokens 65536；第一次请求前固定原要求、来源和配置，单个正式尝试、提供者重试 0，保留原 720000ms 截止与收尾，不因到时未完成而重开。已有历史实验、研究臂冻结预算、Daily 配置和 OfferGo 首次失败均不修改。

64K 是本次原因调查后选择的未来有界配置，不是确保正文一定产生的机制证明，不是“更长即更正确”的判断，也不能弥补独立语义结果证据。尚未在这个配置下运行新真实任务；不能写成截断已修复或自动学习已通过。若未来再耗尽额度，保留实际失败，不临时增额或降低思考模式追求通过。

当前 OfferGo 文案工作已由控制端补交，没有待重做的同一实际工作。其未来用户反馈只归属补交稿，不能制造对原生失败候选的反馈。下一原生入口应来自新的实际工作或用户提出的实质修改要求；不出近似题补成功，也不再次询问已提供的原任务和原要求。

## 证据与边界

只读收据 D:/DevData/tianwen-thinking-budget-audit-20260930/audit.json，约 2KB；原证据留在 D:/DevData/tianwen-offergo-copy-20260930，未复制。新模型调用、测试、构建、安装、Profile、试验副本均 0；D 20,030,111,744 字节、约 18.65GiB，满足 15GiB 底线、尚未达 20GiB 目标。未绕过旧删除拒绝边界。

目标仍 active，main/Daily 完整学习 NO-GO、新激活隔离、原门槛与十工作日窗口不变。真实反馈、案例语义独立、独立结果支撑的自动采用及未来效果仍未由这次额度调查建立。
