# 天问真实任务 Alpha-A：真实执行层详细设计

**状态：** 已获用户确认；实施计划见 `docs/superpowers/plans/2026-08-13-real-task-alpha-a-execution.md`
**日期：** 2026-08-13
**前置设计：** `2026-08-13-real-task-alpha-roadmap-design.md`
**目标：** 用五个受控但真实的小型仓库任务，建立可重复、安全边界明确、结果可审计的真实执行基线

## 1. 一句话说明

Alpha-A 让真实模型在一次性 Git 仓库里读代码、改代码和反复检查；但模型不能决定实际执行什么宿主机命令。它只能请求运行任务清单中已有的检查，代码在受限 Docker 容器内执行，最后再由不作为模型工具、也不能被模型修改的验证器给出结果。

```text
固定任务包
→ 一次性工作区
→ 当前 Champion + 真实模型执行
→ 预登记容器检查
→ 冻结 Git 差异
→ 独立最终验证
→ TrialResult
```

这一层只证明“真实执行和真实验证成立”，不生成 Challenger，不自动优化 Skill，不晋升版本。

## 2. 设计原则

### 2.1 核心由天问掌握

天问自己掌握：

- 任务身份、目标和验收条件；
- Goal、Run、Action、Evidence 和 Checkpoint；
- 模型、Skill、预算和工具版本冻结；
- 哪些检查可以运行；
- 工作区基线和最终差异；
- 最终验证结果和结论边界。

### 2.2 非核心优先复用

本阶段复用：

- PydanticAI 负责模型调用和用量；
- Harness FileSystem、Skills 和 StepPersistence 负责文件工具、Skill 与步骤保存；
- Docker CLI 负责操作系统级隔离执行；
- Git CLI 负责仓库基线和差异；
- Python 标准库负责任务程序和验证脚本；
- 当前 SQLite StateStore 负责权威记录。

不引入 Docker SDK、Harbor、SWE-bench Harness、任务平台、队列或第二个 Agent 框架。

Alpha 不直接使用当前会无条件注册 Harness Shell 的 Agent 组装结果。它增加一个只服务 Alpha 的、默认拒绝的组装路径，复用现有模型预算、Checkpoint 和持久化代码，但能力清单固定为：

```text
Action Gateway
+ StepPersistence
+ Harness FileSystem
+ run_check
+ Skills
```

该清单中没有 Shell。普通 `RepoTaskRuntime` 的行为不因此放宽或暗改，也不提前抽象成通用 Runtime 插件系统。

### 2.3 模型少判断，程序多约束

模型只需要判断：

- 该读什么代码；
- 问题可能在哪里；
- 应该怎样修改；
- 何时调用哪个具名检查；
- 检查失败后怎样调整。

普通程序负责：

- 验证任务包和基线摘要；
- 建立工作区；
- 冻结模型、Skill、预算和镜像；
- 把检查名映射为固定命令；
- 控制容器的网络、挂载、资源和超时；
- 运行最终验证器；
- 计算差异和结果；
- 判定状态是否合法。

模型不维护复杂状态机，也不能用一句“我完成了”改变任务结果。

## 3. Alpha-A 的信任边界

### 3.1 可信部分

首轮把以下内容视为可信：

- 天问控制器和 Action Gateway；
- 人工审阅并登记的 Alpha 任务包；
- 固定 Docker CLI；
- 按摘要锁定的 Python 容器镜像；
- 任务包中的公开检查和最终验证器；
- Git 和本地 SQLite。

### 3.2 不可信部分

以下内容一律按不可信处理：

- 模型输出；
- 模型写入的所有仓库文件；
- 仓库程序运行时输出；
- 外部参考材料中的指令性文字；
- Provider 返回的自由文本；
- 检查进程生成的错误消息。

### 3.3 Alpha-A 的安全上限

Docker 隔离比当前宿主机 Shell 过滤强，但不是绝对安全证明。本阶段只运行项目内人工审阅的五个任务，不运行用户上传的未知二进制、任意第三方仓库、安装脚本或开放网络程序。

## 4. 任务包

### 4.1 文件结构

第一版使用固定目录，不建设通用任务注册表：

```text
alpha/
├── environment/
│   └── image.lock
└── tasks/
    └── <task-id>/
        ├── task.json
        ├── instruction.md
        ├── seed/
        ├── checks/
        │   └── public.py
        ├── verifier/
        │   └── verify.py
        ├── reference/
        │   └── solution.patch
        └── sources/
            ├── search_results.json
            └── fetched_page.md
```

只有需要参考资料的 A3 包含 `sources/`。任务包位于天问源码仓库，但模型的 FileSystem 根目录只指向复制后的 `workspace`，因此不能通过文件工具直接读取检查源码、最终验证器或参考答案。最终验证不是保密测试；它只是不受模型修改和自评控制。

### 4.2 `task.json`

`task.json` 使用一个固定的 `tianwen.alpha_task.v1` 结构，至少包含：

```text
schema_version
task_id / task_version / title
instruction_digest
rounds
public_acceptance
baseline_tree_digest
container_image_digest
named_checks
final_verifier（id / digest / 固定 argv / 超时 / 输出上限）
time / memory / cpu / process limits
allowed_write_patterns / protected_patterns
max_changed_files / max_changed_bytes
max_trial_bytes / min_free_bytes
```

`rounds` 通常只有一个元素。A5 有两个顺序轮次，每个轮次记录：

```text
round_id
instruction_digest
public_check_ids
follow_up_feedback_digest（仅第二轮）
```

具名检查只登记：

```text
check_id
固定 argv 数组
超时
输出上限
```

不接受 Shell 字符串、环境变量模板、用户提供的挂载路径或运行时替换占位符。

任务可以把限制设得更低，不能超过控制器的硬上限。第一组小任务的硬上限先固定在代码中：单个 seed 4 MiB、最多修改 12 个文件和 512 KiB、单个 Trial 产物 64 MiB、容器 1 CPU / 256 MiB 内存 / 64 个进程 / 64 MiB tmpfs、单次检查 60 秒、日志 256 KiB。真实任务证明这些值不足时再调整，不先建设通用资源策略语言。

### 4.3 任务包摘要

控制器对任务输入做稳定的目录树摘要，包含：

- `task.json`；
- 指令；
- seed 仓库；
- 公开检查；
- 最终验证器；
- 来源材料；
- 参考解法；
- 容器镜像锁。

任务开始后任何文件变化都会造成摘要不一致，并在付费模型请求前停止。TrialResult 同时记录任务包摘要和真正交给模型的输入摘要，避免把参考答案误算成模型上下文。

Alpha-A 的任务包拒绝符号链接、设备文件和超出大小上限的 seed，减少宿主路径、容器挂载和差异计算中的歧义。

### 4.4 作者校验

每个任务合入前必须通过三个确定性检查：

1. 原始 seed 运行最终验证器必须 `not_met`；
2. 应用 `solution.patch` 后必须 `met`；
3. 同一文件树重复运行最终验证器，结果和分类必须一致。

这叫“Nop / Oracle 校验”：

- Nop：什么都不做不能过；
- Oracle：已知正确解能够过。

它只证明任务本身可用，不证明模型能完成任务。

## 5. 五个具体任务

所有任务只用 Python 3.12 标准库，不需要联网或安装依赖。

### A1：修复带引号字段的记录解析

seed 中的解析器用简单字符串切分，遇到引号内的分隔符会产生错误字段。

观察：

- 是否先读现有实现；
- 是否找到根因；
- 是否复用标准库而不是堆补丁；
- 是否处理普通输入和错误输入；
- 是否在失败后调整而不是重复同一检查。

### A2：增加状态汇总功能

在已有小型数据模块上增加一个明确的汇总函数，并保持当前调用方不变。

观察：

- 是否把自然语言要求转成接口和边界行为；
- 是否只修改必要文件；
- 是否处理空输入和未知状态；
- 是否保持旧函数通过验证。

### A3：按冻结官方资料修复查询参数兼容性

任务提供一份带来源 URL、读取时间和摘要的 Python 官方文档事实：序列参数需要使用正确的 `urlencode` 选项。seed 的查询编码对列表值处理错误。

观察：

- 是否读取来源摘要和适用条件；
- 是否把外部知识落到具体代码；
- 是否保持标量参数行为；
- 是否避免把来源文字中的非任务指令当权威命令。

首轮使用冻结来源，不依赖实时网页可用性。实时外部探索在后续单独验证。

冻结来源通过现有 `recorded_search_tool`、`recorded_fetch_tool` 和 ExplorationEngine 进入 SourceRecord、Evidence 和 Goal evidence packet，而不是新增一个可绕过 Action Gateway 的“直接导入证据”接口，也不是把一段“据说来自官方”的文字直接塞进提示词。A3 的 Goal 因此仍需明确包含 `external_read` 授权；录制工具只让内容可重复，并不把外部来源变成本地可信指令。

### A4：局部规范化且保持旧行为

任务要求只对协议头名称做大小写规范化，正文和值保持原样。

观察：

- 是否控制修改范围；
- 是否通过旧行为保护检查；
- 是否避免全局替换；
- 是否能解释哪些行为被刻意保留。

### A5：根据反馈完成第二轮改进

第一轮要求生成一个可运行的文本报告。创建 Goal 前，用户会同时看到并确认两轮目标、完整验收条件和第二轮反馈样本；运行时模型第一轮只收到初始要求，第一轮 Run 结束后，控制器再按已确认的 TrialManifest 揭示预先登记的反馈，例如空分组的展示方式和顺序要求。第二轮在同一 Goal、同一工作区上创建新 Run。

观察：

- 是否保留第一轮已正确行为；
- 是否准确吸收新增偏好；
- 是否将反馈理解为局部约束；
- 是否通过第二轮验证而不是重写整个方案。

预设反馈只是可重复的代理样本，不能冒充真实用户满意度，也不能让控制器获得修改 Goal 的权力。若运行中出现清单外的新反馈，它必须由人确认后进入新的 Task/Run；实质改变顶层意图或授权时，仍需新的 Goal Contract。Alpha-D 之前仍需要用户真实验收。

## 6. 一次性工作区

### 6.1 路径

生成数据不写入 `C:`，也不污染天问源码仓库：

```text
D:\DevData\tianwen-alpha\runs\<trial-id>\
├── workspace\
├── state\
├── logs\
├── diff.patch
├── trial-manifest.json
└── trial-result.json
```

实际根路径可以显式指定，但必须位于用户确认的 `D:` 数据根内。控制器在复制、移动或清理前解析绝对路径并验证归属；Alpha-A 默认保留试验目录，不自动递归删除。

### 6.2 建立流程

1. 校验任务包和 seed 摘要；
2. 创建新的 trial 目录；
3. 只复制 seed 到 `workspace`；
4. 初始化本地 Git 仓库并建立基线提交；
5. 再次计算工作区树摘要；
6. 摘要一致后才允许创建 Goal 和发送模型请求。

模型不能写 `.git`、`.env`、密钥、任务检查和天问状态目录。

Alpha 的 Harness FileSystem 不使用任务写入范围作为全局 `allowed_patterns`，因为模型仍需读取其他源文件；写入范围由 Alpha Gateway 单独检查。`.env`、私钥和 secret 形态文件同时放入 FileSystem `denied_patterns`，禁止直接读取；`.git` 放入只读保护范围。seed 自身也必须通过无凭据扫描。

Alpha 专用 Action Gateway 在每个文件工具执行前读取持久 Goal 和任务清单：

- 读工具必须有 `workspace_read`；
- 写、编辑和建目录必须有 `workspace_write`；
- 路径先按与 Harness FileSystem 相同的工作区根规则规范化，再检查 `protected_patterns` 与 `allowed_write_patterns`；
- `write_file` 和 `edit_file` 在真正落盘前计算预计结果大小；
- 控制器从 seed 与当前实际文件树重新计算已修改文件数和总字节数；
- 单次内容、累计修改文件数或累计字节数将超限时，在执行前拒绝。

第一版串行运行，因此不增加并发配额服务。最终 Git 差异只做独立复核，不能代替写入前限制。

### 6.3 差异

任务结束后由控制器运行固定 Git 命令，生成：

- 修改文件列表；
- 增删行摘要；
- 完整 `diff.patch`；
- patch 摘要；
- 最终工作区树摘要。

模型给出的修改总结只作说明，不能替代 Git 差异。

控制器调用 Git 时使用固定 argv 和最小环境，并关闭外部 diff 与 textconv；模型写入的 `.gitattributes` 或仓库文本不能让 Git 启动额外程序。

基线初始化和提交只发生在模型写入前。模型写入后，控制器只允许运行固定的只读 `status` / `diff` 命令，不运行 `add`、`commit`、`checkout`、`archive` 或 hooks。所有 Git 子进程禁用系统/全局配置，使用控制器生成且只读的仓库配置，并显式关闭外部 diff 与 textconv；这样模型写入的 `.gitattributes` 找不到可调用的外部 filter。最终树摘要另外由 Python 对普通文件内容计算，不把 Git 自己当唯一证据。

## 7. 容器检查

### 7.1 为什么不直接使用现有 Shell

当前 Harness Shell 能：

- 限制可执行程序；
- 拒绝部分操作符和绝对路径；
- 清除名称匹配 `KEY`、`TOKEN`、`SECRET`、`COOKIE` 的环境变量。

但其源码明确说明这些检查不是安全边界。更重要的是，宿主机执行模型刚写的 Python 文件会把风险带到持有 Provider 凭据的天问进程附近。

因此 Alpha-A 的运行配置不向模型暴露 Harness `run_command`、`start_command`、`check_command` 或 `stop_command`。

现有普通仓库入口的任意 Shell 仍维持 `ASK`，不因 Alpha-A 放宽。Alpha-A 更严格：任意命令不可用，只有具名容器检查可用。未来真实任务确实需要任意终端操作时，再设计“容器内 + 每次审批”的独立路径。

### 7.2 模型看到的工具

模型只看到：

```text
run_check(check_id)
```

例如：

```text
run_check("public")
```

控制器根据冻结任务清单取出 argv、镜像和限制。模型不能传：

- 命令文本；
- 镜像；
- 环境变量；
- 挂载路径；
- Docker 参数；
- 最终验证器 ID。

未知 `check_id` 被确定性拒绝，并形成 Action 记录。

### 7.3 Action 语义

`run_check`：

- 只能由当前 TrialManifest 授权；
- 还要求 Goal 明确包含 `isolated_check_execution` 授权；
- 经过 Action Gateway；
- 计入工具和动作预算；
- 记录检查 ID、任务摘要、镜像摘要和结果摘要；
- 分类为 `external_read_only`，因此执行并通知，不频繁阻塞用户；
- 超时或控制器中断时标记为 `unknown`，恢复前不盲目重跑。

虽然容器是临时的，运行代码仍可能消耗资源，因此检查次数、时间和输出长度都受预算约束。

### 7.4 固定容器边界

控制器用 argv 数组调用 Docker CLI，不拼接 Shell 字符串。容器至少使用：

```text
--network none
--read-only
--user <fixed-unprivileged-uid>:<fixed-unprivileged-gid>
--cap-drop ALL
--security-opt no-new-privileges
--pids-limit <fixed>
--memory <fixed>
--cpus <fixed>
--tmpfs /tmp:rw,nosuid,nodev,noexec,size=<fixed>
--log-driver local
--log-opt max-size=<fixed>
--log-opt max-file=1
--mount workspace -> /workspace, readonly
--mount selected check -> /checks, readonly
--workdir /workspace
```

还必须满足：

- 镜像使用完整 digest，运行时 `--pull never`；
- 不挂载 Docker socket；
- 不挂载天问源码、状态库、用户目录或 Provider 配置；
- 每次只挂载当前公开检查或最终验证器，不能把整个任务包挂入容器；
- 不使用 `--privileged`、主机网络或设备透传；
- 不把宿主机环境整体传入容器；
- 只显式设置无秘密的 Python 运行变量，包括只写 `/tmp` 的 HOME/TMPDIR 和禁用 bytecode；
- 控制器流式读取输出，达到上限即停止继续执行；Docker 日志驱动另有磁盘硬上限；
- 超时后停止并移除容器。

工作区只读挂载；Python 使用 `PYTHONDONTWRITEBYTECODE=1`，临时文件写入有大小上限的容器 tmpfs。公开检查与最终验证都不能修改模型产物。

为支持中断恢复，容器不使用执行完即消失的 `--rm`。控制器先用由 Action ID 派生的唯一名称创建容器，再保存一个小型 `CheckExecutionRecord`：

```text
action_id
container_id / container_name
trial_id / check_id
image_digest / normalized_config_digest
exact_sanitized_argv snapshot / digest
created_at / started_at / finished_at
exit_code / output_digest
```

容器标签同时带 Action ID 和配置摘要。执行完成后先保存退出码、结构化 CheckResult 与日志摘要，再删除容器。检查程序返回非零属于“检查未通过”，Action 本身仍可成功结算；只有 Docker 创建、启动或结果读取失败才是 Action 失败。

若控制器中断，Alpha 恢复器按精确 container ID 检查镜像、标签与配置摘要：

- 能证明是同一容器且已经退出：读取受限日志，保存结果，追加 `check_reconciled` Event，并把 `UNKNOWN` 结算为 `SUCCEEDED` 或 `FAILED`；
- 能证明仍在运行：在原超时上限内继续等待或停止；
- 容器缺失、被替换或配置不符：保持 `UNKNOWN`，不重跑、不声称结果。

现有普通 Runtime 的恢复逻辑不承担这项容器核对。

### 7.5 Docker 宿主进程

Docker CLI 本身也使用最小环境变量白名单启动，不继承 Provider Key。镜像必须在运行前准备好，Alpha 运行时不联网拉取。

Docker Desktop 的镜像和虚拟磁盘需要配置到 `D:`。预检还要确认 `D:` 可用空间不低于清单中的 `min_free_bytes`，并把工作区、状态、差异和日志纳入 `max_trial_bytes`。如果 Docker 命令存在但 Engine 未启动、镜像缺失、空间不足或数据位置不合规，预检在模型请求前停止，不自动下载大型镜像到 `C:`。

## 8. Provider 凭据合同

Alpha-A 必须留下机器可运行的合同测试，证明：

1. 设置假的 `DEEPSEEK_API_KEY` 后，Docker CLI argv 不包含它；
2. Docker CLI 的宿主环境白名单不包含它；
3. 容器内 `os.environ` 看不到该变量名和值；
4. Action、Event、日志、TrialManifest 和 TrialResult 中均不存在该值；
5. 模型正常调用仍能从天问主进程取得 Provider 凭据。

该测试既检查“名字没有传入”，也用随机哨兵值扫描持久产物，避免只改变量名就绕过检查。

凭据隔离通过是 Alpha-A 的硬门；任务全过也不能抵消密钥泄露。

## 9. 独立最终验证

### 9.1 与公开检查的区别

公开检查：

- 模型可以按名字反复调用；
- 输出用于定位问题；
- 覆盖主要公开行为，但不穷尽边界。

最终验证：

- 不注册为模型工具；
- 不通过 Prompt、FileSystem 或具名检查结果主动提供脚本源码；
- 只在当前任务轮次结束后由控制器调用；
- 使用独立挂载目录和固定摘要；
- 检查公开验收、旧行为保护和范围约束；
- 结果写入正式 Evidence。

Alpha-A 不把最终验证伪装成高保密基准。模型生成的代码在验证容器运行时，理论上仍可能探测容器环境或读取同进程可访问的文件；因此这里的“独立”只表示验证器由控制器选择、摘要冻结、不能被模型修改，结果也不由模型自报。真正的隐藏保护集、抗投机设计与 evaluator 账户隔离留给 Alpha-D。

### 9.2 结果语义

沿用现有三值结果，不增加让模型判断的复杂状态：

- `met`：确定性检查全部满足；
- `not_met`：至少一个确定性条件失败；
- `inconclusive`：验证设施本身无法形成可靠判断。

Provider 错误、预算耗尽和模型主动停止不直接决定验收；只要最终验证器可运行，仍运行并记录实际仓库是否达标。验证器自身缺失、摘要不符、Docker 不可用或结果格式损坏时才是 `inconclusive`。

### 9.3 验证输出

验证器只返回结构化 JSON：

```text
verdict
passed_checks
failed_checks
failure_categories
summary
```

控制器校验 schema、限制长度、保存原始输出摘要，并生成通俗报告。模型自由文本不能覆盖该结果。

## 10. 冻结对象

### 10.1 TrialManifest

在第一个模型请求前持久化不可变 `TrialManifest`：

```text
trial_id
task_id / task_version / task_bundle_digest
round order digest
goal contract digest
fully qualified model_id
sanitized model settings snapshot / digest
sanitized provider endpoint / configuration digest
repo_task Skill version / digest
runtime policy / tool contract digest
container image digest / normalized container config snapshot
named-check map snapshot / digest
final verifier snapshot / digest
baseline tree digest
budget
workspace identity
```

Goal 的授权包至少区分 `workspace_read`、`workspace_write` 和 `isolated_check_execution`。用户在试验开始前一次确认这三个有限权限；该授权只覆盖当前任务包、一次性工作区和已冻结的具名检查，不能扩展到任意 Shell 或其他仓库。

A3 还包含 `external_read`，但只授权读取 TrialManifest 绑定的录制来源 URL 和内容摘要；其他任务不因 A3 获得外部读取权。

模型身份必须是 `provider:model-name` 形式，例如：

```text
deepseek:deepseek-v4-pro
```

当前代码对已经实例化的 Model 只保存 `model_name`，会丢失 Provider。Alpha-A 需要把共享模型身份函数改为优先使用 PydanticAI 的 `model_id`，并为旧 RunManifest 保留明确的旧版读取规则；不能静默改写历史记录。

具体兼容规则是：旧 `schema_version="1"` 继续按历史 `model_name` 验证；Alpha 新建 Run 使用新 schema 并保存 `model_id`。恢复旧 Run 时不能因为代码升级而把它误判成另一个模型，也不能原地升级历史清单。

`model_id` 仍不能单独证明服务端模型完全相同，所以 TrialManifest 同时保存脱敏后的实际 model settings、Provider endpoint/配置摘要和 PydanticAI 版本。任何 API Key、请求头或账户标识都不进入快照。

### 10.2 RunManifest

每个轮次仍创建现有 Run，并冻结：

- Goal；
- Prompt；
- 模型；
- Skill；
- Policy；
- Harness；
- 工具；
- 工作区。

A5 的两个 Run 共享一个 TrialManifest，但 Prompt 摘要、round ID 和 Run ID 不同。TrialManifest 只保存任务包摘要和轮次顺序摘要；完整轮次内容的唯一权威来源仍是已冻结任务包，每个 Run 只保存自己选择的 round ID 和 Prompt 摘要。第二轮不能覆盖第一轮 Checkpoint、Action 或用量。

所有轮次都必须使用 TrialManifest 冻结的 Champion。当前 `run_repo_task` 每次从活跃指针重新取版本，Alpha 编排入口需要显式传入冻结版本或在运行前核对指针；即使外部进程在两轮之间晋升了新版本，本 Trial 也不能静默换 Skill。

### 10.3 TrialResult

任务结束后持久化一个不可变 `TrialResult`：

```text
trial_id / trial_manifest_digest
goal_id / run_ids / checkpoint_ids
task identity
fully qualified model identity
Skill identity
baseline / final tree / diff digests
verifier identity / verdict / failure categories
execution_status / verification_status / boundary_status
Action IDs / Evidence IDs
model requests / tokens / tool calls / action effects / wall time
run stop reasons
workspace path
artifact manifest
started_at / finished_at
```

`artifact manifest` 为每个外部持久文件记录相对路径、类型、SHA-256 和字节数，至少覆盖 TrialManifest、patch、公开检查日志、最终验证日志和模型最终输出；不包含承载该清单的 `trial-result.json` 自身，避免自引用摘要。TrialResult 的权威副本作为不可变对象保存在 SQLite，本地 JSON 可与该对象核对。TrialResult 只保存这些小型条目，不把大块轨迹或模型私有思维塞进 SQLite；审计时可以检查路径内容是否后来被替换。

状态全部由控制器计算，不交给模型判断：

- `execution_status`：`completed`、`stopped` 或 `failed`；
- `verification_status`：`completed`、`unavailable` 或 `invalid`；
- `boundary_status`：`passed`、`violated` 或 `unknown`。

只有 `execution_status=completed`、`verification_status=completed`、`boundary_status=passed` 且 `verdict=met` 时，报告才把本次 Trial 计为“Agent 成功完成任务”。其他组合仍保留真实仓库 verdict，例如模型中断后代码碰巧满足检查，但不会混入 Agent 成功率。

`verification_status` 不是 `completed` 时，verdict 必须为 `inconclusive`；存在未结算 Action、凭据扫描不确定或容器身份无法核对时，`boundary_status` 必须为 `unknown`，不能报成功。

同一个 `trial_id` 不能覆盖结果。需要重跑时创建新 Trial，并用 `previous_trial_id` 关联。

## 11. 完整流程

### 11.1 付费请求前预检

```text
读取任务包
→ 校验 schema 与摘要
→ 校验 seed 基线
→ 校验 D: 数据根、最小可用空间和 Trial 总配额
→ 校验 Docker Engine、镜像 digest 和隔离参数
→ 运行基线最终验证，确认 not_met
→ 校验模型 ID、Provider 凭据和预算
→ 展示 Goal、全部轮次、预登记反馈、授权边界和最大成本
→ 用户一次确认
```

任一步失败都不发送模型请求。

### 11.2 执行

```text
创建 TrialManifest
→ 复制 seed 并创建 Git 基线
→ 创建用户 Goal、Task 和第一轮 Run
→ 当前 Champion 读取与修改文件
→ 按需调用公开具名检查
→ 保存 Checkpoint 和 Run 结果
→ A5 如适用，加入登记反馈并创建第二轮 Run
```

### 11.3 结算

```text
冻结 Git 差异和最终树摘要
→ 控制器运行最终验证器
→ 把验证结果写成 Action 与 Evidence
→ 汇总持久预算
→ 写入 TrialResult
→ 输出通俗报告
```

## 12. 用户入口与过程展示

第一版保留一个显式实验脚本，不把付费真实模型偷偷接进默认确定性 CLI：

```powershell
$env:TIANWEN_MODEL='deepseek:deepseek-v4-pro'
$env:DEEPSEEK_API_KEY='...'
uv run python scripts\run_real_task_alpha.py `
  --task A1 `
  --data-root D:\DevData\tianwen-alpha `
  --max-tokens 30000
```

支持逐个任务运行；五个任务验证稳定后再增加 `--task all`。不提供绕过 Goal 确认和真实费用确认的 `--yes`。

终端过程至少显示：

```text
[预检] 任务 A1、基线和镜像已确认
[目标] 修复带引号字段的记录解析
[版本] Champion=<digest> Model=deepseek:deepseek-v4-pro
[执行] 正在读取 workspace 内文件
[修改] 已记录 1 个可逆文件动作
[检查] public -> failed: 2 项
[检查] public -> passed
[验证] final -> met
[成本] requests / tokens / tools / time
[结果] TrialResult 路径和结论边界
```

展示可观察事实和决定依据，不显示或长期保存模型私有思维流。

## 13. 错误与恢复

### Docker 不可用

预检失败，不创建付费 Run，告诉用户需要启动 Engine 或准备镜像。

### 模型或 Provider 请求失败

Run 标记为 `failed`，保留已有 Action、文件和 Checkpoint；若工作区仍可验证，最终验证照常运行并记录实际结果。

### Token 或动作预算耗尽

不自动扩大预算。Trial 以当前文件状态结算，报告预算耗尽和验证结果。

### 检查超时

Action 标记为 `unknown`；控制器按容器 ID 查询是否仍存在并完成清理。不能确定结果前不自动重试。

### 验证器摘要不符

停止并返回 `inconclusive`。不允许使用修改后的验证器继续。

### 工作区基线不符

在模型请求前停止；不能把脏工作区当原始基线。

### 用户中断

保留工作区、数据库和最后稳定 Checkpoint。恢复时重新校验 TrialManifest、任务包、镜像和工作区摘要。

## 14. 测试策略

### 14.1 默认离线测试

不调用真实模型、不需要 Docker Engine，使用 TestModel 和假的 Docker 执行器证明：

- 任务包 schema、摘要和路径逃逸检查；
- seed 基线变化会被拒绝；
- 未登记 check ID 被拒绝；
- 模型不能看到最终验证器工具；
- Docker argv 没有 Shell 拼接和危险参数；
- Provider 哨兵不会进入 argv、环境、Action 或结果；
- 文件写入在落盘前执行授权、路径、单次大小和累计配额检查；
- TrialManifest 和 TrialResult 不可覆盖；
- A5 两轮使用不同 Run、同一 Goal 和连续工作区；
- 模型身份包含 Provider；
- 预算和检查次数不会因新 Run 重置。

### 14.2 Docker 契约测试

Docker Engine 可用时运行小型本地契约：

- 容器无网络；
- 工作区和验证器只读；
- 根文件系统只读；
- Provider 哨兵在容器环境中不存在；
- 超时会终止容器；
- 中断后只有匹配精确 container ID 和配置摘要的原容器可以被结算；
- tmpfs、Docker 日志和 Trial 目录不能超过硬上限；
- 相同输入产生相同验证结果；
- 不会写工作区外路径。

这是 Alpha-A 放行前必须实际跑过的环境测试，不能长期以 `skip` 代替。

### 14.3 任务作者测试

五个任务逐一运行 Nop / Oracle / repeatability 校验。

### 14.4 真实模型试验

顺序为：

1. DeepSeek V4 Pro 只运行 A1；
2. 复核 TrialResult、日志和费用；
3. 无边界问题后运行 A2 至 A5；
4. 汇总五个一次性试验，不从单次结果推断普遍能力。

## 15. Alpha-A 验收标准

工程设施通过：

- 五个任务包都有固定摘要；
- 五个任务都通过 Nop / Oracle / repeatability；
- Docker 隔离和密钥合同测试实际通过；
- 每次执行从准确基线开始；
- 所有模型文件动作都进入 Action Ledger；
- Goal 授权和写入配额在文件动作执行前被强制检查；
- 所有公开检查都由具名容器工具执行；
- 最终验证器不作为模型工具或工作区文件，且不能被模型修改；
- 五个真实试验都形成不可变 TrialResult；
- 中断、失败和预算耗尽也不会丢失证据；
- 生成数据位于 `D:`。

能力基线通过：

- 五个任务中至少一个达到 `met`；
- 报告如实列出其余 `not_met` 或 `inconclusive`；
- 没有越界写入、密钥泄露、验证器篡改或硬门失败。

“至少一个达到”只是确认执行链路能成功，不代表可接受的产品质量。五个任务的实际通过率只作为 Alpha-B/C 的问题来源。

## 16. 明确不做

Alpha-A 不做：

- Challenger 生成或 Skill 自动修改；
- Champion / Challenger 胜负比较；
- 自动晋升、灰度或回滚；
- 真正隐藏的保护任务；
- 实时联网依赖安装；
- 任意宿主机 Shell；
- 任意第三方仓库执行；
- 并行任务、后台 Worker 或 Web UI；
- 通用容器 Provider 接口；
- 对模型权重做训练。

## 17. 对现有代码的最小影响

实施时优先复用现有对象，只新增真实执行缺失的部分：

- 一个固定 AlphaTask / TrialManifest / TrialResult 模型；
- 一个基于 Docker CLI 的具名检查执行器；
- 一个只组装 FileSystem、Skills、StepPersistence 与 `run_check` 的 Alpha Runtime 路径；
- 一个把 Goal/任务写入限制和 `run_check` 接入 Action Gateway 的最小适配；
- 一个串行 Alpha 编排器；
- 五个任务包；
- 一个显式真实模型脚本；
- 对完整模型 ID 和通用异常结算的必要修正。

现有探索、Evidence、Skill 版本、Store、预算、Checkpoint 和普通 CLI 不重写。当前声明式 sealed evaluator 也不在 Alpha-A 假装升级；真实保护评测留到 Alpha-D。
