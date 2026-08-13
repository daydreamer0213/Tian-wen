# Tian-wen DeepSeek V4 Pro 最小接入设计

**状态：** 已获用户确认，可进入实施计划

**日期：** 2026-08-13

**范围：** 为现有真实模型入口接入 DeepSeek V4 Pro，并验证它能经过天问已有的预算、工具治理和检查点链路

## 1. 目标

让用户只需在环境变量中配置模型名和密钥，就能用 DeepSeek V4 Pro 运行天问现有的 live 实验：

```powershell
$env:TIANWEN_MODEL = 'deepseek:deepseek-v4-pro'
$env:DEEPSEEK_API_KEY = '...'
```

这次接入只解决“天问能否把 DeepSeek 当作真实模型使用”。它不改变持续学习架构，不新增模型路由器，也不把 DeepSeek 写死为天问的默认模型。

## 2. 方案比较与选择

### 方案 A：复用 PydanticAI 的原生 DeepSeek Provider（采用）

PydanticAI 2.18.0 已经认识 `deepseek:deepseek-v4-pro`，并负责：

- 调用 DeepSeek 官方 API；
- 处理 OpenAI 兼容协议；
- 处理 `reasoning_content` 的工具调用往返；
- 把 Provider 的 token 用量交给天问现有预算层。

天问只补齐该 Provider 所需的可选依赖和环境变量门禁。

优点是改动最少，并且符合“非核心组件优先复用”的项目原则。缺点是接入能力受当前锁定的 PydanticAI 版本约束，但这正好可以由契约测试监控。

### 方案 B：天问直接使用 OpenAI SDK 调 DeepSeek（不采用）

这会让天问自己负责模型请求、工具调用协议、思考内容回传、异常转换和用量解析。它没有提升持续学习核心能力，却会复制 PydanticAI 已经提供的代码。

### 方案 C：建立通用模型路由与自动选型层（暂不采用）

第一版没有证据证明需要在 Pro、Flash 或不同厂商之间自动切换。等真实任务数据表明质量、速度或价格需要动态权衡时，再把模型选择作为独立的受治理策略。

## 3. 最小架构改动

现有链路保持不变：

```text
TIANWEN_MODEL + Provider 密钥
→ PydanticAI infer_model
→ DeepSeekProvider
→ 天问 _BudgetedModel
→ RepoTaskRuntime
→ Action Gateway
→ FileSystem / Shell
→ Checkpoint、Evidence 和持久化预算
```

只修改三个位置：

1. 在现有 `pydantic-ai-slim` 依赖中启用 `openai` extra。它安装 DeepSeekProvider 使用的 OpenAI 兼容客户端，不引入天问自写适配层。
2. live 脚本的凭据门禁接受 `DEEPSEEK_API_KEY`。
3. README 增加 DeepSeek 的准确配置和手动 live 契约探针命令。

不新增 Provider 注册表、配置类、模型工厂或 DeepSeek 专用 Runtime。

## 4. 思考模式

第一版沿用 DeepSeek V4 Pro 的默认思考行为，不增加“高、中、低”配置项。

原因是当前目标是先验证完整链路，而不是提前优化价格和速度。PydanticAI 的 DeepSeek 模型画像已经知道 V4 系列需要把思考内容随工具结果一同传回 Provider，因此天问不自行解析或保存私有思考文本。

如果真实任务显示默认思考过慢或过贵，再基于运行证据设计显式档位。

## 5. 凭据与数据边界

- 密钥只从 `DEEPSEEK_API_KEY` 环境变量读取。
- 文档不会要求用户把密钥粘贴进会话、命令参数、仓库文件或天问持久化状态。
- 日志、事件和错误消息不得打印密钥。
- 真实调用会把提示词、模型可见的工具结果和必要上下文发送给 DeepSeek 官方 API。
- 第一轮 live 验证只使用测试生成的临时仓库内容，不使用用户私有项目。
- 缺少模型名或任一受支持 Provider 密钥时，脚本在发出网络请求前停止。

这次不实现密钥保险库；环境变量已满足本地 Alpha 的最小安全边界。

## 6. 验证设计

### 6.1 默认离线契约测试

默认测试不联网、不产生模型费用，验证：

1. 安装后的 PydanticAI 可以从 `deepseek:deepseek-v4-pro` 解析出原生 DeepSeek 模型；
2. live 脚本接受 `DEEPSEEK_API_KEY`，不再误报“缺少 Provider 凭据”；
3. 原有 OpenAI 和 Anthropic 入口保持可用。

测试使用假的密钥，只构造客户端，不发送请求。

### 6.2 显式 live 契约探针

增加一个默认跳过的真实模型测试。只有同时存在以下两个条件时才联网：

```powershell
$env:TIANWEN_RUN_LIVE_MODEL_TESTS = '1'
$env:DEEPSEEK_API_KEY = '...'
```

该测试创建一个只含无敏感标记文件的临时 Git 仓库，要求模型读取该文件后回答，并验证：

- 至少发生一次真实模型请求；
- Provider 返回大于零的 token 用量，并被天问预算账本结算；
- 至少一个只读文件工具调用经过 Action Gateway；
- Run 留下稳定检查点并正常完成。

探针不修改仓库、不执行 shell 命令、不做发布，也不进入学习候选生成阶段。外部模型结果存在偶发波动，因此它是人工触发的接入验收，不属于每次提交都必须运行的确定性测试。

## 7. 错误处理

- 缺少 `DEEPSEEK_API_KEY`：启动前给出通用的 Provider 凭据错误，不发请求。
- 依赖缺失：离线契约测试直接失败，阻止形成一个“文档说支持、安装后却不能用”的版本。
- Provider 未返回可用 token 用量：沿用现有规则，把 Run 停在 `unmetered_model_usage`，不把未知费用当成零。
- 请求超时、限流或余额不足：保留 Provider 原始异常上下文，不自动换模型，也不偷偷重试到突破预算。
- 模型提出高影响工具动作：继续由现有 Action Gateway 暂停并请求逐项批准。

## 8. 明确不做

本次不包括：

- DeepSeek V4 Flash；
- 多模型自动路由或故障自动切换；
- 自定义 DeepSeek SDK 封装；
- 思考强度 UI；
- 模型价格表硬编码；
- 真实私有仓库测试；
- 后台 daemon；
- 因接入新模型而修改持续学习、评测或发布规则。

## 9. 验收标准

- `uv sync` 后无需单独安装 SDK，即可解析 `deepseek:deepseek-v4-pro`。
- 默认完整测试和静态检查全部通过，且不会联网。
- 没有 DeepSeek 密钥时不会产生请求或费用。
- 有密钥并显式开启 live 测试时，测试生成的临时仓库可以完成一次受治理的只读任务，且模型用量、Action 和 Checkpoint 都有记录。
- README 用可直接复制的命令说明配置方法和数据外发边界。

## 10. 参考

- [DeepSeek V4 Pro 官方发布说明](https://api-docs.deepseek.com/news/news260424/)
- [DeepSeek 官方思考模式说明](https://api-docs.deepseek.com/guides/thinking_mode/)
- [DeepSeek 官方 token 用量说明](https://api-docs.deepseek.com/quick_start/token_usage/)

