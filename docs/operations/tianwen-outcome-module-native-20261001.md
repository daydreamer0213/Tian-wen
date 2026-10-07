# 自主新开发任务失败与事实工具曝光修复

## 当前结论

535ad72 冻结一个不同于旧样本的真实待办：outcome-learning-intake.ts 单独 strict 唯一 TS2551，已有同目录服务声明未自导入。天问原生 read/edit/read 后额外调用本任务禁止的 tianwen_captured_file_facts；执行guard拒绝，完整文件证据 unavailable。原任务 completed 仅表示根结束，原review **inconclusive/file-evidence-unavailable**、独立结果 **unverifiable**，不是成功对照或学习来源；候选没有采用，原文件精确恢复为 SHA256 2ec077e26ef2a00e22fb50453bd4f4e88bfe1b9db69831c4b4e1833ba455bbce。原 TS2551 待办尚未修复。

随后按322f8b6冻结的最小设计补充宿主 `exposeCapturedFileFacts:false`：仅不安装天问自有初始文件统计工具，不改变捕获/结果验证/被禁调用拒收。默认及true仍有此工具。该修复已完成机制及正式宿主预检，尚未用另一新自然任务证明实际效果。完整目标active、main/Daily NO-GO、新激活隔离、C—F剩余证据及原十工作日窗口不变。

## 一次真实任务与停止

持续Profile：D:/DevData/tianwen-development-learning-20261001；小运行根：D:/DevData/tianwen-outcome-module-native-20261001。原要求、原文件、编译选项、驱动、检查合同及源文件摘要在候选前固定。合同复用现有 frozen TypeScript checker，并要求唯一正确纯类型导入、实际解析到冻结声明、原非空行含注释不变、转译JS不变；不是单纯额外root编译通过。

compiler-only 对“未导入原文”假通过的合成首红保留；有限薄合同13/13、迟到写恢复顺序反例检查通过。独立驱动审查发现超时恢复早于异步工具排空，正式尝试前修正为先dispose/等idle，再存稳定输出、失败写回前像并核对hash。实际pre-answer检查先于根转发，绑定实际模型配置，无候选执行。

一次新原生尝试实际5请求（准入1、根4）、工具4、重试0，原8根/12工具/32总/720秒预算未变。工具序列：read、edit、read（均成功）、文件统计（拒绝）。候选仅新增 `import type {} from './learning-consent-agent.js'`；本轮不对失败候选补检查、修答案、重新采用或重跑求绿。任务id conversation-task:24ebf4e3f6f7c0b3552469f2dadc5bd6b4008f87572a13836a032888c693ab8f。保留 task-result.json、原生gzip、候选、失败审计、准备合同和恢复收据；没有反馈评估、研究或激活。

同Profile冷读0模型，原task与不完整材料精确一致、账本raw不变。进一步核对：尝试确实追加新任务，原账本dc3f3773e4d964a15d08949f2181adc450b674fbeef50f6994c6c61b1ae6015a仍是完整字节前缀。failure-audit.json 的 ledgerNotModified 原命名只指调查未写账本，容易误读为运行未追加；failure-audit-correction.json 已明确纠正，未修改原生task或账本。

## 实际产品缺口与修复范围

已安装 DSH 公开 `tools.restrict({allow:['read','write','edit']})` 只过滤继承工具，Agent自己层保留自身工具，以保障回答等能力。这是上游既有设计。天问文件统计工具在agent/created注册到Agent自己层，因此即使执行guard禁止，它仍被展示。复用上游restrict，天问仅对自己拥有的工具增加显式宿主关闭入口；不修改上游、不建设通用权限系统、不自动推断用户自然语言权限。

false 对新Agent和服务启动前已存在Agent均不安装工具；仍捕获原文件、最终文件和独立结果。需要文件统计的普通宿主继续默认。宿主负责后续启动使用同一配置；原持久记录不回填。此开关不会移除原有学习同意/状态/继续处理控制工具。

验证：三条曝光用例默认/true过、false先红，加捕获用例首红，合计首红2失败/2通过；已有Agent首红1失败。实施后新5/5；完整 file-observer、file-ancillary-runtime、file-ancillary 三组 **132/132**、八包类型/声明退出0；两修改产品文件及完整修改测试联合strict，322f8b6原0/现0。独立只读审查未见重要问题。

正式bundle预检第一次漏装已有subagents/spawn，observer pending，0模型；恢复既有依赖后，第二次事实工具已消失，但“整个正式宿主仅三工具”的预期不成立：仍有学习同意、状态、继续处理三个自身控制工具。未扩大产品开关去移除它们，也未修改原自然任务标准。窄化预检描述后确认准确六项表面（3文件+3控制），第三次退出0，原失败task/账本不变、隔离true、模型0。三次预检日志分别保留；不能把直接observer受限测试的三工具结果泛化为整个正式bundle。

## 存储与下一入口

本轮运行记录约163KB，持续Profile约444KB，自有夹具残余0；未复制整套环境/依赖/旧运行目录，D约18.58GiB，满足15GiB底线，尚未达20GiB目标。原旧目录/删除拒绝边界保持。

后续新有限任务在启动前显式关闭不适用的文件统计并使用原生restrict，保留路径/预算执行guard；学习控制工具仍属另一自有能力面，不承诺整机只有三工具。先选不同的实际未完成待办、事前原要求和适用独立合同，再作一次前瞻尝试；不重做本失败任务凑来源。真实反馈、独立研究案例、十臂结果、采用与后续真实效果仍分别缺证，本轮不抬门槛、不新增完整目标的发布条件。
