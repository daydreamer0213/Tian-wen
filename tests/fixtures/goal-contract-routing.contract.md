# DEV 原生 Goal Task 合同分派

新增纯 ESM 模块 `scripts/development-goal-task-check.mjs`，导出 `createDevelopmentGoalTaskCheck(configOrArray, createCheck)`。只做选择和委托，没有SDK依赖、文件读写、研究、裁决、启用或结果修补。

调用方已经冻结原始合同。`configOrArray`支持一份合同或非空数组；每份为非数组对象，拥有非空字符串cwd、非空白字符串goalCommand、非空白字符串requestText。同组cwd及goalCommand逐字相同，requestText逐字不同。先检查全部合同，再深拷贝全部合同，随后将每份冻结副本交原同步createCheck工厂一次。不能修改调用方；调用方之后改字段、嵌套值或数组顺序不影响选择及原工厂配置。createCheck必须为函数；原工厂返回对象必须有prepare函数，methodScope可以缺省，但存在时须为函数。配置及返回接口错误抛TypeError，原工厂错误原样传播。

返回对象提供异步 `methodScope(material)`和`prepare(material)`。只读取非数组material对象的非数组task对象中的字符串objective，以其逐字匹配原requestText。不得改大小写、去空白、模糊匹配，或从goal.objective、request、context等字段推断。未知、缺失或损坏返回undefined，不调用其他合同。Map可接受`__proto__`等普通字符串。

准确匹配后将同一个完整material交给对应原方法，保留原this绑定、返回对象同一性、undefined、原错误与取消。不修改/克隆/补字段给material；没有methodScope时返回undefined，但同份合同的prepare仍可正常调用。方法支持原同步或Promise返回，不重试、不捕获并替换错误、不手动检查或修补原Goal状态。

原公开Goal工厂仍负责核原Goal命令来源、cwd、权限、Task、epoch、模型和文件合同。薄选择器不能冒充这些核验。工厂收到原配置全部字段，不能筛掉cases、referencePaths或其它原字段。

独立入口只观察构造、调用、冻结、完整material、this及返回身份。程序检查不代表整体语义安全或完整学习；本功能不更改任何学习资格或发布标准。
