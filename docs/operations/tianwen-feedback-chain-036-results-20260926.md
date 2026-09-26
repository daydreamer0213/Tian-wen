# 036 相容汇报偏好：来源与一条支持成立，两条完整同族支持未成立，NO-GO

2026-09-26 按[输入前协议](tianwen-feedback-chain-036-protocol.md)，从准确提交 `120ed8b2d5e4a68d291f9eafddfcd4baff3947c6` 独立构建、打包并逐文件核对安装。14 个构建步骤通过，候选归档 SHA-256 `c819ef38330f4cbe0bb8baa5e5b7694ab37dbdae8c5aa429d27ebd0d2f9a0a3e`（产品代码与 035 相同）。全新 E036 独立配置档、空账本与会话；DeepSeek-V4-Flash / High、标准模式、Workspace Write。两份来源和八条预定请求在模型输入前冻结于 `D:/DevData/tianwen-acceptance-control/036/pre-input-freeze.json`，来源只放在独立工作区。X/S1/S2/C 各发送一次，X/S1/S2 各在原会话追加一次固定反馈；没有补题、重发或重启。

| 项目 | 原生结果 | 对放行条件的意义 |
| --- | --- | --- |
| X | 实际读取两份来源并用命令计算 SHA-256，与冻结副本哈希 `e1224495d5e7a06d0bcfc60f6bc82842f69801e71ac003065173ccef157d1715`、`03c1f48cb2d05778293418d948d0d65844e3dee907add779fbc8ab180f6606d6` 一致；准入 `summarization/external`，后续反馈评为有效 `preference/user-preference`、5 条未来标准。原任务复核 `inconclusive`。 | 外部偏好证据有效；由于研究未打开，本轮没有实测提案是否消费这条线索。 |
| S1 | 准入 `writing/text`，原生模型与材料可恢复；原任务复核 `inconclusive` / `invalid-judgment`，没有有效反馈评估。 | 不满足冻结要求的 `summarization/text/met` 完整支持。 |
| S2 | 准入 `summarization/text/met`，两份独立复核和原生证明有效；后续反馈评为有效 `preference/user-preference`、6 条未来标准。 | 一条完整支持成立。 |
| C | 准入 `summarization/text/met`，一句话原任务通过复核，无不利反馈。 | 同族成功对照成立。 |

对 S1 的只读诊断发现，原生要求复核子会话两次 `structured_output` 调用被工具拒绝，第三次虽成功记录，提交的审计仍含与答案单元不完全一致的引用片段；产品守卫因此以 `invalid-judgment` 结束，未保存有效复核证明。这是本轮具体模型判断失效，不能把模型重试中的文字当成通过。更早的任务准入已把 S1 判为 `writing`，与 S2/C 的 `summarization` 不同；即便复核有效，本轮也没有两条同族支持。两处缺口均如实保留，不改变输入、分类或复核结果。

因此 036 **没有合格的 T0、没有 `study-opened`、没有提案消费或方法采用**；按冻结协议 F 未发送，未来效果未证明。035 已通过的首个 host 即时唤醒子门槛仍按 035 自身证据成立，但不能用 036 推断新的同族证据齐全后的研究表现。

网页中已关闭自动分析，最终同意状态 revision 2 / `enabled:false`，无生效方法需要回滚。最终只读审计 `D:/DevData/tianwen-acceptance-runs/036/native-use/evidence/audit-final.json`（SHA-256 `5bab5c5bcca14332e90d429da641e6e7b06f07aebaa55a263e1958d8315ae1a2`）核对 8 条任务、2 条反馈评估、0 项研究和 14 份有效原生证明；X/S1/S2/C 的模型和材料可恢复，待测任务工具调用未见控制材料读取。自有网页关闭，host PID 11828 于 `07:29:09.080Z` 停止且进程已消失；`host-output.log` SHA-256 `fe94cdab082789af394071c72d55a4d44d724960917d275472ac708d5f602b2e`，未见研究不可用或错误警告。

**发布判断：NO-GO。** 036 证明真实来源读取、持续偏好评估、一条完整文字支持和同族对照可以发生，但没有形成两条合格支持，不能测试研究与后续使用。下一阶段先提高日常任务的证据质量：把“概括项目事实”的任务族边界与“撰写汇报”的差别作为可观察产品行为，针对原生复核引用必须逐字命中的规则减少模型无效提交；工程改进仍须单独红测、回归，再用自然用户工作和新的前瞻样本检验。不要继续用改写过的 036 输入补样本，也不降低复核门槛。main/Daily 保持不变。
