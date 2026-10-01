# 完整文件输出的可信操作证据已接入

已修复上一实际96b618任务暴露的复核材料缺口：新完整文件任务可以提供从原生记录核实的读取、编辑、文件路径、成功结果及顺序。模型不再只能看文件前像和生成结果猜测操作流程。实现与版本设计见[设计](../superpowers/specs/2026-10-01-tianwen-file-action-evidence-design.md)。本轮为控制端工程实现及受控原生机制验证，0新的真实模型任务；原96b618两模型inconclusive不回评。

## 具体实现

新task-started事前保存可选fileExecutionProjection=native-actions.v1。完整files经既有recoverFiles完整原生span、前像、捕获边界和输出核对后，恢复file-execution-evidence.v2，每项包含实际工具名、冻结规范文件路径（辅助工具为null）、callSeq、resultSeq、success/error。结果必须一对一关联callId/sourceEventSeq/turn/step并在captureSeq前结束；缺失、重复或关联错误停止提供证据。路径仅在既有原生验证之后沿原lowercase身份匹配，输出保留冻结拼写。

新原始复核将动作作为独立工具事实，说明只能支持实际操作与结果，不能支持文件内容真假、测试通过或任务外作用。写后读回内容仍不作为事实来源；method-study的task分支不投影旧操作，不能以原任务成功操作证明新答案成功。v2不作无write/edit或输入未变保证；旧chat的file-execution-evidence.v1及原指令保持。

无marker旧完整files保持原材料；source字段和版本严格解析，未知值拒绝。taskId、原准入、质量合同、研究资格及原材料/答案限额未改变。并未补一个额外模型、宿主手填成功字段或开放任意生成内容作为依据。

## 验证、失败和归属

两项政策/原生缺证先红已保存。首次接线测试因工作区旧构建包尚不识别新字段失败，完成原包类型构建后通过；没有用其虚构任务失败来源。七组不同297项当前通过：首完整回归295通过/1个Windows路径大小写失败，新增原生read(input.ts)→edit(INPUT.ts)→read(input.ts)反例保留精确先红，修复后最终完整observer50/50通过，其他六组246项保持原结果；再新增1项原生glob→read→write检查通过，确认辅助工具也列入完整操作序列且生成内容不进来源。重复定向通过不重复计数。

新原生机制覆盖完整顺序及路径、写后canary排除、研究不能引用旧动作；六种结果关联篡改（重复/step/callId/sourceEventSeq/失败/迟到）不能提供动作证据。新任务冷恢复原task/material与两原始复核proof，0模型请求；14项独立表示/边界检查保留旧v1描述并拒绝未知schema、错误路径/顺序/结果等。独立只读审查提出的P2路径问题已关闭，无剩余重要问题。

八包类型与实际bundle构建通过；七个主要修改/新增TS相对081d10c旧0/现0。新增辅助工具反例后联合检查八个完整TS，旧18/现18、新增0，保留该旧辅助工具测试的18项既有诊断，不称全部strict清零。第一次联合strict的4个新测试类型错误保留，正式CallId品牌和SessionEvent上下文修正后清零，未放宽生产类型。

正式持续DEV只读恢复仍5原任务、awaiting-compatible-sources、0研究/模型请求、隔离true。原96b618 task/material逐项相同，没有新fileExecution或marker回填；原review仍inconclusive，原68bca成功、1f5cb失效检查通知及全部其他历史保留。账本raw SHA-256仍ca9fdec7c5b91cbb53d72ebe1c15ba4baa65600497c65019589f94a7f2bd1541，恢复与释放前后字节不改。

## 下一步及完整目标

下一自主选择另一个实际未完成开发任务，固定适用原要求及候选之外的检查，再一次真实模型前瞻验证新操作证据路径。不得重试96b618/43ad8来求met，不把本轮脚本请求算真实模型成功或学习。真实失败/反馈出现后仍需合法兼容来源、独立案例与原结果合同；不能以维护或机制通过代替研究、采用及未来效果。

完整目标active/incomplete；main/Daily NO-GO、正式激活隔离、原发布门槛和十工作日窗口不变。运行生成物D:/DevData/tianwen-file-action-evidence-20261001，约60KiB日志/小回执，复用原Profile/依赖，无新全量副本或安装；测试自清临时目录，最终资源以finish.json为准，D仍约18.47GiB，满足15GiB下限而未达20GiB偏好。
