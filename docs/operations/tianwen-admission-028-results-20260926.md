# 028 准入格式真实验收结果：NO-GO

2026-09-26 按[输入前协议](tianwen-admission-028-protocol.md)执行一次独立真实 DeepSeek 验收。准确源码及协议提交为 `0aecb96437f012fd77191a19106933a881719e31`，候选归档 SHA-256 为 `c42496654035edcd3721322ea313207b49e254896ad1682e61727cc5c0628104`。构建、归档、独立桌面打包、安装文件核对和启动观察均通过；新环境位于 `E:/待清理/D盘迁移-2026-09-08/Tianwen-准入格式-028`，未复用 E027 账本或会话。网页实测使用 DeepSeek-V4-Flash / High、标准模式与 Workspace Write。输入前两份工作区材料和八条固定文本已冻结，见 `native-use/evidence/pre-input-freeze.json`（SHA-256 `a53957f6eaeeedc433b6ddddcfbeaf167b6cf8e0b2a339201fd7e07ec4b66c7f`）。

## 已发生的真实结果

同意开启后，按 X、S1、S2、C 顺序在四个新会话中各发送一次任务；X、S1、S2 的各一条反馈在对应回答出现后各发送一次。没有重发、改题或补造成功样本。由于研究没有打开，协议规定研究首次终态后才发的 F 没有发送。

- X 自主读取两份冻结材料并计算文件哈希，公开回答中的两个 SHA-256 与冻结收据吻合。准入将它判为 `local-files/chat`，但模型实际使用了命令且完整文件材料不可用，任务复核为 `inconclusive`。X 的明确关联反馈被归因为原任务的 `user-preference`，可用 v2 局部线索按准确原生材料恢复成功；它仍不算完整成功来源。
- S1 的自足摘要准入为 `text`，原任务复核为 `met`；随后的持续偏好反馈成功关联 S1，分类为 `user-preference`。
- S2 的回答过程越出当前工作区，读取了 `native-use/inputs/PROTOCOL.md`、`requests.json` 和旧 027 材料，并主动指出自己正处于验收。这个样本已受到协议暴露影响，不能称独立自然样本。更早发生的准入判断也无效：准入子会话将**格式正确的包裹 JSON 写成普通助手文本**，没有调用原生 `structured_output` 工具；因此没有有效准入证明，原任务复核为 `inconclusive/invalid-judgment`，S2 反馈没有产生有效评估。协议暴露发生在普通任务回答阶段，不是该准入子会话未调用工具的原因。
- C 按要求只输出一句话，准入为 `text`，独立任务复核为 `met`，可作为成功对照。

关闭前审计列出 7 项任务记录（四主任务及三反馈）、2 份有效反馈评估、0 份研究、0 次提案收到 X 线索。只有 S1 是完整支持，C 是成功对照；S2 不能补足第二份支持。`connectionObserved=false`，所以本轮 **NO-GO**。X 线索能被恢复，不等于已进入提案输入；本轮也没有方法采用、F 的未来使用或长期改善证明。旧 027 的 NO-GO 不改判。

## 收尾和证据

- 关闭前审计 `native-use/evidence/audit-before-disable.json`：`completed`，SHA-256 `8d1f7d97472637c5d150f8a34c6a5cc83a6bdef0345f16eac7839edacd9d3395`。
- 网页关闭学习到 revision 2，`enabled:false`；关闭后审计 `native-use/evidence/audit-after-disable.json`：`completed`，8 项任务记录（含关闭控制轮次）、研究 0、15 份原生证明全部核验通过，原有任务、评估及原生会话身份与关闭前一致。SHA-256 `ba2c8a65951f0f784d3043750f58781fa78e0805b148d3a771822d4704b2b06a`。账本 SHA-256 `3758f30a0273f64f8c43d3ea1d0e47b72c9f65042ae8270570440531041ad93a`。
- 自有 IAB 页已关闭，host 由原启动器 `stop` 关闭；`host-stopped.json` 记录 PID 6240、`ownerStopped:true`，退出后该 PID 和 61726 监听均不存在。收据 SHA-256 `795dbffe871927441b3d1d399cdbeb7dfb5eb95798cbd6a79d2fac5c46eca5a7`。
- E027 `audit-after-disable.json` 再核对 SHA-256 仍为 `c1916eba54a45d6e39249cd56008deff7c07c6dca31996634190029950008a34`。main 远端仍 `c13bad7`；未合并、安装、改动 Daily 或快捷方式。日常版本沿用上次实读的 Runtime0.1.22 / Desktop preview.23，本轮未重新读取安装文件。

## 下一阶段判断

当前修正只解决“原生工具已提交，但模式字段组合非法”的 027 S2 具体故障；028 暴露的是另一种更早的失败：模型没有调用结构化提交工具。不能把普通回复里的 JSON 当作已经提交的原生判断，也不应为追求通过而重跑 S2 或把研究门槛降低。下一阶段先研究是否能在**准入子会话入口**强制原生结构化提交，且保留失败时的无效判断与准确证明；同时明确执行器的读取边界，避免它读到隔离根下的协议和输入。两项问题需分别有工程证据，再决定是否值得开新一轮有限真实验收。当前候选不进 main 或 Daily。
