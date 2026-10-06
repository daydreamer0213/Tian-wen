# Task35：0.1.25 候选版本与受管升级

承接已实际关闭的 Task31–33 和 Task34 的 80/80。用户已授权持续完成目标；不再开语义面板，不等待自然失败，不改历史结果。当前基线 1dfef668，Daily Runtime 0.1.24 / Desktop preview.25 保持原样。

交付范围：Runtime 0.1.25 / Desktop preview.26 的精确版本身份；受管 Profile 使用现有 native 首审描述符；旧 0.1.24 使用原冻结 patch 与收据接受升级。原历史模板、精确损坏拒绝、consent、quarantine、原研究与效果标准保持。

- [x] 先记录旧版本识别及受管首审接线的失败测试。
- [x] 同时更新候选版本、发布路径、受管当前模板；显式接受旧 0.1.24，不替换旧 0.1.23 支持。
- [x] 覆盖原升级/损坏拒绝/数据保护测试，原 DSH composition 受管首审接线测试；实际构建、类型与公开导入检查。
- [ ] 独立只读复核，提交准确版本；原 CI、候选包与安装验证后形成原门槛发布结论。

ROOT owns production/tests/plan/operators；复用既有只读 reviewer，不新建 agent。运行物 D:/DevData/tianwen-025-release-controller-20261007。复用依赖，D 空间低于 15GiB 前停止新增大生成物并整理可再生占用；不绕过已被自动审批拒绝的清理。

原CI缺口也已修复：英文/中文icacls严格汇总兼容及root dev workspace漏声明。三次只读审查PASS，完整Python v2及准确CI/交付仍待实际结果，goal不提前结束。
