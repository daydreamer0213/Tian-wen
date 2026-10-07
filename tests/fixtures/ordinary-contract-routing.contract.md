# 持续开发环境的普通任务合同分派

当前开发宿主只能配置一份普通任务合同，连续任务只能另写分派。请新增纯模块 `scripts/development-ordinary-task-check.mjs`，导出 `createDevelopmentOrdinaryTaskCheck(configOrArray, createCheck)`。

`configOrArray` 是一份普通合同对象，或至少一份合同的数组；每份包含非空字符串 cwd 和 requestText，其余字段交原工厂验证。数组的 cwd 必须完全相同，requestText 必须不同且非空（空白不合格，但合法文本不要 trim）。createCheck 必须是函数。构造时深拷贝全部合同，再各调用 createCheck 一次；createCheck 返回对象必须有 prepare 函数。调用方之后修改原合同、嵌套字段或数组，不得影响已冻结配置或选择。不要修改调用方对象，不要预先准备/执行检查，不建新检查器或注册服务。

返回一个具有 async prepare(material) 的检查对象。按原公共工厂文本规则投影 material.request：所有消息的 content 文本块（type===text）依序取 text，换行拼接；不使用 objective/context/非文本块匹配，不 trim、不忽略大小写、不模糊匹配。material.request 不为数组、消息/content 结构无效或 text 块 text 不是字符串，返回 undefined，不派发。完整文本只准确匹配一份原 requestText；未知则 undefined，不尝试任何其他合同。匹配时原 prepare 收到完全同一个 material，其返回值保持同一对象，其异常/拒绝原样向上抛出（包括取消）；不要改 signal、task、请求、metadata 或结果。合同/工厂格式无效时构造立即抛 TypeError；原工厂自身异常原样传播。

模块只能使用 Node 标准能力，无文件读写/SDK依赖。仅新增该输出；本合同和入口只读。独立入口注入记录型原工厂核接口和冻结，实际 SDK 接入由控制端另行执行。检查通过不代表模型完成自动学习。
