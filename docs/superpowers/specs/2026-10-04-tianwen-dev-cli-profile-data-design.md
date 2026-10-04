# 实际 DEV Profile 配置数据交付

基线67195e06已验证原CLI可挂DEV，但每次仍手拼原服务行。由天问唯一首次实现 `scripts/development-native-cli-profile-data.mjs`，导出同步纯数据工厂 `createDevelopmentNativeCliProfileData(options)`。协调者在未知答案前冻结本需求及独立入口；不写候选、不重跑旧任务、不造反馈或研究案例。

options是普通对象，仅六个必填字段：profileRoot、cwd、contractPath、contractDigest、jobPath、jobDigest。四路径为无NUL的D盘绝对Windows路径，接受大小写盘符、斜杠、空格中文；不访问文件或重复物理根验证，原挂载入口继续验证真实根/baseUrl/合同/任务。摘要是严格小写`sha256:`加64个十六进制字符。拒非普通对象、缺字段和额外字段，包括同意/隔离/提供方覆盖。

返回仅manifest和patch；完整形状、固定16服务顺序/原模块名/配置见冻结独立入口 `scripts/test-fixtures/development-native-cli-profile-entry.mjs`。URL以候选自身import.meta.url派生原公开observer和原runtime/job/runner脚本；operator路径和摘要原样绑定，只有sessions根去掉profileRoot尾部斜杠后加`/sessions`。每次全新可序列化对象，输入不修改。仅Node标准path/url依赖即可，不创建Context/Agent、提供方、文件、任务、计时器、同意、模型调用或学习决定。原runner是显式数据行：消费完整patch才启动原job；生成数据本身不启动。

原真实DeepSeek配置、65536预算、0提供方重试、90000ms idle保持。原空agents、JSONL none、文件cwd、spawn provider保持。不新增执行器/宿主/学习循环。仅输出文件可写，独立入口只读。原25命名检查一次全部完成、stdout为冻结JSON、stderr空且exit0；复核和功能分别记账。独立检查不是已验证的语义安全，也不是实际CLI完整任务的替代。

冻结后执行一次原标准Loader/DEV/job，复用已有连续Profile原同意，不创建新工程研究供应；沿用已有未触发供应配置但来源信用0。首次自然结果不修判，必要工程修复另记。研究来源条件由原身份决定，不手工桥接本任务到旧报告问题。原七Task、正式账本、NO-GO、资格/原十工作日窗口、71拒删路径保持。生成物D、不复制环境、≥15GiB。

未知答案前预检纠正：原CLI依赖树不含JSONL模块，存储行name使用现有Runtime依赖别名下原lib/index.js的相对file URL；不调用require或安装依赖。首次冻结提交和纠正提交均先于Task。
