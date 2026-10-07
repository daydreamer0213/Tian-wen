# 功能检查状态索引：原始合同

现有任务记录会保存功能检查原结果和检查撤回通知。运维需要批量看到当前有效的检查状态，不能把已撤回的旧rejected继续列为有效拒收。实现scripts/summarize-functional-checks.py：仅Python标准库，从stdin读一个JSON对象、向stdout写一个JSON对象，不读取文件、不联网、不执行外部命令、不删除或修改清单指向的内容。

输入根对象恰有字段tasks，是长度0–64的数组。每条记录恰有taskId、checkStatus、invalidated三个字段：taskId为1–256个Unicode码点的字符串，不能含孤立代理码点U+D800–U+DFFF，其余Unicode标量包括空格原样保留；区分大小写、不归一化，重复ID无效。checkStatus为null或字符串verified/rejected/unverifiable；invalidated必须是真正JSON布尔值，0/1不等同布尔值。checkStatus=null时invalidated必须false，没有检查不能撤回。JSON任何层级重复键、非有限数字、多根值或无效JSON都无效。

有效输入退出码0、stderr为空，stdout恰有以下六字段的JSON对象：total为输入记录数；unchecked为checkStatus=null的ID数组；verified、rejected、unverifiable分别为对应状态且invalidated=false的ID数组；invalidated为invalidated=true的ID数组，不论原状态为何。撤回记录只能进invalidated，不同时进原状态。五组互斥、无损、完整覆盖，ID保持原样，各数组按Unicode码点字典序升序；对象键顺序和JSON空白不限制。

无效输入退出码2、stderr为空、stdout为{"error":"invalid-check-records"}，无部分统计或错误栈。源码≤20,000 UTF-8字节，仅创建/修改这一目标文件，原合同不能修改。模型可read合同/目标，write或edit目标，不得执行程序、访问其他文件或网络。没有实际执行的测试不能声称通过。

索引只汇总传入的检查状态，不判断任务整体是否成功、模型回答质量、来源资格或学习完成，也不重新评价旧检查。输入是否合法或撤回通知是否真实由调用方负责，这个程序不验证原始账本签名/身份。

功能必需条件：**按照本合同严格校验输入，完整、无损、互斥地索引当前有效功能检查状态，已撤回检查只进入撤回组；有效输入返回规定JSON与退出码0，无效输入返回规定错误与退出码2，stderr为空。**
