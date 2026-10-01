# 真实开发任务：只读实验文件保留报告及受限功能验证

用户要求持续自主推进及减少每轮残余，D至少15GiB、优先20GiB。现约18.44GiB，不能根据重复SHA、年龄或模型建议直接删除原证据。实际待办是一个无文件系统副作用的CLI：读取可信文件清单，输出字节统计和保留/待核对建议，帮助每轮精简存储；不是为了缓存Python镜像另造试题。

目标scripts/evidence-retention-report.py，由天问唯一真实原生尝试编写；仅标准库，JSON stdin/stdout，不读取清单所指文件、不写/删除任何文件。原功能规则见docs/operations/evidence-retention-report-contract.md。原要求、参考、真实清单、功能测试及隔离合同在模型回答前冻结。不得修稿/重试/事后增加功能验收规则；失败原样保留。

独立结果可行性采用一次窄实验：当前ConversationExternalCodeCheck禁止执行生成代码，本任务不改变/配置该接口，不在正式账本伪造program verified。任务完成后，以另存的事前合同，在现有Docker缓存Python中执行其CLI并由宿主比较完整JSON输出。只有候选源码/JSON测试输入经stdin送入，无宿主挂载、凭据、网络或测试期望泄露；不导入候选到宿主。保留原模型判定和另存程序结果的区别。新语义/功能路线是否可行由实际结果决定，尚未接入正式研究采用。

容器创建后inspect准确image/name/label/命令/无挂载/网络none/只读root/非root65532/cap-drop ALL/no-new-privileges/0.5CPU/128MiB且无extra swap/32pids/16MiB tmpfs/有限日志；每例20s宿主硬超时，32KiB输出限制，始终按准确身份强制删除自有容器，取消不运行后续案例。镜像固定现有sha256、pull never；不安装、不复制依赖/Profile、不重跑Alpha/旧预检。环境无法启动、边界不符、超时、输出超限、非法JSON或宿主检查错误分别保留，不能声称原功能失败。

先用明确标记的可信小控制程序证明实际stdout比较/非零退出/无网络及挂载边界和超时收尾；这些不是自然来源或模型成绩。真实候选只做一次冻结测试批次，包括正常/重复/必须保留/非法输入，再对真实新清单输出报告。任何模型/程序失败不重做本任务以求绿；功能成功不证明全自动学习、语义安全或发布许可。

复用正式持续DEV，预期7旧任务字节前缀保留，新研究隔离true。所有运行数据D:/DevData/tianwen-storage-report-native-20261001，只小清单/原始源码/日志/压缩原生证据；清自有容器/测试目录，原Docker初始停止则收尾恢复停止。main/Daily NO-GO、原发布门槛和十工作日窗口不变，完整目标active/incomplete。
