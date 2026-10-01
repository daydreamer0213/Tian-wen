# 隔离运行清理摘要：原始功能合同

每轮隔离执行产生多份回执，运维需要快速列出清理尚未确认的名称。实现 `scripts/isolated-cleanup-summary.py`：仅使用Python标准库，从stdin读取一个JSON对象，向stdout写一个JSON对象。不读取清单指向的文件、连接Docker、执行外部命令、联网或删除任何内容。此工具报告输入记录，不证明容器实时状态、回执真实性、程序功能正确或自然学习完成。

输入根对象必须恰有字段 `receipts`，它必须是长度0–64的数组。每条记录必须恰有 `name`、`removed`、`boundaryVerified` 三个字段：name为1–128个Unicode码点的字符串，不能含孤立代理码点U+D800–U+DFFF；其他Unicode标量（包括空格）原样保留。removed与boundaryVerified必须是真正的JSON布尔值，整数0/1不等同于布尔值。名称按原样且区分大小写，重复名称为无效输入。JSON任何层级重复键、非有限数字、多个根值或无效JSON均为无效输入。

有效输入退出码0，stderr为空，stdout恰好包含以下四个字段的JSON对象（对象键顺序及JSON空白无要求）：

- `total`：输入记录数。
- `verifiedAndRemoved`：removed=true且boundaryVerified=true的name数组。
- `unverifiedAndRemoved`：removed=true且boundaryVerified=false的name数组。
- `cleanupUnknown`：removed=false的name数组，不论boundaryVerified如何。

三组互斥且完整覆盖输入，各数组按Unicode码点字典序升序，完整保留name，不修剪、改大小写或归一化。不遗漏隔离未确认但已清理的记录，也不把未确认清理的记录默认计作已清理。

无效输入退出码2、stderr为空、stdout为 `{"error":"invalid-receipts"}`，不能输出部分统计。错误栈不能泄露到stderr。源码不超过20,000 UTF-8字节；仅创建这一目标文件，原合同不能修改。未实际执行的测试不能声称通过。

功能必需条件：**按照本合同正确校验输入并完整、无损、互斥地分组汇总清理记录；有效输入返回规定JSON结果及退出码0，无效输入返回规定错误及退出码2，stderr保持为空。**
