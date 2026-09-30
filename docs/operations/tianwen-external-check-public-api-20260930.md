# 外部检查公开接入类型：有限交付

基线3518f62中检查接口只有内部源码位置，发布清单未包含独立的内部声明模块。宿主不能依赖工作区路径来实现新接线。现在包根@tianwen/runtime-bundle提供四个type-only出口：ConversationExternalCodePreparation、ConversationExternalCodeCandidate、PreparedConversationExternalCodeCheck、ConversationExternalCodeCheck；仍使用现有index.d.ts，不增加子路径或公开私有运行类。

声明生成时，新出口使已有conversation-judgment进入检查范围，暴露15项缺少DSH子任务类型扩充的诊断。该模块实际使用Context.subagents及subagent/descriptor，却依赖整个项目中其他文件带入扩充。已增加对官方dsh-subagent的空类型引用，声明生成恢复通过；引用在JavaScript中消除，不新增运行注册。

## 验证与失败

新增消费者以包根下的虚拟.mts和NodeNext self-reference解析真实exports['.'].types，不设置源码别名；只允许访问该包manifest.files、package.json及依赖目录，本包未发布的内部文件不可撑过检查。合法宿主实现通过；非法met结果和私有运行类导入仍类型失败。依赖声明仅引用既有dsh-goal/llm/session/skill，不增加未声明的工作区类型依赖。

首次测试因Windows虚拟路径比较错误出现6053，修正后明确2305缺公开出口。实现后第一组2通过/1失败，私有类不存在实际返回带近似名称提示的2724，原断言过窄；改成接受2305/2724且错误须指向私有类名。失败均保留，未用类型强转或跳过消费者检查求通过。

八包类型/构建退出0；随后重新生成打包声明退出0，再按原构建命令只刷新根index.js。普通tsc会覆盖打包声明，所以最终检查放在声明打包之后。公开消费者及两项既有包根依赖边界检查最终 **3/3**、70项不相关测试未选；没有声称全套包测试已跑。根JavaScript不包含新检查模块，git diff --check通过。独立只读复核无重要可操作问题，审查者没有运行测试或构建；最终新增消息断言由控制端再取得3/3。

证据目录D:/DevData/tianwen-external-check-public-api-20260930；red.json、red-public-api.json、declarations-first-failure.json及green.json保留失败，final-tests-with-message.json、type-build.json、declarations-final-build.json、verification.json记录最终结果，finish.json记录DEV提交与空间。声明生成器已有composite项目警告，构建仍实际退出0。

## 完整目标与下一入口

本项使可信宿主检查可以使用正常包类型入口，**没有安装具体可信生产适配器、运行新真实任务、生成反馈/研究或提供自动学习效果**。上一轮119项机制证据继承，不重复跑旧样本。本项不是完整阶段B覆盖证明，C—F仍缺原要求所需证据。

目标保持active，main/Daily完整学习NO-GO、新激活隔离、原发布要求及十工作日窗口不变。下一入口仍是新的实际未完成待办及候选之外的适用检查；本轮不复制已完成的类型修复题、合成反馈或用公开API通过取代真实前瞻结果。

无落盘消费者副本、Profile、安装或新增依赖；生成报告约119KiB，声明32KiB，复用原工作区。D核对20,033,769,472字节（约18.66GiB），满足15GiB底线，20GiB目标尚未达到。没有重试此前被拒绝的旧残留删除，不声称旧数据已全清。
