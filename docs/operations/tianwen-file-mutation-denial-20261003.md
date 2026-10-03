# 2026-10-03 原生文件修改拒绝记录交付

当前已补上真实任务暴露的一处产品缺口：第一次 write/edit 被可信宿主拒绝，随后合法操作完成时，拒绝仍保留为错误动作，最终文件可以正常核验。没有把被拒绝的工具当作成功执行，也没有放宽文件权限或程序验收。完整自动学习仍未完成，main/Daily 保持 NO-GO。

## 实现与边界

- Evolution 增加独立闭合 `tianwen.native-file-mutation-denial.v1` 和 `file-mutation-denied`，公开子入口为 `@tianwen/evolution/file-mutation-denial`。复用旧严格 identity、范围、唯一调用/结果、原参数/结果摘要及 producer 校验。投影前核对真实 write/edit，仅内部验证使用 read 结构，不修改输入原事件或结果摘要，不生成 read 收据。
- Runtime `guardFiles` 对同一原 guard 只调用一次。实际 SDK 文件定义现在同时观察 read/write/edit；定义注册来源、原 token、根调用、任务、参数、结果、producer 和取消状态分别核验。未知 guard、工具体相同文本异常、dispatch 反证、撤销、漂移或缺失/重复结果仍停止验证。
- 新 v4 动作保留拒绝的真实工具、原原因和 null 路径；只有含 mutation 拒绝的新记录使用 v4。原 read receipt、v3、旧指令保持。新指令只证明原工具体未 dispatch：DEV edit guard 本身可以读取目标做权限/预算检查，不能声称整个 guard 无 I/O，或把其读取当作已捕获事实。
- chat 可保留可信拒绝，并继续原两份评审；实际 success/error write/edit 仍不能通过 chat 材料投影。原 local-files 与已启用 external code 文件捕获分别保留，不新增自动学习入口。DEV 薄宿主优先接新 guard，保留旧 read-only 及普通 guard fallback；原 policy 字节不变。

## 当前验证

11 组 204 项相关检查、八包类型、完整发行 build、公开 Runtime/原生工具子入口消费及独立审查通过。首红分别保存：缺新 API、闭合对象隐藏额外字段丢失、chat 材料可恢复但原评审未开始。审查发现的 chat 问题只对 v4 已认证 denied write/edit 例外；直接 success/error 反例继续拒绝。

两个独立公开发行控制消费真实 SDK、同一原 DEV policy 和既有固定 Node-project 检查器：

| 控制 | 原拒绝 | 后续实际操作 | 独立程序 | 原两份检查 | 总体原评审 |
| --- | --- | --- | --- | --- | --- |
| write | 1001B 超原 1000B 预算 | 合法 write、read-back | verified，1 次 | met、met | inconclusive |
| edit | old_string 不存在 | 合法字面 edit、read-back | verified，1 次 | met、met | inconclusive |

各 10 个 scripted 请求、0 真实模型请求。拒绝没有成为初始文件或最终输出；write 初始 null、edit 初始原内容及最终字节准确。external 总体 `inconclusive` 是原产品对整体质量的保守规则，程序 verified 与两个模型检查 met 分开记录，本轮没有将其改为总体 met。

两个新 Node 进程分别准确恢复 task/material/两原检查，0 模型、0 程序执行，账本不变。另一个新进程恢复旧公开 read 控制，原 v3、task/material/program/两检查及原指令准确，0 模型/执行。无关功能检查器发行根 JS 与原冻结字节完全相同，保留 checker digest `sha256:7e3edfb37c643e760934c066382b9ac52ce8a68cbb209066bff317cddb702503`。

## 控制端错误按原归属保存

第一次脚本遗漏既有 external 任务的本地文件措辞 recheck，令 recheck 子会话消费了预设 root 操作响应；8 scripted、根无工具、failed/unverifiable，原归档保持。这是控制脚本错误，不是自然失败来源。修正后使用新控制档。

新 write 控制已经真实完成并 verified/双 met，但控制脚本误要求 external 总体 met，断言失败；原任务没有改判或重跑。随后只用 0 请求恢复保存这份原完成结果。edit 只运行一次。清理脚本最初读取了不存在的 receipt 字段，删除前停止；核对真实结构后，只归档并移除两份自有 receipt。以上失败均保留，不隐瞒、不记为学习样本。

## 正式状态与资源

正式持续 Profile 只读 0 请求核对：19 observed、18 identified/completed、0 反馈归因、0 study、激活隔离 true。完整账本 SHA-256 `91f83d10c45280e0a1f5bb39873dce48984f4311a76a513df2bf041308e619b9` 保持；原 f4da154 仍 completed、材料 unavailable、程序 unverifiable、评审 inconclusive，没有补资格。

生成物位于 `D:/DevData/tianwen-file-mutation-denial-20261003`，没有复制整个环境、安装依赖或下载镜像。两次自有隔离运行容器自动移除、快照 0，84 个历史完整 ID 准确保持。两份自有 receipt 先精确保存再移除，Docker 已关闭；当前 D: 高于 15 GiB，精确剩余/生成物大小/远端 SHA 见该根 `final-audit.json`。

首次失败工程控制的临时 Profile 删除命令被自动审批拒绝，返回仅 `blocked by policy`；整个命令没有执行，未压缩、未删除、未重试绕过。该小目录保留，大小单独列入最终审计，不称本轮目录全部清理完毕。容器/快照/两自有 receipt 的已完成清理与此拒绝分别记录，不影响继续开发。

## 下一步与停止条件

修复解决的是“真实工作完成却缺少可检查材料”，不是学习效果。下一阶段固定当前发行、DEV 宿主、检查器身份和原共同功能条件，从真实核心待办选择不同任务；各题在答案之前保存自身合同、独立入口和期望，只运行首次原任务。已有原失败不能补成新失败，新受控拒绝不能充当自然反馈。

分别核对普通任务结果、真实反馈/独立功能失败归因、产品是否自行研究、方法是否受治理激活、后续任务是否改善及语义安全。没有真实反馈不阻止独立实现；没有激活不发送用来宣称方法效果的后续验证。继续自行处理可修的缺陷，不索题、催用户评价或反复空审计 blocked。原同意、隔离、资格、历史、验收门槛和十工作日窗口不变，完整目标 active/incomplete。
