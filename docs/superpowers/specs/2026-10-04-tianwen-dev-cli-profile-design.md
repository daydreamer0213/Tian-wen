# DEV 使用原 CLI Profile 目录

基线 a1f94719。所有者已授权自主持续推进；本次不改变完整目标、自然任务资格、同意、原双审、方法裁决、main/Daily NO-GO、原十工作日窗口或旧记录。沿 brainstorming 与证据驱动检查，方案和实现由执行者承担，不重复索取审批。

固定 DSH 0.1.1-rc.2 的原 `resolveProfileDir` 只支持 `$DSH_HOME/profiles/<name>`，无绝对目录/层级覆盖选项；root Loader 的实际 baseUrl 就是该 Profile。原 DEV 的直接子目录限制是隔离实现选择，不是方法资格条件；它使原 CLI 正常入口与 DEV 接口不能组合。上一轮嵌套 Loader 的失败保留，不再重试这种装配。

选择认可两种真实目录：原 `D:/DevData/tianwen-development-runtime/<root>`；原命令行布局 `D:/DevData/tianwen-development-runtime/<dedicated-home>/profiles/<profile>`。后者 home 与 profiles 与 profile 必须是 canonical 真实目录，profile不能为上游模块回退目录node_modules，仍须与实际 ctx.baseUrl 同一目录。state/sessions/evolution 仍只从此 profile 派生，JSONL现有实际后端和物理locate仍核验，错根/链接/正式目录/多余嵌套均拒绝，失败在Runtime挂载或写账本之前。

公开只读 `resolveDevelopmentRuntimeRoot(unknown): string` 由Runtime负责，原 `developmentRuntimeConfig` 和已交付原生合同插件复用；不复制目录判断。普通apply仍隔离true，不接收false。公开函数只验证目录，不准备环境、读取合同、写同意或启用方法。原CLI及其Profile发现/信号/5秒强退不再改；不用symlink把Profile伪装成开发根，不另造宿主或配置平台。

替代继续嵌套 Loader 与改 Context 身份已经被实际失败否定；给原 CLI 加任意Profile路径会扩大通用上游责任且无必要。选择兼容它已有布局，同时保持专用开发数据树与固定存储边界。

证明：源与实际发布函数分别验证合法两种布局/外部与错误层级/重定向；合法原Loader消费合同配置且0请求；原实际CLI新专用home载原公开DEV插件、原JSONL和基础服务，固定只读probe退出，确认Runtime已挂载、0任务/研究/自动同意、两原业务账本不变。此控制只验证工程接入，不是自然任务或学习效果。首失败留存。后续真实开发任务由原入口唯一首次执行，要求和独立依据先冻结，不重复关闭控制。

生成物D，复用原依赖，D≥15GiB、不全量拷贝环境、不触及71拒删根。验证结束清理本轮精确自有临时home，保留小收据与必要归档；Docker只在任务原准备确实需要时启动。
