# Python 文件学习批与文件交付识别修复

## 本次结论

两个事前无方法任务和正常对照已完成，功能分别 verified；第一基线独立复核 met，第二基线及正常对照 inconclusive。研究尚未启动，自动激活、方法后改善和撤回仍未完成，完整目标 active。保留 main/Daily NO-GO、R9 和原正式发布条件，不要求自然失败或索取用户任务。

原普通入口实跑 r2 36 次真实模型请求、4 次显式历史 Worker 注入；r3 2 次真实请求、0 注入。38 个真实请求的完整原始请求轨迹分别保存，模拟不称自然模型错误。两批均原 CLI exit 1、原句柄排空，首结果保存，不重新回答/评价已有基线或旧来源。

## 首停止与实际修复

- 原首批零模型准备停止：原文件工具来源不可核对。按既有原生启动方式禁用 stock tools/fs-sandbox，显式挂载原 observed tools、原 fs-local/file tools，并等待原文件插件初始化；零调用来源核对通过。只改本批操作员环境，未改 SDK 或产品权限。
- r2 第一历史 Worker 注入在操作员早注册的 llm/stream 返回，绕过原 model observation、外部检查准备和 DEV 请求核对。原第一训练 Task completed，但无功能结果，root gate forwarded 0；它不是合格训练失败。已有四 Task、原输出及首结论保存。
- 独立零真实模型控制把注入放到原 agent/created 后的末端监听，确认原准备和请求核对先执行：原 Task completed、四 root 请求均经核对、原固定配置观察去重为一条、原功能检查 rejected。入题和四 root 响应显式 scripted，语义评审刻意不可用。控制第一次未绑定局部 envelope、第二次末尾误断言配置记录数 4，原 CLI 1 和首日志保留；第二次的原功能与请求核对结果真实有效，外部审计不重跑/补判。
- r3 复用两旧基线，研究对照事前绑定原 picker 实际选择的第一成功基线；原后置对照 inconclusive 不重判。首次零调用配置遗漏完整 file entries，原预检失败保留；纠正为该基线的完整原冻结定义、重新冻结后零调用预检成功。
- r3 原模型 admission 实际把“修改并交付 .py 文件”判为 code/local-files/chat。原 DEV 核对正确阻止首 root 分派，Task failed、无文件交付、无功能准备，研究 0。这是文件输出识别缺口，未计作学习失败。

产品窄修复复用原独立 admission recheck：只对带原文件提示的 code/local-files/chat 请求再检查交付方式，只有独立判断明确 local-files/files 才替换 decision 和原生 proof。只读代码聊天、不可用或其他结果保留首判断；无新增工具权限、无直接改判、无旧 Task 重评。

## 验证

新增三项控制先 RED（文件交付仍 chat、缺复核请求），修复后源码完整 observer 48 通过。四项旧文本引用 fixture 在 HEAD 原 observer 副本同样失败，原因是现有预捕获引用校验先拒绝工具结果，而旧 fixture 未给后续终止响应；补齐显式无有效判断的终止，核对原诊断第 1/6 项及真实请求数，仍要求 invalid-judgment/proof=null、不泄露错误引用、冷恢复不追加请求。生产引用校验未改。

原 Runtime package 全部 15 实际构建步骤退出 0，无安装；发布 observer 48 通过。首次完整发布 profile 未设置既有 TIANWEN_GOAL_ACCEPTANCE_PUBLISHED，三个跨打包类 spy 控制失败，首日志保留；原源码三个故障控制单独通过，正确原发布模式最终 profile 50 通过/10 原条件跳过。两项既有源码故障控制在发布模式提前返回，不称其发布执行成功。最终只读复查无有据 P1/P2，也未发现修改测试掩盖生产缺陷。

## 保留与后续

两实际批修改代码前各核对 39 冻结消费者、三旧账本、原环境输入、原 profile 前缀及 84 原 Docker 容器身份；旧任务、无方法基线和首停止保持。Docker 已停止。两权威文档及本修复作为下一新批消费者重新冻结，旧批不补判。

自动审批拒绝删除两套已退出临时控制 home，仅给出 blocked by policy；操作未执行，不改路径绕过。两目录合计 395,338 bytes，保留拒绝记录，不阻塞开发；未复制依赖或大环境，D 约 16.96 GiB，满足 >=15，20 GiB 偏好尚未达到。

下一只执行新的两显式历史训练 Task，复用已有两未来基线和原成功反例，原生研究/候选/裁决保持。真实接受则自动启用、同冻结前像的新后续 Task 对比、撤回；无改善或新首失败如实保留并继续修复，不靠重复旧样本凑提升。

证据：`D:/DevData/tianwen-python-native-learning-r2-20261005/final-audit.json`、`D:/DevData/tianwen-python-native-learning-r3-20261005/final-audit.json`、`D:/DevData/tianwen-python-native-hook-control-20261005-r2/hook-control-audit.json`；构建/源码/发布/profile 首失败与最终日志均在 r3 根。控制清理拒绝：`control-storage-cleanup.json`。
