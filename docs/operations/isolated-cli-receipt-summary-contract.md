# 隔离 CLI 回执汇总工具合同

实现 `scripts/summarize-isolated-cli-receipts.mjs`，用于替代天问运维中逐份打开执行回执的工作。只使用固定Node22.23.1标准库，从stdin读取一个JSON对象并向stdout写一个JSON值；不得读取stdin以外的文件、运行子进程、联网、修改或删除任何数据。源码≤20,000 UTF-8字节。

## 输入
顶层是 `{ "receipts": [...] }`，数组最多64项，可以为空。每项是原隔离执行器的完整JSON回执，使用以下字段，其他元数据忽略：

- `name`：非空字符串，最多128字符，数组中完全相同的name不可重复，按原字符串区分大小写。
- `boundaryVerified`、`removed`、`recoveredByName`：必需布尔值。
- `failure`：缺省或非空字符串；存在表示准备/传输/边界阶段记录了失败。
- `state`：必需，null或对象；对象含非空字符串`status`、整数`exitCode`（0—255）、布尔`oom`。
- `output`：必需，null或对象；对象含布尔`interrupted`。其余stdout、摘要、transportCode等不是本工具的判断依据。

输入JSON语法错误、顶层不是对象/receipts不是数组/超过64、记录或上述使用字段类型不符、name重复，都输出 `{"error":"invalid-receipts"}`，退出码2、stderr为空。只需上述JSON解析及字段合同，不要求重新实现JSON解析器或检查未使用元数据。

## 输出
有效输入退出码0、stderr为空，输出以下对象且不增加字段：

```
{
  "schemaVersion": "tianwen.isolated-cli-receipt-summary.v1",
  "total": 0,
  "boundaryVerified": 0,
  "removed": 0,
  "recoveredByName": 0,
  "recordedExits": 0,
  "nonzeroExits": 0,
  "oomKilled": 0,
  "transportInterrupted": 0,
  "setupFailures": 0,
  "missingOutputs": 0,
  "attention": []
}
```

三个原布尔字段分别计true的项数；state非null且status恰为`exited`才计recordedExits，其中exitCode非0计nonzeroExits；任意state.oom为true计oomKilled。output非null且interrupted为true计transportInterrupted；failure存在计setupFailures；output为null计missingOutputs。计数各自独立，可以重叠，不能相加解释为互斥类别。

每条需要注意的记录在attention中出现一次，格式`{"name":"原name","reasons":[...]}`。按下列次序依条件加原因：

1. boundaryVerified=false → `boundary-unverified`
2. removed=false → `cleanup-unknown`
3. failure存在 → `setup-failure`
4. output=null → `output-missing`；否则interrupted=true → `transport-interrupted`
5. state=null → `state-missing`；否则status不是`exited` → `state-not-exited`
6. state非null且oom=true → `oom-killed`

没有原因不列入attention。attention按name使用字符串代码单元顺序升序排列，输入顺序不改变报告。非零退出码可以是原任务要求，因此不单独列为attention。

这些都是回执字段汇总，不是完整执行器结果判定、程序功能正确性或学习效果。state未保存的字段不能补推；不要输出“任务成功/安全通过/已完成学习”等结论。最终说明只描述已交付的文件，未自行执行测试不能声称测试通过。
