# 原生模拟反馈前瞻验证计划

> **For agentic workers:** 使用已应用的 executing-plans 按下列步骤执行；本轮直接处理，不新建代理或工作区。

**Goal:** 在当前原CLI/public DEV Runtime中，以操作员明示模拟的普通任务和SDK反馈触发真实模型归因，补齐此前未发生的原生反馈证据；随后继续新policy下研究/激活/后续效果，不把这一步当完整学习完成。

**Architecture:** 复用原Profile/Web/服务组合与已构建发布包。只在三个确切root session的主答请求中注入显式scripted产物，原任务认领、族核对、双评审、反馈归因全部调用既定真实模型。经ctx.messageFeedback.put、Bridge.reconcileSession、ConversationFeedback.scheduleForSession/whenIdle记录版本，使用delete撤回；不直接写归因、裁决或学习来源。关闭CLI后重新加载原profile核持久回放。

**Tech Stack:** 安装Node、原DSH CLI/SDK、发布Tianwen Runtime、deepseek-official/deepseek-v4-flash high/65536/retry0。

## 授权与固定范围

所有者已授权缺什么条件就主动模拟，适用于全部开发；不等待自然任务、真人评价或重复失败，不另问许可。源码/历史与正式发布门槛保持；模拟与自然分列，main/Daily/R9当前保持。本轮无Docker、安装、依赖副本或新产品标准。输出仅D:/DevData/tianwen-native-simulated-feedback-20261005；新home为D:/DevData/tianwen-development-runtime/native-simulated-feedback-20261005。

考虑直接重跑类似研究、引入新代码任务、先补原生反馈三条路径。选择原生反馈：当前缺的是这个接缝的实际证据，三任务能独立给出归因/撤回结果，不先花真实研究预算。代码环境保留供后续有改善空间的任务，不把初始坏程序充Worker失败。

固定三原始摘要任务各新root session：模拟先导范围被改成全面上线的错误回答并提交具体negative→attributable-problem；正确回答只有negative rating、无说明→inconclusive；正确回答带明确认可positive→positive。主答输出事前冻结并标操作员注入，不称自然模型错误。指向确切原assistantMessageId；source生命周期、入场/结果/材料摘要、版本/fingerprint与真实独立proof均核实。

再修改第二项反馈，明确只修订已完成答案→requirement-change；删除第一项具体错误反馈→intake retracted、原归因历史保留/当前支持失效。三个任务原始入场、回答、评审不因反馈变动。保首次结果，具体错误由执行者诊断修复，不追加任务凑重复问题。本轮不足两同类问题不开展研究，无方法激活/未来收益宣称。

## 执行步骤

- [ ] 写固定场景、原CLI启动/原公共SDK操作员脚本，语法检查；冻结当前提交、发布消费者、输入、三旧账本；已有工厂配置只作加载，不执行旧样本。
- [ ] 原CLI零模型预检，确认原反馈服务、普通Observer、DEV加载与模型配置可用；真实请求拦截仅主答注入，判定请求不注入。
- [ ] 一个新正式批执行三任务/三反馈与第二项版本修订、第一项撤回；保存每次真实/注入完整请求轨迹及原SDK回执，原句柄排空；不写结论。
- [ ] 如原批完成，原profile冷加载验证SDK当前两反馈、历史四归因及三个原任务不变，0模型/不重复评判。
- [ ] 资源与旧历史审计、准确更新交接/计划并提交推送。清理只处理本轮可删除生成物；若安全策略拒绝保留并如实报告，不绕过、不把少量文件当目标阻塞。D>=15GiB，争取20。

## 停止与下一责任

原总执行预算12分钟。已启动句柄超观察窗只读同一原句柄，实际预算错误则取消原agents并排空，保完整首次错误。一次归因失败不是要求真人评价或机械blocked的理由，继续修场景/实现。未证明的激活/后续效果留为完整目标待做，下一新policy受控研究事前冻结，不重判旧206真实批。
