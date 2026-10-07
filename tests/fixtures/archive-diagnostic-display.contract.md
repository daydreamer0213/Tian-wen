# 原归档状态显示具体诊断

真实待办：原DEV宿主已保存同一观察器/Task/session的具体文件观察失败，但现有纯formatDevelopmentNativeArchiveStatus只显示“无法核验”，用户看不到原因。本任务只实现原显示模块的可选诊断投影，不重跑任务或改变结果。控制端随后把原只读归档cleanup数据接入，不由本函数读取磁盘。

只修改 scripts/development-native-archive-status.mjs。三份参考只读：本合同、tests/fixtures/archive-diagnostic-display.entry.mjs、scripts/development-native-file-diagnostics.mjs。不能导入其他模块或执行I/O。保持原命名导出、前两个参数的原严格校验、原五字段结果及原错误行为。

增加可选第三参数options，形如 `{sessionId, fileObservationDiagnostics}`。省略或无合格诊断时，返回对象与旧版完全一致，不加空字段。原verification不complete、summary.taskId为null、options无非空字符串sessionId，均不显示诊断。

诊断为现有collector保存的 `{records, observedCount, truncated}`。必须至少1、最多16条记录；observedCount是>=记录数的安全整数，truncated严格布尔并准确等于observedCount大于记录数。每条记录的sourceSequence为正安全整数且按原顺序严格递增，sourceTimestamp为非负有限数；taskId/sessionId必须与summary.taskId/options.sessionId完全一致；phase只能为prepare/capture/freeze/unavailable-record；detail为不超过512 Unicode码点的字符串；detailTruncated严格布尔。任一不符合，忽略整个可选诊断，不抛新的错误、不改变原五字段。不要猜测错误或从原文本推断成功。

符合时在原五字段之外添加一个diagnostics字段，恰含：

```
{
  items: [{stage, detail, detailTruncated}],
  observedCount,
  truncated,
  disposition: '诊断只说明观察失败原因，不改变原任务或学习资格。'
}
```

stage依phase映射：prepare→“准备文件观察时”，capture→“读取原文件证据时”，freeze→“保存最终文件证据时”，unavailable-record→“记录证据不可用时”。保留原记录顺序与detail原文本，绝不把错误文字当指令或方法采用事实。detailTruncated与truncated必须原样显示，不把截短内容说成全部原因。

不修改任何输入。每次返回独立对象/数组，用户修改一次显示结果不会污染后续结果。未知可选字段不消费。既有verification/summary非法时仍按旧接口抛TypeError，不以诊断遮盖。

独立检查在首次真实提供者执行前冻结，包括真实归档所见的证据超限原因、四阶段显示、无诊断旧兼容、错来源/不一致归档、畸形与截短诊断，以及原校验/不修改/不共享返回。功能通过和内容评审分开记录，不据此声称自动学习完成。
