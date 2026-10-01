# 本次方法试验的原生操作证据

2026-10-01。设计/计划 `b1269e4`，实现 `02aabea78e6a321549b8f2fdb99196f08b061ad2`，开发分支 `codex/conversation-claim-evidence`。继承完整目标和所有者自主选题授权，不等待 OfferGo 主观评价，不索取新的用户任务。

## 实际缺口及交付

原 `runConversationFileTrial` 已真实执行并保存文件试验，但方法复核只有当前回答和文件，没有当前试验自己的读写动作。忽略来源任务的旧动作是正确边界；本次补齐当前试验的证据，不重新解释旧任务。

新增内部 `conversation-file-trial-evidence.ts`，从完整验证后的原生试验保存记录派生 `trialExecution`：执行 proof、输出摘要和全部工具尝试。每次调用须有唯一结果，计数包括非 append 结果；结果必须是原生 append，callId、turn、step、sourceEventSeq 和序号边界一致。规范路径只能来自冻结文件；拒绝或未知路径为 null，不暴露其他路径、参数或工具 readback。动作只证明执行及顺序，不能证明生成内容真实、测试通过或外部效果。

执行器在保存 receipt 前投影，返回新 metadata；原 receipt、输出摘要和旧 `recoverConversationFileTrial` 三字段返回不变。新伴随恢复先执行原完整 receipt/material/config/proof 核对，再从同一原生 proof 重建动作。method-study 复核接入本次动作；新保存的复核有 marker 时，冷恢复必须通过对应 arm 的独立恢复器精确对照，缺恢复器、另一 arm、同输出但不同 proof 均拒绝。研究循环的正式/探索试验及冷采用、文件审查包已接入。旧无 marker 的复核不补历史动作，独立程序检查输入仍为原 answer/files/outputDigest。

## 验证及失败归属

记录根 `D:/DevData/tianwen-trial-action-evidence-20261001`，均为受控工程核对，不是自然学习结果。

- `native-red.log`：真实文件工具 fixture 已完成读写，但首次缺 trialExecution，定向 1 失败/22 跳过，确认产品缺口。随后 native-focused-green 通过。
- `first-integration.log`：三套 33/33；`native-boundaries.log` 29/29；`review-cold.log` 新两试验同输出、两新/两旧审查重启核对通过。中间定向 loop 7/7 不包含 checkedSources；发现误放到该分支的断言，移到真实 trial 审查回调后才运行完整回归，不虚称定向已覆盖。
- `regression.log`：十套不同 290/290，包括完整 file-learning、guidance-loop、原始动作/引用/新旧文件复核、独立程序检查。最后增加非 append 重复反例并把投影移到 receipt 前，`native-final-corrected.log` 两套 31/31。不同测试合计 **291**，重复运行不相加。
- `native-final.log` 最初非 append 夹具显式写 undefined，canonical JSON 提前拒绝；改为真正删除字段后，反例到达关联核验并通过。不是自然任务失败。
- 八包类型和实际 runtime-bundle 构建退出 0。全部八修改/新增 TS 相对虚拟 `b1269e4` 基线 **10/当前10/新增0**（`strict.json`），旧诊断未清零。首轮新增 readonly array 诊断和第二轮 undefined 可选字段诊断已修，原文件保留。
- 独立只读审查及最后唯一关联/receipt 顺序复核无剩余 P1/P2；审查员未代跑测试或模型。
- 正式只读驱动首命令引用不存在的 loader，导入前失败（`readiness.log`），改用项目已有 tsx 后退出 0（`readiness-corrected.log`）。此控制端错误没有模型或账本动作。

## 正式状态及下一步

`readiness.json`：持续 DEV `D:/DevData/tianwen-development-learning-20261001` 仍 **6任务/0研究/awaiting-compatible-sources/正式激活隔离true**，真实提供者请求0，原96b618及e00e5e87任务精确保持，账本全部字节不变：`498c8f6b5f1f7932ec5e20fad52197a47a6c5fadf0bf7c72d7dd0e2698e7ce00`。本轮没有新实际问题来源、反馈、自然研究、采用或未来效果，不把受控机制写成 D 已验收。

完整目标 active/incomplete；main/Daily NO-GO、原发布门槛和十工作日决策窗口不变。下一自主选择不同的实际未完成功能任务及适用的原判断依据，一次原生前瞻核实新文件复核入口；只有真实兼容问题来源存在才进入研究，随后分别核对案例独立性、结果/语义、激活和未来效果。不得重做旧报告、造不利反馈、把有 marker 等同通过或以更多同类测试替代 C—F。

复用工作区、依赖和正式档，无新全量副本。当前记录约43KiB，本轮开始后的自有测试目录残余0，原生试验 replica 自动清理；D 约18.44GiB，高于15GiB最低线，尚未达到20GiB偏好。保存必要失败日志与小记录，不保存整轮重复数据。
