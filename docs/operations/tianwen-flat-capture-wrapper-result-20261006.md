# 单个包装误提交的准确捕获诊断

## 已完成工程修复

依据原实际 study0f5527eb grounding Session1ad3644d：两次JSON语法错误之后，模型反复提交仅有arguments字段的包装对象，原SDK提示value.arguments未声明，模型误把错误路径当成要求的外壳；44实际请求后原invalid-judgment停止，零激活。原记录不修改、不重判或重跑消费对。

在原匹配子Session、structured_output捕获门中，仅原公共JSON Schema校验明确确认单arguments/value根字段未声明时，提示直接提交原顶层字段、不要外壳或序列化内层。只给准确诊断，不解析内层、不解包、不代改答案、schema、instruction、判定、证据或恢复逻辑。合法声明/开放结构及其他格式错误保持原SDK行为。

证据根 `D:/DevData/tianwen-flat-capture-wrapper-engineering-20261006`：

- 实际RED六失败/五通过/47过滤；目标GREEN十一通过/47过滤。六个缺准确诊断的原实现断言失败，合法格式原来就通过。
- 四个完整源码套件171/171、同四打包套件171/171，无失败/跳过。包括原same-child修正、一次成功捕获、未修零proof/失败、零调用恢复，以及合法声明/open/union/其他invalid误报边界。
- 原Runtime十五构建命令全部0；私有导入零违规、差异空白检查0。限定两生产/测试文件复查无P1/P2。公用校验原支持properties/required/boolean additionalProperties和嵌套exact-one，未添加不支持的patternProperties或root oneOf。
- 自有SDK临时目录已清。D约16.72GiB，无安装/依赖/环境/全量旧账本复制。

## 接续原生研究

操作器作者同根 `author-continuation.mjs` 已限定只读复查无P1/P2。新根 `D:/DevData/tianwen-flat-capture-learning-20261006`，新nonce、原config/policy。原七Task/两study/两attempt/账本前缀及共享9/8/9/原字节保护；优先原Loop剩余未尝试组合，无原accepted active方法才执行从未执行的桥单source2。保留147文件旧实际终态审计，不复用消费对、不重跑旧Task。

受控未来before使用上一实际两独立评审的原not-met proof，原native恢复验证但零新增评分调用，且不入学习来源。只有实际原接受/启用才运行普通未来/新任务/受控after：unknown→met与met→met单列，不称自然模型改善；模拟before/真实after只证明这项明确故障被解决。接着原撤回/无注入/零调用冷恢复和终态审计。实际结果追加；工程通过不能当模型学习效果完成。

完整目标active，main/Daily NO-GO/R9及原两DEV/默认语义保持，不新增正式发布条件、不询问用户出题或等待自然重复。
