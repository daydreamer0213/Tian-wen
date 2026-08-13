# Tian-wen：本地、可审计的持续学习竖切

> 主控架构会话在恢复讨论前，应先阅读
> [`docs/architecture-master-session-memory.md`](docs/architecture-master-session-memory.md)。
> 该文档记录长期架构共识、会话职责和实施监督入口，不替代具体实施计划。

## 1. Tian-wen 是什么，不是什么

Tian-wen 是一个独立的 Python Agent 控制面，不是 Codex Skill、不是 Codex 插件，也不依赖 Codex 才能运行。它把一个明确目标、受限探索、仓库任务、学习候选、外部评估和人工发布串成可追溯记录。它不是自主后台服务、网页产品、插件平台、第二套 Agent 框架、向量数据库，也不会训练模型。持续学习是通用过程（先在仓库任务上验证），v1 只发布 `repo_task` Skill；路由、策略等其他对象只能形成研究建议。

## 2. 为什么先用代码验证

本版本先验证「在一个小型 Git 仓库里，规则能否被记录、评估和回滚」。代码仓库只是第一个验证环境，不是产品或现实世界的完整边界。

## 3. 安装依赖

```powershell
uv sync
```

需要 Python 3.11–3.14。大型运行数据请放在 `D:\DevData`，不要长期堆在系统盘。

## 4. CLI 快速流程

以下命令在交互式终端运行；创建目标会要求输入 `yes`，不能用非交互开关绕过人工确认。

```powershell
$env:TIANWEN_EVALUATOR_PUBLIC_KEY = 'D:\Evaluator\evaluator-public.pem'
uv run python -m tianwen --workspace D:\work\sample --data-dir D:\DevData\tianwen-runtime goal-create --objective "修复 parser" --criterion "测试通过"
uv run python -m tianwen --workspace D:\work\sample --data-dir D:\DevData\tianwen-runtime explore --goal GOAL_ID --task root --question "当前支持哪个 parser API？"
uv run python -m tianwen --workspace D:\work\sample --data-dir D:\DevData\tianwen-runtime run --goal GOAL_ID --request "修复 parser 测试"
uv run python -m tianwen --workspace D:\work\sample --data-dir D:\DevData\tianwen-runtime status --goal GOAL_ID
uv run python -m tianwen --workspace D:\work\sample --data-dir D:\DevData\tianwen-runtime learn --goal GOAL_ID
```

`--data-dir` 和 `--workspace` 必须放在子命令前。每个实际 CLI 命令都必须设置 `TIANWEN_EVALUATOR_PUBLIC_KEY`，其值是 Ed25519 **公钥** PEM 文件；同一 `data-dir` 重启时必须使用同一把公钥。

普通 CLI 内置 `TestModel`（确定性测试模型），是控制面流程演示：不调用付费模型，也不执行真实工具；真实模型的工具执行只有 `scripts\run_live_vertical_slice.py` 这一个 live 脚本。普通 CLI 只能处理已有学习信号，不能自行创建 learning candidate。联网默认关闭；`explore` 需要联网时，创建 Goal 必须包含 `external_read` 授权（`goal-create` 加 `--authorization external_read`），并给 `explore` 传 `--task root --live-web --domain example.org`。

高影响 action 会输出 `waiting_approval:CHECKPOINT_ID`。在真实 TTY 中逐项作出明确决定；不会有 approve-all，也不会显示工具参数：

```powershell
uv run python -m tianwen --workspace D:\work\sample --data-dir D:\DevData\tianwen-runtime approve --checkpoint CHECKPOINT_ID --approve ACTION_ID
uv run python -m tianwen --workspace D:\work\sample --data-dir D:\DevData\tianwen-runtime approve --checkpoint CHECKPOINT_ID --deny ACTION_ID
```

不传 `--approve` 或 `--deny` 时，CLI 会按 pending action 逐个询问 `yes/no`。

候选评估必须拆成外部请求和收据导入：`eval-request`、由 evaluator 身份运行一次评估命令、`eval-import`，最后才可 `promote`。`rollback` 只移动活动版本指针，不删除历史。

## 5. 本地数据位置

默认状态目录是当前目录的 `.tianwen`，已被 Git 忽略。长期或较大的本地状态推荐使用 `D:\DevData\tianwen-runtime`。物化的只读技能、SQLite 状态和 evaluator inbox 都位于该数据目录。

## 6. meta Loop 能读什么

每个用户 Goal 有独立的用户 root Loop 和 meta root Loop；学习子 Loop 只从 meta Loop 预留预算后创建。meta Loop 只接收七个允许字段的 `meta_telemetry`（结果类别、效果类别、成本桶等），不接收用户请求、提示词、文件内容、命令参数、绝对路径或密钥。

## 7. 探索、来源与 `insufficient_evidence`

`explore` 默认只使用本地文件与已记录的工具夹具。每个本地搜索、网页搜索和抓取都先经过 Action Gateway。搜索摘要不是证据；只有本地文件匹配或实际抓取的主页面会生成带 action ID 的 `SourceRecord` 和 `EvidenceRecord`。证据不足会诚实返回 `insufficient_evidence`，此时任务不会继续执行。

如需联网，显式添加 `--live-web --domain example.org`。查询和抓取次数受持久化预算控制；重启不会重置额度。

## 8. 为什么禁用 Provider 原生网页工具

Provider 原生网页工具可能绕过本地授权、预算和来源记录。因此 Tian-wen 只使用当前受控的 DuckDuckGo/web-fetch 组合，且仅在 `--live-web` 时启用。没有 provider 路由或插件注册表。

## 9. 批准、unknown、恢复、发布与回滚

高影响 runtime action 会暂停在已冻结检查点；崩溃后不会盲目重试。使用 `recover --run RUN_ID` 可以显式接管仍为 `running` 的中断 Run：存在未结算动作时，会把已开始但结果不明的动作标为 `unknown` 并等待人工核对；只有稳定检查点时，则从原版本和原预算继续恢复。Promotion 先显示一次性 challenge，用户必须在真实 TTY 中重新输入。发布只能经 `Publisher` 写入活动指针；回滚同样需要真实 TTY、用户和非空原因。

## 10. Evaluator 专用密封目录与 Windows ACL

Tian-wen 进程只持有 Ed25519 公钥，不能读 sealed cases、私钥或 evaluator 配置。把密封目录和私钥放在 evaluator 专用 Windows 账户可读的位置，并确认 runtime 账户无读取权限：

由 evaluator 身份生成私钥和可分发的公钥；不要把私钥放进 runtime 数据目录或环境变量：

```powershell
openssl genpkey -algorithm Ed25519 -out D:\Evaluator\private-key.pem
openssl pkey -in D:\Evaluator\private-key.pem -pubout -out D:\Evaluator\evaluator-public.pem
```

```powershell
icacls D:\Evaluator\sealed
icacls D:\Evaluator\private-key.pem
```

移除 runtime 账户的读取权限、保留 evaluator 身份权限后，再由 evaluator 身份运行一次性 evaluator 命令。若无法建立 ACL 隔离，就不能导入 sealed receipt，也不能 promotion。v1 的 sealed evaluator 只做声明式 `repo_task` Skill 文本快照合同检查：不运行候选、不执行真实任务，也不是真实隐藏仓库沙箱；真实隐藏任务与对抗执行属于后续替换方向。

## 11. 确定性测试和显式 live 实验

```powershell
uv run pytest -q
uv run ruff check .
uv run python -m tianwen --help
uv run python scripts\run_live_vertical_slice.py --workspace D:\DevData\tianwen-smoke\repo --data-dir D:\DevData\tianwen-smoke\state --max-tokens 200
```

Live 脚本要求 `TIANWEN_MODEL`、相应 provider 凭据和 `TIANWEN_EVALUATOR_PUBLIC_KEY`（稳定的 Ed25519 公钥 PEM 路径），并且 workspace 必须是干净的可丢弃 Git worktree。普通主 checkout 不合格；只有明确的 Git worktree（`.git` 是文件）或 `D:\DevData\tianwen-smoke` 下的 smoke checkout 可以使用。默认不联网，只有 `--live-web --domain example.org` 才联网。live 脚本创建的 Goal 授权包含 `external_read`（联网探索的授权前提）。普通 CLI 不校验 disposable worktree，那是 live 脚本独有的门禁；Harness 的 Shell 规则不是操作系统沙箱。v1 没有 shadow/canary/灰度机制。

运行前由 evaluator 专用账户预先配置命令；推荐 JSON 参数数组而不是 shell 字符串。live 脚本不会切换 Windows 账户身份，仓库也未提供跨账户桥接器；`TIANWEN_EVALUATOR_COMMAND_JSON` 必须指向 evaluator 账户预先配置的受限桥接命令，或改用“runtime 生成 EvalRequest → evaluator 独立运行 → runtime 导入回执”的分离流程：

使用 DeepSeek V4 Pro 时，设置模型与 DeepSeek 控制台创建的密钥：

```powershell
$env:TIANWEN_MODEL = 'deepseek:deepseek-v4-pro'
$env:DEEPSEEK_API_KEY = '在 DeepSeek 控制台创建的密钥'
```

只在当前终端环境中保留该密钥；不要粘贴到聊天中，也不要提交到仓库。真实运行会将模型可见的提示、工具结果和上下文发送到 DeepSeek 官方 API。请先使用可丢弃的临时仓库或公开仓库。

要显式运行 DeepSeek 的付费只读探针：

```powershell
$env:TIANWEN_RUN_LIVE_MODEL_TESTS = '1'
uv run pytest tests\live\test_deepseek_v4_pro.py -v
Remove-Item Env:TIANWEN_RUN_LIVE_MODEL_TESTS
```

该命令使用自动生成的临时仓库，会发起多次计费的模型 API 请求；成功的工具调用往返通常至少 2 次，本探针最多允许 4 次模型请求；不会发布候选版本。

```powershell
$env:TIANWEN_MODEL = 'openai:gpt-4.1-mini'
$env:OPENAI_API_KEY = '...'
$env:TIANWEN_EVALUATOR_PUBLIC_KEY = 'D:\Evaluator\evaluator-public.pem'
$env:TIANWEN_EVALUATOR_COMMAND_JSON = '["D:\\Evaluator\\run-evaluator.cmd","{champion_snapshot}","{challenger_snapshot}","{protocol_manifest}","{challenge}","{receipt_path}"]'
uv run python scripts\run_live_vertical_slice.py --workspace D:\DevData\tianwen-smoke\repo --data-dir D:\DevData\tianwen-smoke\state --max-tokens 200 --objective "Fix the parser" --request "Run the bounded parser task" --criterion "targeted test passes"
```

`TIANWEN_EVALUATOR_COMMAND_JSON` 的每个元素只能使用固定文本或这五个占位符：`{champion_snapshot}`、`{challenger_snapshot}`、`{protocol_manifest}`、`{challenge}`、`{receipt_path}`。脚本不会使用 shell 执行命令；旧的 `TIANWEN_EVALUATOR_COMMAND` 仅适用于不带模板的预配置可执行命令。evaluator 命令必须在 receipt 路径写出签名 receipt，脚本才导入 EvalRun。

密封数据目录和私钥只能存在于 evaluator 账户继承的环境中。live 脚本不接受 sealed 目录或私钥参数、不读取这些环境变量，也不打印它们。没有 evaluator 命令时，脚本只创建并打印受约束的 EvalRequest 标识，最终标记为 `inconclusive`，不会声称存在 EvalRun。

默认不会发布候选版本。只有传入 `--interactive-promotion`、在真实 TTY 中逐项审批 runtime action、再输入审批人和精确 promotion challenge，脚本才会请求并确认发布、执行不同的 follow-up task 和记录 capability observation。输出中的 rollback 命令只在发布后才可用。最终 `supported` 只表示本次受控样本的硬门通过且质量不倒退；`refuted` 表示安全/硬门失败，`limited` 表示成功执行但没有正当学习候选，`inconclusive` 表示缺少探索或外部评估。任何标签都不证明广泛的持续学习能力。

## 12. 当前不包含的内容

本版本不包含后台 daemon、Web UI、浏览器自动化、爬虫、分布式队列、插件平台、向量/图数据库或模型训练，也没有影子运行（shadow）、金丝雀（canary）或灰度发布。若要加入其中任一项，先需要跨不同后续任务的可复现实证、明确的权限边界、回滚方案和独立评估证据。
