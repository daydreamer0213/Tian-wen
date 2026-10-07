# Runtime 子入口公开声明交付

基线9f12f2e；设计与执行计划fa488fa。实际发行包的`/runtime`此前只有JavaScript，消费者报TS7016；本轮补types导出、发布文件和现有声明生成流程，没有修改业务源码、依赖版本或学习规则。

## 已完成的验证

- 发布清单消费者首红TS7016，修复后严格通过。当前`skipLibCheck=false`，显式使用Node宿主类型；普通/单研究/cohort三个公开工厂可以接入原`TianwenRuntimeBundleConfig`和`apply`。
- 声明仅转发原上游类型。声明构建先保留原子任务Context依赖，再用薄声明适配器对齐既有JavaScript窄compat/runtime入口；生成物不再带入未声明的agent-loop或cordis-host-runner测试依赖，没有私有相邻模块或`@tianwen`工作区导入。
- 独立审查发现Context服务扩展遗漏P2；新增消费者真实复现两项TS2339。现有生成工具的`--inline-declare-externals`保留原声明图中的Context/Events与真实服务类型；原evolution/evidence/learningLoop访问及公开执行器回调通过，复审P2关闭，无新P1/P2。没有手写简化接口或以any代替配置。
- 独立消费者只复制清单中的index/runtime四个相关公开文件，依赖只连接既有声明peer和Node类型。真实裸包TypeScript消费在strict、exactOptionalPropertyTypes、noUncheckedIndexedAccess及完整声明检查下零诊断、零工作区packages文件；两种非法配置各产生原TS2322，裸包JavaScript公开入口导入通过。
- 现有八包类型检查与实际完整Runtime构建退出0；两组75项相关机制回归通过，包括实际打包文件与声明依赖闭包检查。两运行入口JavaScript SHA与基线完全一致：index为`68828a47daf3c3737f7dea06f4eb0b256ce440fccea35bc85bef68b21b96e2cc`，runtime为`b045985a28571c85792efeaf4d6836d39cf3e7467867994120049c4b95251b35`。

## 首失败和归属

直接声明生成先报子任务Context键TS2344；声明适配器只保留原依赖。首次尝试照搬JavaScript窄入口缺原上游类型并越过rootDir，日志v4保留；现仅声明路径适配转发原类型，不改运行入口。首次完整声明消费者缺Node环境Disposable，经显式Node类型纠正；没有打开skipLibCheck。独立消费者首控制脚本从根解析undici-types失败，改从原Node类型包解析其依赖，首日志保留。

首次完整回归73/75：发布清单预期尚未增加runtime.d.ts，以及原输入白名单遗漏此前已进入同字节Runtime的两个真实业务模块。白名单只精确补已有7c77a04的conversation-file-review-units和02aabea的conversation-file-trial-evidence，不扩成任意源码；JavaScript身份不变，测试仍禁止测试宿主、私有DSH源码和工作区外部导入。更新精确发布预期后75/75。首日志与审查红证据未覆盖。

## 清理与准确边界

四个临时包文件逐一核对SHA后移除，31个依赖junction仅移除连接本身、未遍历共享目标；没有复制依赖、安装或启动Docker。运行根约59KB，仅留消费者、脚本、小回执和日志；D约18.89GiB（至少15，尚未达20偏好），Docker后端0。正式持续Profile未挂载，完整账本SHA仍`8a5fb4411926eeb533c41a5937f2e6cf2cc16afa24dec51eb8fe99a58de32408`，13task/0study/0反馈评估为继承快照。

本项0真实模型/自然任务反馈/正式研究/方法激活/未来效果，声明工程交付不能填这些证据。完整目标active/incomplete，main/Daily完整学习NO-GO、原同意/隔离/发布门槛及十工作日窗口保持，不要求所有者供题或评价。

## 下一实质步骤

实际正式Runtime在applyCore与guidance loop两处固定启用激活隔离（runtime.ts:490、509），独立功能通过不会自行解除；这解释了已完成受控研究仍没有正式激活，不能归因成模型研究从未跑通，也不能靠添加宽松开关宣称完成。

下一围绕既有完整学习环境推进剩余采用接缝：先核对原受控非隔离激活、方法实际送入后续请求及回滚测试的真实边界，选择尚未证明的发行宿主/独立结果组合；只对新条件设计验证，不重复已通过普通任务或旧研究。限定原任务有独立真值的代码环境分别记录候选功能、原要求保持、治理/未来使用与回滚；开放写作语义和自然收益另记。工程试验可独立做，不能将其当自然来源、解除正式隔离或改旧门槛。若发现真实实现缺陷先修复，不进行连续空账本审计。

证据根：`D:/DevData/tianwen-runtime-public-types-20261003`。包含before、consumer-red、runtime-declaration-v1至v6、context-red、完整build、八包types、independent-consumer-v2/v3、regression首失败及v2、consumer-result与final-verification。
