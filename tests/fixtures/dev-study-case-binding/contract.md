# DEV 功能研究案例装配合同

实现 scripts/development-functional-study-cases.mjs，唯一导出函数 buildDevelopmentFunctionalStudyCases(config, material)。只能使用Node标准库，不做文件/网络/进程I/O；不执行功能案例或产生学习判定。

config为调用前固定的JSON对象：cwd非空字符串，qualityContract为非null对象；originals是至少三个原合同的数组，每项有requestText非空字符串、entries数组、outputPaths数组、entryPath、cases、requiredCondition；adjacent/holdout各有prompt、criteria及相同后五字段。entries为{path,content:string|null}，非空且path唯一；outputPaths非空字符串数组、唯一且每项均在entries中；entryPath必须在entries中，允许只读入口。cases非空数组，直接保留原值；requiredCondition非空字符串。原requestText不得重复。独立prompt非空、criteria非空字符串数组。配置形状损坏应抛TypeError；这里不是路径/JSON执行协议认证，认证由原SDK处理。

material由Runtime在提案前提供：cwd、qualityContract、sources恰好两个原材料，以及counterexample。原材料含request（多个消息，每消息content多个block）、context、objective、criteria、qualityContract、files及可选feedbackStandard。files为原tianwen.conversation-file-material.v1/files/cwd/entries/outputPaths。请求投影与原SDK相同：按消息和block顺序取text block的text，合并以换行分隔。完整材料必须属于config.cwd和qualityContract；source.files初始完整entries及outputPaths须与匹配合同同集合，entries的path/content均逐字相同；不依赖捕获顺序，不忽略缺、重、额外或内容漂移。只有原请求和完整文件图一起唯一匹配才可取其原功能cases与requiredCondition。两个sources和counter须匹配三个不同原合同，不可重复借用。未知或损坏material返回undefined，不替其编造合同。

返回恰好source1/source2/counterexample/adjacent/holdout五属性，每项恰好material、entryPath、cases、requiredCondition，不含isolated。source1/source2保持material.sources[0]/[1]顺序，不按合同列表重排。三个原material保留request/context/objective/criteria/qualityContract/files和存在的feedbackStandard；不泄出额外answer、状态或signal字段。独立material为prompt/criteria/qualityContract/files，files使用固定v1、files outputKind、config.cwd及原entries/outputPaths。不含原反馈。全部返回可变对象与config/material不共享引用；不修改任何输入。材料不合格仅undefined；底层SDK仍负责原资格、路径、quality、检查、隔离/采用，不在本函数加门槛。

独立验收由只读entry.mjs全部原断言一次执行；stdout严格JSON {"passed":true}、exit0、stderr空，参数不变。模块源码≤20,000 UTF8字节；不能改本合同或entry、执行检查、安装或改其他文件。最后仅简短说明交付，不声称已自行运行。
