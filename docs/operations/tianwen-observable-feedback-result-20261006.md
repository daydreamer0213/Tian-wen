# 可观察长期标准：当前版本首次真实研究结果

完整目标仍 active；**本批未激活方法、未验证后续任务效果，main/Daily NO-GO**。这不是等待用户提供任务：下一项工作是让自动构造的测试题明确来源范围和可检查的要求，并用已准备的新记录验证条件式方法。

## 已确认的进展

源码 `e1734dac5b3e650387375af841c5dc329ae0336b` 完成原公开构建16步、196项相关检查、私有导入0。旧11份反馈证明及22份审核证明零模型恢复通过。两处修改分别说明长期行为与范围解释的区别，以及坏审核编号的精确拒绝信息；没有改SDK/schema/投票/学习门槛。

新空DEV环境完成70次真实请求、0脚本模型响应。三个普通任务六份原生检查均met；两条明确标注的模拟反馈均preference，只提取三项可观察行为，六个范围判断全部continuing，原反馈及范围证明可恢复。source2的“本次不用修改”没有再成为额外长期标准。首次任务、原票和所有拒绝提交均保留。

原系统自行启动一个新研究 `guidance-study:43118a2b987ab00cf4a53a6d17a0a6cb3fe6adce7af039e0a6c1d04a764fc349`，完整10臂/20份原证明：

| 原案例 | 原方法 | 候选方法 |
|---|---|---|
| source1 | not-met | met |
| source2 | not-met | met |
| counterexample | met | met |
| adjacent | not-met | inconclusive |
| holdout | not-met | not-met |

前两组确有原生paired改善，不等于新方法已采用或后任务收益。原`dev-conclusive-pair.v1`决定inconclusive，没有activation。未消费的future1/future2及无关题未执行，其输入与六项效果标准保持不变。关闭consent revision2后新普通任务仅1次请求，无新分析或方法注入；原退出、冷恢复、终态审计CLI均0，冷恢复0模型。

## 分歧及失败的实际含义

adjacent候选符合事实、组织与独立成句要求；“合并前三句是否足够压缩”两原审分歧，独立盲审也保留定性不确定。holdout候选带入请求介绍语中的船棚名称；原两审依据sheet-only及不添加使用地点的冻结标准not-met。独立盲审认为这属于上下文与限定记录的边界解释，**不能称为凭空捏造地点**。原票保持，不第三审、不改旧案例，也不以盲审代替原裁决。

自动出题当前只要求checkable criteria，未明确让题目消除上述范围与压缩操作歧义。下一最窄实现是在原text-only case-design指令中说明：来源范围必须在任务中写清，要求必须可检查且与保留事实/输出形式兼容；不得把泛称“简短”升级为未声明的字数、全部改写或改变原句式的标准。保留真实压缩要求和缺字段的过度泛化反例；不删已生成标准、不放宽接受条件。

counterexample基线的一名审核子会话11次真实调用、10次原拒绝后自行捕获成功。主要是字符串`"null"`与JSON空值、额外wrapper等提交格式；审核编号一直正确。原SDK拒绝成立，未自动修参数。精确类型提示属于已记录的可选健壮性改进，不设为新的学习或发布前置条件。

## 证据与运行问题

controller：`D:/DevData/tianwen-observable-feedback-controller-20261006`；运行根：`D:/DevData/tianwen-observable-feedback-prospective-20261006/r1`。`terminal-audit.json`核70实际请求与SDK原headers/surfaces绑定、六普通/20研究检查和原材料/提案/执行证明，proofInvalid0；独立核150生产+1950保护+6操作路径及52新SDK文件零差。

首次启动配置把已批准修改的claim-review源仍按旧保护摘要核对，0模型即停止。唯一源码替换已按旧commit逐字gzip归档并记录新旧摘要；旧manifest/旧结果不动，其余旧保护字节全匹配。`first-author-failure.json`明确首错误记录来自先前输出重构，不冒充原stderr。

首外部盲审包把生成案例的undefined sourceTaskId误匹配到withdrawn任务，四项request映射错；不影响原SDK/研究材料。原包和首盲审保留，独立新v2作者仅修映射并另写新包；另一位未看原票的审查者完成四项纠正输入的首次盲审。见`semantic-packet-first-failure.json`、两盲审、`semantic-vote-comparison.json`和`task-8-terminal-review.md`。0重发、0重评、0新模型。

独立终态允许解除源码冻结，`source-freeze-end.json`已落盘。新环境总生成约39.2MiB，没有整套运行环境/依赖/历史复制，D剩余约16.47GiB，满足15GiB最低值、未达20GiB优先值。原SDK JSONL和实际首次材料需保留；后续继续控制重复副本。已安装Daily0.1.24/preview.25保持。
