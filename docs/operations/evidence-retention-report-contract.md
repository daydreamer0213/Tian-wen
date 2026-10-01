# 实验文件保留报告：原功能要求

实现scripts/evidence-retention-report.py，只用Python标准库。进程从stdin读取一个JSON对象，向stdout输出一个JSON对象。不得读取、写入或删除任何文件，也不得启动进程或联网；清单是唯一输入。成功exit0；非法输入exit2并仅输出{"error":"invalid-manifest"}。输出前后不可添加口播、日志或Markdown。

输入严格只含files字段，其值为列表，每项严格只含path、bytes、sha256、required。path是D:/DevData/下一个实际文件的绝对路径；允许Windows反斜杠或正斜杠，输出全部换为正斜杠。拒绝空段（除D:后的首分隔）、.、..、其他盘符/根、路径中控制字符、尾分隔；前缀D:/DevData/大小写不敏感，输出统一此前缀，其余路径保留原大小写。不同项的规范路径不得大小写不敏感地重复。bytes是非负整数（bool不算整数）；sha256是64位小写十六进制字符串；required必须bool。同一sha256若声明不同bytes，输入无效。额外/缺字段、非法类型都拒绝，不接受重复JSON对象键。

空清单成功。成功输出严格含totalBytes、retainBytes、reviewBytes、files。files依照规范path的(casefold,path)升序排列，每项严格含path、bytes、action、reason。

保留规则：同一sha256组成一组，每项required=true始终action=retain/reason=required-evidence；有必需证据时，该组其他项action=review/reason=duplicate-copy。有多项且均非必需时，排序首项retain/unique-evidence，其余review/duplicate-copy。单项且非必需也retain/unique-evidence。不同sha256不因文件名、大小相同或年龄而合并。review只是“有副本，仍需核对是否能删”，绝不表示允许删除。

totalBytes是所有文件bytes之和；retainBytes/reviewBytes分别累计对应action的bytes，必须相加等于totalBytes。整数计算不得丢精度。输出文件数须与输入一致，每项恰好一次。

该工具用于本项目各轮证据的只读盘点；required由可信清单采集方明确标记，不由工具猜测。不能把相同摘要解释成业务材料可替换或删除授权。
