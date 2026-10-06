# Runtime 0.1.25 候选交付实现（Task35，2026-10-07）

普通自动学习的原正式研究、native 首审许可、方法启用、两个后续效果和撤权/cold 已由 Task31 实际关闭；Task33 首次真实同 child 引文纠正已实际关闭。此轮收口发布接线，不重开模型研究、不改旧票、不增加自然等待。

## 候选版本与旧版兼容

Runtime 0.1.25 / Desktop preview.26 的 manifest、归档、预检、构建、打包、CI 和开发命令引用一起更新。README 日常已安装信息仍为 Runtime 0.1.24 / preview.25。受管当前 Profile 使用已有 `guidanceIndependentReview` native 描述符；旧 0.1.11–0.1.24 的 YAML 模板正文冻结，新增精确 0.1.24 原收据/原旧 patch/原归档校验，所有更旧版本和损坏拒绝保留。Desktop 旧版本列表追加 .24，两语说明保留 .23，未知 .26 拒绝。

原 DSH compose/interpolate 的公开 bundle/repository/managed Profile 路由都进入已有首审器。此处 SDK 使用明确脚本，是接线证明；真实模型的学习效果仍引用 Task31/33，不能把脚本计作新真实效果。分析同意及全局 quarantine 不变。

## 原发布检查与首次失败

- 三项针对性 RED 全部实际失败：当前受管缺描述符、.24 安装器旧版拒绝、Desktop 旧版拒绝。修正后 GREEN 3/3。
- 原五套安装/Desktop 首次 294/295：唯一失败是一个分类 case 累计构建十五个旧版本 fixture，超过原 20 秒限制。把原循环拆成逐版本 case，原断言/旧版范围/20 秒不变；专项 16/16，完整五套 v2 **310/310，退出 0**。
- 候选实际原 TypeScript 图及 Runtime 16 步构建退出 0，11 元数据记录输入/输出；公共 runtime.js 摘要仍为 `41ee9180eb7e2912e97f116eee09b88a42133633110827c809725e7f044065ae`。先核 639 生成文件独立文件身份，避免写穿已安装包。构建收据真实注明源码尚未提交，未冒充 clean HEAD 构建。
- 原完整运行包 **81/81**（含新增 managed-profile）及公开反馈 **4/4**。同一聚合首审 suite 初次因根目录漏声明 `@tianwen/evolution` 未加载；增 root dev workspace 声明，仅更新 lock 根 importer，本地仅补项目内已存在包链接，0 下载、0 SDK 安装。默认解析独立首审 **25/25**，原 frozen/offline/lock-only 退出 0；所有 lock packages/snapshots 与基线逐字不变。
- 原八包直接类型图及 Runtime noEmit、公开导入检查退出 0。原 typecheck 包装命令两次因 pnpm 11 本地依赖同步欲重装而无 TTY 拒绝，未安装；不用失败包装收据冒充通过，直接原同八项目 TypeScript 图记录单独通过。云端准确 CI 仍待运行。
- 原完整 Python 首次 **604 通过 / 6 失败 / 4 跳过**，六项同因：hidden 后台在中文 Windows 的 icacls 汇总为中文，旧 parser 只认英文。诊断在同后台保存精确输出，仅权限汇总行不同。原隔离攻击测试新增中英参数，RED 英文通过/中文失败；parser 只增严格全匹配中文汇总，拒绝未知 principal/继承/DENY/未知输出规则保留，不完整中文也拒绝，GREEN **2/2**。原脚本 4 处 ruff 问题修正，最后 ruff 退出 0。完整 Python v2 正在核验，不能提前宣称全绿。

独立设计/最终版本接线审查 PASS；上述两个 CI 缺口另作只读复核。运行物位于 `D:/DevData/tianwen-025-release-controller-20261007`，保留首次日志与修复后收据。运行包已实际 pack；Desktop 已 stage 当前正确包，尚不声称已完成成品、CI 或安装。

## 交付边界

Goal active，main/Daily 暂 NO-GO，日常两 Profile 和桌面程序未更新。下一步是原 CI、准确候选成品/安装和数据保护后发布结论，不能把此轮结束作为完整目标完成。D 剩余仍高于 15GiB；复用依赖、不全环境复制。此前 scratch 删除自动审批 `blocked by policy`，未执行、未绕过，不能声称全部清理完成。
