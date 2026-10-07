# 标准宿主执行器的普通 Node 接入修复

基线121e2b2；上轮可信合同 Loader 交付属于实际进展。本轮继续使用原工作区、公开 Runtime、原宿主及持续 Profile，不新增模型样本或学习规则。

## 发现和交付

普通 Node22.23.1 导入 `scripts/development-native-task.mjs` 失败，原因是取消 helper 从 source `conversation-external-check.ts` 导入，连带加载 Node 原生类型擦除不支持的 parameter property。公开 Runtime 现在仅再导出原 `withConversationObservationCancellation`；执行器改从现有 `dist/runtime.js` 读取它。没有复制取消实现、改变停止/排空/归档次序或放宽信号。

第一次完整回归又暴露 `development-prepared-task-gate.mjs` 指向 Evolution/src 下不存在的 `.js` 文件。仅将原5函数改为同包公开 `dist/index.js` 导入，判断逻辑未变；执行器的 `SessionId`/`createUserMessage` 改从原 `dsh-compat/runtime` 读取，不再经根入口加载 testkit。

之前拟迁移请求观察器；进一步实测 `native-task-request-observer.ts` 只有可擦除类型语法，当前普通 Node 可导入，迁移并非必要，故没有制造额外自然任务。此处只证明当前既有 Node22.23.1，不宣称所有早期Node22版本支持源 `.ts`。

## 验证与首错误保持

证据目录：`D:/DevData/tianwen-standard-native-execution-20261004`。

- 初次新测试使用 `.spec.mjs`，不在原 Vitest include 内：0测试/exit1，保存 `import-red.json`，不能算红。
- 改为原配置支持的 `.spec.ts`，`import-red-matched.json` 1失败，确为上述源类型语法错误。
- 公开取消接口后 `related.json` 35项中34通过/1失败，确为gate源扩展名不存在；原日志保留，不把这轮叫绿色。
- `related-green.json` 最终92项通过/0失败：原执行器28、准备门57、Loader6、普通子Node导入与取消1。
- 独立复查指出最初“中途取消”测试在微任务启动前就abort；已改为等待回调的started并断言进入一次后才abort。复查关闭该P2，导入及原语义无有据P1/P2。
- 原五项目依赖图、Runtime及两公开声明构建exit0；声明确有原取消函数。新Runtime SHA256 `2a22598b1eebb07d911addf3d6c33750bcf5022d715ce00e32625fa3131c60d4`。

普通 Node 新进程实际用原 Loader/真实提供方配置/原生文件注册加载同一持续 Profile，再调用原执行器的只读 `inspectDevelopmentNativeTaskArchive`。不是只看模块有一个函数名：真实原第六Task归档的session/files/complete均匹配，缺失/修改/新增为空；程序仍unverifiable、双审仍inconclusive。输出 `native-archive-consumption.json`，没有调用程序结果检查或重评。

六原Task精确读取，原同意revision1/enabledtrue，反馈/研究0；正式与持续两个账本在挂载、读取及原Context dispose后摘要相同。模型请求0、新Task0、新功能evaluate0。`cold-loader-cleanup.json`确认自有Context已释放。这证明普通 Node 的标准装配和原归档接口消费，不证明新正式任务、完整交互权限、研究/采用/未来效果；没有冷载工程合同补判历史。

## 下一项由执行者承担

补标准 Loader 的一次性任务启动入口：读取操作者事前固定的任务数据，直接委托既有 `runDevelopmentNativeTask`，完整复用准备门、文件权限、单次尝试标记、取消与归档，不重建Agent/调度/存储/研究裁决。当前已经能导入原执行器，不再依赖临时测试装配来绕过源加载问题。

该入口要把原Loader合同与实际任务的cwd/要求/输出及参考声明衔接起来；必须待原服务就绪，拒绝旧会话/旧归档、错误摘要和可写工作区内的操作者配置，不自动给予新同意。停止使用当前工程包和旧输出当新自然任务。真正开发工作的要求及独立预期要在未知答案前冻结，第一次结果保留；来源不足不推给用户补题或催旧稿评价。

当前来源仍1合格问题/1不兼容完整成功，报告三次程序成功原双审未定，反馈/自然研究0。研究、语义安全、自动采用、后续收益和回滚分别核；原两问题及兼容成功资格、原五案例十臂、发布条件和十工作日窗口不变。完整目标active/incomplete，main/Daily完整自动学习NO-GO；本接缝不是目标完成。

控制包约56KiB，无新的完整环境副本，测试自有临时根按既有清理释放；本轮没有尝试删除原71拒删路径、没有新拒删事件。Docker未启动，D最终17.916GiB>=15；资源见 `final-audit.json`。
