# 正式 Runtime 子入口声明闭包

基线9f12f2e。实际发布清单消费者只从@tianwen/runtime-bundle/runtime导入apply，TS7016/退出2、无TS2307；原包根工厂声明正常，子入口无types导出/声明文件清单。工作区tsc生成runtime.d.ts引用私有相邻模块，不可直接加清单。

选用已在根入口使用的dts-bundle-generator，对原src/runtime.ts生成独立runtime.d.ts，按现有@tianwen/runtime内联策略合并工作区类型。manifest的./runtime增加types条件且files发布该文件。保留实际JS入口、配置/返回接口、全部既有导出及现有Node/DSH peer版本。手写apply声明会丢配置和行为类型；全量发布源码/所有dist声明会扩大私有API及依赖，因此不采用。不新增生成平台或依赖。

沿原runtime-bundle.spec消费者的发布清单文件访问限制，加入实际apply/config/三个公开工厂兼容，以及非法检查结果/配置负例；不能借未发布声明通过。检查严格类型，实际只发布清单的独立consumer需无@tianwen工作区依赖；外部类型仅来自现有声明的DSH peer及Node。仅声明/manifest/build脚本变化应保持index.js/runtime.js字节身份，必要时同源码完整build核对，不启动模型/Docker或重跑旧题。

原正式Profile不挂载、完整账本不改、main/Daily NO-GO/隔离/原门槛和十工作日窗口不变。复用D盘工具/依赖/工作树。运行证据D:/DevData/tianwen-runtime-public-types-20261003，小消费者/日志/hash保留；临时打包材料完成后移除，不复制依赖或Runtime。D≥15GiB、prefer20GiB。
