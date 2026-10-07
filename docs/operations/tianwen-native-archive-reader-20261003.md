# 2026-10-03：原生归档读取已交付并实际消费

基线6856c68、事前设计/计划3179cff；继承bac5397已经固定的reader合同和入口，原断言逐字不变。该功能服务实际归档收尾/续跑核验，完整自动学习目标仍active/incomplete，main/Daily完整学习NO-GO及原同意/隔离/资格/去重/停止/十工作日决策窗口保持，不重新计时。

## 首次真实任务与原样接纳

conversation-task:b68dafd03bc02b658f38d5c53a5e885f96b61e144e312cb768c531ef5f2a114d，10次真实请求（根5）、prepare1/evaluate1、0提供者重试、0脚本响应。原程序verified 1/1、两项原语义评审met且proof有效、整体met，未采用方法。功能回执sha256:e207e35983e3242e5632ba5e6c40a4166e437a1655a4cd830bb7b3aa366c9e37。

原稿3,568B，SHA256为bcaea8de1f75ef7a5834c767b287241127c547fe4488c189de9c151a63d27a34。静态审查未发现有据P1/P2，工程接纳逐字保持，没有控制端修稿。11个首次结果文件先封存，新Node进程准确恢复task/material/program及两原proof，0模型请求/prepare/evaluate、原账本不变。没有重跑或改判。

readDevelopmentNativeArchiveEntries只通过调用方readRecord依次读取六种原记录，各一次；null缺失与空文件区分，真实错误与取消原样传播。输入signal和上限在回调前校验，UTF8有效性及真实byte view复制符合原合同，累计超限停止；不解析SDK身份或判断执行/学习成功。

## 宿主实际消费

runDevelopmentNativeTask封存步骤改为await原reader。新增可选maxArchiveBytes，省略64MiB，非正safe integer在attempt前TypeError；marker记录实际上限。只将ENOENT映射null，其他错误保留；任务取消已经归档，独立未取消signal只用于收尾封存，不恢复模型执行。超限/读取失败进入现有archive-seal-failure，不覆盖原任务/flush失败或已保存result。

三个消费者反例首红，最终两组28项标准入口检查通过，覆盖取消/缺失/旧seal拒绝/写seal失败/启动参数拒绝/总量超限/原失败优先。原reader入口也加入标准回归入口，检查stdout JSON/exit0/stderr空；属于工程回归，不重复计自然来源。消费者复审无新增有据P1/P2。SDK包生产代码未改，不重复全包build。

新实际发行Runtime控制10 scripted/0自然，原程序一次verified、两审met，并通过reader生成真实字节seal。新进程task/program/两proof/seal准确恢复，0请求/prepare/evaluate、控制账本不变。工程侧reader另仅读取本轮和上轮两个实际归档，均5条存在记录、字节清单准确，未往首结果目录加文件或重新执行程序。该证据只证明读取和续跑核验接缝，不能替代自然学习效果。

## 正式状态与下一入口

实际发行及真实status工具新进程0模型/程序读取正式档：22观察21识别完成/15来源初筛/1可信问题/7成功候选、兼容问题pair false；反馈归因0/study0/隔离true。本次是真实普通任务成功，不是正式研究/激活/未来收益。旧OfferGo语气反馈针对控制端补写稿，不冒充天问首次失败候选的反馈。

原reader邻近待办已经执行，不能再称未执行独立case；本轮继承的study snapshot只保留其历史意义。下一完成已经固定的archive-status及一次完整归档状态展示/续跑核验，然后收口这个有界工作包，不追加近似题逼出失败。任何未来研究须装配实际原source图和尚未执行的独立待办，不能凭旧角色名称声称独立。当前来源不足不标整个开发blocked或向所有者索题；研究、语义安全、激活和未来效果按原要求分别核验，原期限到点明确继续/停止判断，不机械续期。

## 历史与空间

小运行根D:/DevData/tianwen-native-archive-reader-20261003，审计前606,195B；共享执行器本轮新增6个必要回执共6,380B，旧174个共享文件保持。旧driver.cleanup的ownReceipts字段实际是共享前缀计数，不据此删除其他轮文件或声称本轮所有权。无下载、依赖/发行/Profile全量副本。

正式账本1,271,265B，SHA256为721aba16f55d0be9ce5e730d2b0866932f299cce8bca10294f5e02bb3a0583de；旧1,210,748B/4be50d3b…前缀准确。旧81fc103的9文件、4b39e748的10文件与本轮11文件（合计30）逐字保持；冻结原参考合同/SDK/checker根1c0718e6…不变。

原84容器完整ID准确，自有新程序容器已收回、快照0、测试临时根0、Docker正常关闭/相关进程0；D审计时约18.24GiB≥15，未达20GiB偏好，不破坏历史证据或重试旧拒绝删除。最终容量、提交与远端以运行根final-audit.json为准。
