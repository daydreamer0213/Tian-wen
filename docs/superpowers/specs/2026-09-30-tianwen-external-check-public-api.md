# 外部检查能力的公开类型入口

基线3518f62的普通任务接线已完成，但包根只导出显式纠错协议接口；新检查接口在内部源码中，发布文件也没有该内部模块的独立公开出口。宿主实现可信检查时不能依赖工作区内部路径。

选择在既有包根追加四个type-only导出：ConversationExternalCodePreparation、ConversationExternalCodeCandidate、PreparedConversationExternalCodeCheck、ConversationExternalCodeCheck。复用现有index.d.ts打包，不新增子路径、运行时类出口、配置注册器或检查适配器。另建子路径需要发布额外文件及依赖声明链；让用户从源码导入则不适用于安装包，均不选。

正常故事：宿主仅从@tianwen/runtime-bundle导入这些类型，能按已有prepare/evaluate约束实现检查。反例：误用met作为检查状态应类型失败，私有状态类不能从包根导入。失败故事：声明产物未更新或导出被遗漏，真实包根消费者编译失败。仅导出类型不能在包根引入检查运行代码。

本项是实际接入缺口修复，不是新真实任务效果、可信生产适配器、反馈或学习证据。完整目标active，main/Daily NO-GO、隔离、原期限与门槛不变。生成记录仅D:/DevData/tianwen-external-check-public-api-20260930；复用现有声明生成器及依赖，不创建Profile或全量包副本，D>=15GiB、优先20GiB。
