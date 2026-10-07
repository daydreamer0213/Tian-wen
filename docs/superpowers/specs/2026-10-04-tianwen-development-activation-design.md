# 原DEV受治理启用入口设计

2026-10-04接入修订：实际原CLI固定使用`<home>/profiles/<profile>`，原直接子目录限制使这条正常入口不可组合。保留原直接根，并增加专用`D:/DevData/tianwen-development-runtime/<home>/profiles/<profile>`精确布局，逐层真实canonical、同baseUrl和原派生存储/实际JSONL检查保持；见[当前接入设计](2026-10-04-tianwen-dev-cli-profile-design.md)。这是开发宿主隔离目录实现的修正，不是修改学习/发布资格，也不回写历史。下文直接子目录措辞记录原实施时的选择。

基线f120b80，沿原三项收口第三项。使用brainstorming/当前原代码分析；所有者已授权持续自主实现、不重复审批。普通Runtime仍默认新启用隔离true，main/Daily NO-GO、原发布门槛/同意/停止/十工作日窗口保持。

已核实原Ledger及GuidanceLoop已有accepted/shared evaluation receipt、原来源支持/输入独立/质量合同/当前同意/父版本/结果检查及冷恢复校验；公开Runtime将两处策略固定true，实际DEV不能配置原受治理启用。此前隔离Ledger手动控制没有证明原Loop自动启用。原语义独立性仍unestablished，不能因此宣布自然收益。

选择显式applyDevelopment，复用原apply安装链，不复制Runtime/研究服务。普通apply调用相同内部安装链但固定quarantine=true，不接受未声明的false覆盖。applyDevelopment仅可信宿主程序调用，不是模型工具、默认Profile补丁或安装选项。为当前Windows DEV宿主限定D:/DevData/tianwen-development-runtime的直接子目录；原state/sessions/evolution均派生该root的固定子目录，ctx.baseUrl须为同一root，显式路径若提供必须一致。检查已存在路径真实目录身份并拒绝重定向，随后只在该独立目录准备固定空目录，不复制旧Profile/历史记录。正式持续DEV的tianwen-development-learning-20261001、Daily及其他路径不能由此入口启用。根限制是本次开发宿主隔离边界，不是新增方法资格门槛。

内部安装链将相同activation quarantine策略交原Core/Ledger和原GuidanceLoop。DEV可运行原自动启用；没有accepted或必需结果条件、同意/支持/父版本失效时原规则仍拒绝。入口不写启用事件、不造裁决、不把提供当采用。回滚和恢复沿原owner；普通apply的旧行为保持。原方法语义安全/自然效果仍需原前瞻证明，本功能不解除正式发布条件。

替代把false加普通配置会扩大默认入口与Profile误用面，拒绝；另建启用服务/人工批准文件会重复原Ledger治理，拒绝。当前方案仅复用安装链并加专用宿主边界，独立根不使用魔法文件或新注册表。

验证：公开入口缺失首红、源接口与发行声明可用；源Runtime实际Ledger+Loop同策略；普通非法flag保持true；跨根/不一致/baseURL/链接拒绝且无挂载。原发行SDK一条明确脚本研究accepted→原Loop自动activation（无手写Ledger启用）→下一Goal原版本提供→原退化自动回滚→冷恢复0请求；与普通Runtime对照保持隔离。复用已有原门槛负向测试，不新加自然样本或强行给控制自然资格。D>=15GiB，无依赖/镜像下载或大副本。

实施复核：原Cordis已拒同scope重复Evolution，新增fresh Context检查只使失败发生于安装前，不声称原来会静默复用。实际JSONL错根/构造后修改config.root两项首红后，DEV入口核现有公开JSONL类型、配置及无副作用locate路径；原Core安装前拒错根，普通入口不受此后端限制。未创建或persist探测Session。
