# 证据报告批次：原始合同

三个实际程序将用于天问进度报告。仅Python标准库，stdin一个JSON对象、stdout一个JSON对象；不读文件、不联网、不执行外部程序。原合同不可修改。每个程序源码≤20,000 UTF-8字节。JSON非法、多根、重复键、非有限数均无效；每条字段恰为下列定义。ID是1–256个Unicode标量码点的非空字符串（空白是合法内容），不归一化，区分大小写；各ID数组按Unicode码点字典序升序。布尔值必须是JSON boolean，数字不能当boolean。输入无效退出2、stderr空、stdout固定`{"error":"invalid-evidence-records"}`；有效退出0、stderr空。对象键顺序和JSON空白不限制。

共同原必需条件：**严格遵守原合同的输入有效性、证据归属与统计规则；不同证据状态不得混算或提升为整体完成；有效输入返回规定JSON/退出码0，无效输入返回规定错误/退出码2，stderr为空。**

## A：任务结果报告

目标`scripts/summarize-task-evidence.py`。输入恰为`{"tasks":[...]}`，数组0–64项。每项恰有`taskId`、`completed`、`review`、`check`、`invalidated`。taskId唯一；completed/invalidated布尔；review为null或met/not-met/inconclusive；check为null或verified/rejected/unverifiable。check为null时invalidated必须false，其余状态可撤回。原记录各状态独立，不因模型met而改写功能失败，不因检查撤回而改写模型原评价。

输出恰为`total`（数量）、`completed`（completed=true的ID数组）、`modelMet`（review=met）、`currentCheckVerified`（check=verified且未撤回）、`jointEvidence`（completed=true、review=met、check=verified且未撤回）、`attention`（不在jointEvidence的其余ID数组）。前三组允许交叠，jointEvidence与attention完整互斥覆盖。jointEvidence只是这三项原记录同时满足，不证明答案全面正确、自然研究或完整自动学习。不能推断任务采用状态或反馈。

## B：研究与激活报告

目标`scripts/summarize-study-evidence.py`。输入恰为`{"studies":[...]}`，0–64项，每项恰有唯一`studyId`、`purpose`、`decision`、`activationRecorded`、`currentActive`。purpose为natural或controlled；decision为null或accepted/rejected/inconclusive；activationRecorded布尔，currentActive为null（当前状态未知）或布尔。activationRecorded=true要求decision=accepted；currentActive=true要求activationRecorded=true。currentActive非null须有调用方当前Runtime显式状态；只有历史执行回执或Runtime已清理时填null，不能仅凭历史activation事件或全局隔离推导。

输出恰为`total`、`natural`（natural ID数组）、`controlled`（controlled ID数组）、`accepted`（所有decision=accepted）、`activationRecorded`（所有对应true）、`currentActive`（所有对应true）、`currentActiveUnknown`（currentActive=null）、`naturalCurrentActive`（purpose=natural且currentActive=true）、`pending`（decision=accepted且activationRecorded=false）。natural/controlled完整互斥覆盖；pending只表示传入记录accepted但没有激活记录，不代表正在后台运行。研究accepted不等于激活，激活记录不等于当前生效，controlled不等于natural，也不证明未来收益。

## C：回归前后对账

目标`scripts/reconcile-regression-evidence.py`。输入恰有`initial`和`rerun`，都为0–64项数组。每项恰有`fileId`、`revision`、`caseSetDigest`、`passed`、`failed`、`skipped`。三个字符串遵循ID规则（不要求实际hash格式），fileId在各自数组唯一；三个计数为0–4096的真正JSON整数（拒绝bool/小数），合计1–4096。caseSetDigest由调用方按同文件案例完整多重集合生成，包含同名参数项的出现次数，不是去重后的名称集合。输入本身不认证来源。

rerun仅可引用initial已有fileId，且必须与该文件revision/caseSetDigest/总数全相同；任何不匹配使整个输入无效，不能悄悄覆盖或计作无失败。合法rerun替换该文件的当前passed/failed/skipped；未补跑文件保持原状态。保留initial原计数。输出恰为`initial`（passed/failed/skipped三计数之和）、`effective`（替换后的三计数之和）、`replacedFiles`（补跑fileId升序）、`singleRunPassed`（仅当rerun空且initial总failed=0）、`effectivePassed`（effective总failed=0）。空initial/rerun均空合法，两布尔均true，仅表示本输入无失败，不证明实际运行或全面验收。若补跑非空，即便最终effective无失败，singleRunPassed仍false。

## D：独立预留控制运行报告

目标`scripts/summarize-controlled-run-evidence.py`。输入恰有`realProviderRequests`、`scriptedRequests`、`supplies`、`preparations`、`evaluations`、`coldRequests`、`activated`；前六为null（原记录未知）或0–4096真正JSON整数，activated布尔。输出恰有`providerCalls`（前两项都非null才相加，否则null）、`realProviderRequests`、`scriptedRequests`、`supplies`、`preparations`、`evaluations`、`coldRequests`、`activated`（原值），`naturalLearningProven`（恒false）。未知不能当零。控制运行次数/accepted/activated不能证明自然来源或收益。这是不同输入事实的受控研究任务，不能作为自然来源。

## E：独立预留采用后证据摘要

目标`scripts/summarize-future-use-evidence.py`。输入恰为`{"tasks":[...]}`，0–64项，每项恰有唯一`taskId`、`methodVersion`、`completed`、`review`、`independentCheck`。methodVersion为null或遵循ID规则的字符串；completed布尔；review为null或met/not-met/inconclusive；independentCheck为null或verified/rejected/unverifiable。

输出恰有`total`、`methodReferenced`（methodVersion非null）、`completed`、`modelMet`、`independentlyVerified`、`jointEvidence`（methodVersion非null、completed=true、review=met、independentCheck=verified）、`improvementProven`（恒false）。数组取对应ID升序。原记录版本引用包括默认版本，不等于已研究新方法；一次原记录联合满足不能证明相对旧方法改善。这是独立任务合同，不重评历史答案或原研究。
