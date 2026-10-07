# 自主核心任务：研究原冻结文件的具体编译结果检查

## 交付与实际边界

所有者明确要求自行找/设计任务。本轮选择阶段D已有研究结果接线缺少具体编译生产者的问题，不索题、不等待OfferGo评价。75c8b04设计后新增scripts/conversation-typescript-check.ts的createConversationStudyTypeScriptCheck，抽取普通入口共同准备核心；新入口直接使用研究保存的files.entries，不伪造普通Task或新建临时项目。

宿主事前明确原请求、完整原criteria和目标/context/reference；仅适用原任务本就要求零strict noEmit的条件。criteria精确绑定原话，支持自然中文，不强迫旧任务新增固定英文要求。所有本地源码/元数据必须是保存的输入；安装编译库/包环境在提案前捕获。完整原输入、原要求、输出权限和最终只读文件绑定，两臂共享同一检查；新增依赖/缺证不可核验，真正编译诊断才归属原编译条件。未执行生成代码。

它证明冻结环境下的编译结果，不证明任意功能正确或开放文本语义安全；约束拒绝、抑制指令、绑定失配不能冒充原编译条件失败。研究prepareIndependentCases仍需要实际独立任务依据，本轮不造来源、不配置正式study、不解除隔离，也没有自然研究或效果结论。

## 失败及验证

- 首入口缺失：26/26真实红，red.log。初三组68项67通过/1失败是测试输出共享可变reference对象，修正夹具深拷贝后26/26；不记自然任务失败。
- 独立审查发现未保存旧import会由今天磁盘补全；新反例unsaved-source-red.log先失败，再限制研究baseline读取，遇未保存真实本地文件直接不准备。普通入口无该限制。
- 第二P2是原目录已消失：仅保存文件内容仍让当前directoryExists把完整原依赖误判TS2307。saved-directory-red.log实际失败后，从保存entries同时构建父目录、子目录及realpath视图；绿测试通过，普通入口保持。
- 初八组276项275通过/1失败：五准备及十次真实编译的单测试超过20s测试等待时间。原日志final-tests.log保留；仅该测试等待改60s，产品/结果/采用门槛不变。guidance-loop104项通过，原运行时相关文件未改。
- 最终七组178/178（其中新33项），final-seven-tests.log；八包类型检查types.log、实际bundle构建bundle.log均exit0；最终两个完整TS相对75c8b04，strict-reviewed.json旧0/现0/新增0。git diff --check通过。独立审查两P2关闭，无剩余重要问题。

原始记录均D:/DevData/tianwen-study-typescript-20261001，仅小日志/回执，测试自己的根清理；没有新依赖/Profile/全量副本。最终实测空间及提交以finish.json为准，收尾前约30KiB记录，D约18.44GiB≥15，尚未达到20偏好。

## 正式状态与下一步

本轮0真实模型请求/所有者反馈/自然来源/研究/激活。正式ledger完整SHA256仍faa002263340acdf48bd236816bda7a1230efb692733d12d7bf7d7554b134bef，与上一正式7task/0study/awaiting-compatible-sources/隔离true权威记录一致；未重复冷恢复或补评旧样本。完整目标active/incomplete，main/Daily NO-GO、原发布门槛和十工作日窗口保持。

下一自主选真正未完成、适用检查覆盖其原要求的功能任务，固定完整本地依赖和原依据，进行唯一原生前瞻；检查覆盖不了功能时明确保留诊断边界，不强套编译成功。根据实际反馈/问题再看合法来源和独立案例是否足以进入研究，不写成功/失败来凑一对，不重试旧题。
