# 标准 DEV 可信合同加载入口

本轮交付一个原 Cordis Loader 可直接导入的薄插件：`scripts/development-native-runtime.mjs`。它读取事前固定、按原始字节 SHA-256 锁定的 JSON，然后调用既有 DEV 工厂及公开 `applyDevelopment`。加载、服务就绪、Agent、模型提供方与持久化仍由原 DSH 负责；没有另造宿主或学习规则。基线 c10dc7b。

## 实际可用接口

在已有 Cordis Context/Loader 中，通过已验证的原接口加载。下例三个配置值必须来自操作者事前固定的真实合同，不得直接用本轮工程样例启动自然任务：

```js
import { pathToFileURL } from 'node:url'

const id = await ctx.loader.create({
  name: pathToFileURL(repo + '/scripts/development-native-runtime.mjs').href,
  config: { developmentRoot, contractPath, contractDigest },
})
await ctx.loader.await()
```

`developmentRoot` 是 `D:/DevData/tianwen-development-runtime` 下已存在的规范直系子目录；`contractPath` 是 `D:/DevData` 下规范普通文件，物理位置必须在任务可写工作区外；`contractDigest` 是 `sha256:` 加原字节的64位小写摘要。插件等待已有 `sessionPersistence`，复用原 JSONL 后端。原常规服务须按既有 DSH 启动过程安装；此例不是完整应用启动器。

合同包仅允许以下字段，合同内部仍由原工厂严格校验并冻结，不是新格式的任务要求：

```json
{
  "schemaVersion": "tianwen.development-native-contracts.v1",
  "ordinaryContract": "原普通合同对象或数组，此处仅示意",
  "studyContracts": "原五角色研究合同对象，此处仅示意",
  "goalContract": "可选的原 Goal 合同对象或数组，此处仅示意"
}
```

以上示意字符串不能作为可执行合同。8 MiB 是操作者合同加载的资源上限，不改变原任务结果、研究、语义或发布门槛。JSON 数据不做 Loader 表达式求值；不允许额外插件、命令、模块或任意 Runtime 开关。

标准 Profile 如果已有原 Runtime 条目，应在启动前替换为这个 DEV 入口，不能在已有 Evolution 上重复挂载。此次验证的是原 Loader API；没有发未经验证的 Profile patch。插件登记原文件权限生产者身份，但不自行安装交互会话权限。真正执行任务仍须使用已有受控 `runDevelopmentNativeTask` 路径，直到标准应用的实际消费和文件观察链被验证。

## 本轮证据及错误

证据目录：`D:/DevData/tianwen-standard-dev-runtime-20261004`。

- 首正式 red：4项因插件缺失失败。更早一次日志目录不存在，测试未启动，不能算 red。
- 初次 green 两项设置错误：混合分隔符与缺原 Subagent 服务；修正控制设置后4项通过。
- 独立复查发现 lexical cwd 会被祖先 junction 隐藏。真实目录反例先失败，再改用 `realpathSync(cwd)`；负例与合法外部合同别名正例均通过，不禁止全部别名。
- 最终 `final-related.json`：新插件6项及原 Goal 分派4项，共10项通过、0失败。先前 `final-focused.json` 的第二文件名未匹配，只有6项，不能称其覆盖其它回归。测试现对本次自建规范根先解除自有链接再清理，不触碰旧路径。
- 独立只读复查关闭原P2；新增清理另经只读复查，无有据P1/P2。没有修改 Runtime/工厂源或构建产物；没有重复发行构建。

另一个普通 Node 进程实际用原 Loader 加载公开 Runtime、原核心服务、原 DeepSeek 提供方、原生文件工具和此插件；未挂载 `mountFeedbackHarness` 或脚本模型适配器。`cold-loader.json` 与 `cold-loader-cleanup.json` 记录：

- 6项原 Task 精确读取；前五摘要及第六完整对象与原归档一致。
- 原同意 revision=1/enabled=true；反馈0、研究0，保持原样。
- DeepSeek 配置成功解析，原 read/write/edit 注册身份正确；模型请求0。
- 持续与正式两个账本加载前、加载后、Context dispose后摘要均相同。
- 原公开 Runtime SHA-256 `b2210c87398fbf40d894f711c27ec33ed78da16a7d0cb9a40fc50aabc7fb5d4d`；插件 SHA-256 `ac6b4f9830564d3c54b3a5f84856a21399647bb4fe0230c4b1fd9c5a0d17b2a1`。

冷加载所用合同是独立工程数据，不用于重评六个旧任务、补来源、写裁决或证明任务效果。提供方配置能解析不等于真实请求已成功；原文件注册不等于完整交互权限和观察链已验证。

本轮早期42个自有临时根的清理在创建进程前被自动审批拒绝，只返回 `blocked by policy`；整条命令未执行，没有解除链接、删除或重试。`cleanup-refusal.json` 保存精确路径；原29加新42共71拒删路径保持。最终测试自己的新根已自动清理，两者不混称。D实测17.944GiB，Docker进程为空，无环境副本；只保留小合同/测试与冷载证据，没有全量环境。资源与未变账本见 `final-audit.json`。

## 还缺什么，以及谁来推进

产品接入的下一步由当前执行者负责：用这个原 Loader 入口、既有权限和原 Agent 生命周期执行真正的后续开发工作；在未知答案前固定该工作的要求、独立检查和材料，保持一次正式尝试。不要再为计数增加报告小功能、重跑本次冷加载或索要用户补题。若标准执行暴露实际接口缺陷，仅修复该缺陷并保留首次记录。

自然学习仍缺符合原资格的来源组：目前唯一完整成功与报告问题的原条件及检查器不同，三个报告程序成功的原双审未定；只有1可信问题，不能组装原研究。新接入不保证自然失败，也不能把工程预设失败充当第二问题。取得两个输入独立的兼容问题和兼容合格成功后，才观察原五案例/十臂研究、原裁决、自动采用、后续任务效果和回滚；真实反馈另行如实归因。

历史语义越界风险仍未被自然前瞻证据排除。加载、程序验证、内容双审、研究裁决、激活和未来效果分别记账。完整目标 active/incomplete，main/Daily 完整自动学习仍 NO-GO；原发布条件及十个工作日决策窗口保持，不加标准、不重置期限。若窗口内没有原要求的有效收益，作有界结论，不能靠继续堆任务自动续期。
