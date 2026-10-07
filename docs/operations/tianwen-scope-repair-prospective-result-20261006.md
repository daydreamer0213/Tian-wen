# 原生反馈引用纠错首次前瞻结果（2026-10-06）

## 结论

两项全新普通公告任务完成，正常原生反馈接收为 preference、三条 continuing。故障项没有通过纠错验收：明确模拟的一条省略号引文被原工具先捕获，原 late 校验拒绝为 invalid-judgment/inconclusive/proofnull，持续标准未采用；原子会话没有收到前置纠错提示，也没有真实后续纠正请求。保留失败，不重发 F1/N1、不重判旧结果。正在定位同一前置检查在普通 Runtime 集成里未生效的原因；不是要求所有者另出题或等待自然问题。

## 本轮身份与真实执行

- 冻结分支 `codex/conversation-claim-evidence`，SHA `67975e3c8809d51285f6cee04f6944a9b90cd041`，149 当前生产文件；执行时源码干净且保护 960 文件原字节。Daily 原 169 文件保持，0.1.24/Desktop preview.25 安装未变，main/Daily 完整自动学习发布原 NO-GO 保持。
- 输入 `D:/DevData/tianwen-scope-repair-inputs-20261006/public-cases.json`：读书室试开放 F1、小区检修 N1；任务及持续表达偏好均由执行者主动模拟并事前固定。模拟不是所有者读后反馈。controller-only 预期不供给模型。
- 原 SDK/base/Web，原普通 Runtime apply/default quarantine，新独立 Profile `scope-repair-prospective-20261006-r2`；原 Agent factory、`messageFeedback.put`、bridge reconcile、FeedbackService schedule，原 Session/JSONL、原 admission/双审/feedback/scope。没有自建执行器或裁决器、没有复制环境/凭据/旧历史。
- 实际目录 `D:/DevData/tianwen-scope-repair-prospective-20261006/r2`。18 次真实 provider 调用与 1 次明确脚本 scope 响应，合计 19 原生步骤逐一恢复 header/messages/system/tools/config。脚本只产生首个 F1 scope 的错误 tool call，未调用 provider 再丢弃其回答；普通任务、正常反馈及其原票真实执行。
- 两首答分别唯一绑定原 Task completion span 与原生反馈 messageId；后续原 SDK 通知产生的两条附加回复分别保留，不能把最后一条误作初始交付。两原 Task 均双 met，四原 review proofs 恢复；不称全面语义安全。
- F1 scope child `6485ec24-153b-4469-855c-0932e5b560be`：seq17 原 `Structured output recorded.`/isError false，随后 domain 引文检查拒绝；1 原生步骤、0 后续实际请求、scope proof 不存在。脚本错误不称模型错误，late 拒绝不称 early 检查或真实纠正成功。
- N1 原 classification preference、三条 continuing；原 feedback/scope 两 proof 恢复，原 active feedback material/digest匹配。不能把它当新研究/激活或后任务收益；study/activation0，不强求触发。
- 预检/运行/冷读取原 CLI 均0；运行约226秒，18调用低于30/15分钟上限。原同意 revision2关闭、quarantine仍true；正常 drain/flush/owned handle dispose/原 appExit；冷读取0请求、0历史Agent挂载、state/ledger不变。

## 失败与独立审计

首次环境 `D:/DevData/tianwen-scope-repair-prospective-20261006`：host API proxy缺directoryPicker导致启动CLI1，0actual/0scripted/0native step/未消费两案例。原idle创建/flush/dispose记录保存。r2仅恢复之前实际成功的原browse host/client服务对并提前保存原host退出函数，新Profile；首失败/源码/原工程文件未改。只读首失败审计 `D:/DevData/tianwen-scope-repair-controller-20261006/first-preflight-audit.json` exit0，不能称首环境正常退出。

原terminal auditor CLI1：它假设父会话最后assistant消息必是初始答案，实际原反馈通知已产生后续回复。原审计脚本与原失败完整保留。新独立只读 auditor按原receipt、原Task completion及messageId精确绑定首答，并观察 early/late 实际状态；未放宽逐step请求恢复、原review/feedback证明、生命周期或保护检查。实际audit CLI0/0新模型，`D:/DevData/tianwen-scope-repair-controller-20261006/final-audit.json`。其中 structuralValidity/proofInvalid0只描述留存证明及账本一致性，绝不把F1纠错失败改为通过。独立只读复核亲眼确认所有这些边界，无剩余P1/P2审计缺口。

## 下一具体实现

确切根因已确认：bootstrap加载的公开 `dist/runtime.js` 是 esbuild整合产物，其内联scope调用没有新validateCapture；独立tsc产物 `dist/conversation-feedback-assessment.js` 有该修复，但公开入口并不加载它。通用guard仍在公开bundle中，caller未传callback，故放行到late检查。旧runtime/meta已按冻结SHA核对并压缩保存到controller；metafile反馈输入28646字节，当前源码29558字节。前次类型构建未执行原包build的esbuild阶段，源码测试和独立模块检查不能证明实际入口行为。撤回上下文过滤/SDKguard猜测，无需修改SDK。下一新增原公开apply的红回归，执行现有原esbuild构建，再绿回归和全新反馈真实纠正；不重发F1/N1。另已查明U2既有R9角色/保证误读是两审主动当成释义，拟仅对新版本明确拆分独立承诺/必要角色与逐项来源，保留原audit v2、旧版本原证明、正常建议；不加第三审、词语禁令、通过次数或新发布门槛。八项全新正负对照已在独立D输入目录准备，不供给当前反馈批。有限计划见[公开产物与来源范围收口](../superpowers/plans/2026-10-06-tianwen-public-build-and-assertion-scope-plan.md)。

终态审计后将唯一重复全量 `run-final.json` 无损压缩为 `run-final.json.gz`，逐字回解/原SHA确认，释放8163607字节；原Session JSONL/provider/原票/失败/审计保持。读取旧终态请内存gunzip，不重放本批。当前D约16.67GiB，满足15底线、未达20偏好，无依赖或环境副本。原public旧bundle另仅保留一份压缩故障依据。

受控DEV完整学习闭环已经完成，普通Web已完成；本批按“纠错集成失败、正常反馈成立”收口，不重新打开这些阶段。目标保持active，继续具体修复，不将模型/配置失败泛称整个项目blocked。
