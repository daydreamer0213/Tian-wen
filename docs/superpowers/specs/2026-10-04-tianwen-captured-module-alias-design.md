# 已捕获包模块的原隔离检查接入

限定核心复查未发现C/D缺一个helper；但实际公开SDK源码`@tianwen/evolution/learning-intake`完整保存在图中，原发布executor依然ERR_MODULE_NOT_FOUND，现有图无包名映射。诊断仅1工程容器/0模型/0Task，不能算自然问题。此限制让项目代码只能改写成无依赖小函数，不应靠重复小题替代真实工作。

在原Node project编译/准备API与普通/Goal/五角色结果生产者添加显式host-owned `moduleAliases`：精确包specifier→图内已捕获只读模块路径。调用者登记实际原入口及其完整传递闭包，不能从当前node_modules补依赖；检查工厂必须要求alias目标属于referencePaths，禁止mutable output冒充包。单executor只处理caller完整captured图，未声明包仍沿原隔离环境失败，不安装或暴露主机路径。

仅原Node project引擎允许此字段；非project引擎拒绝。映射对象普通/无原型、≤32条、仅自身字符串键；包及子路径规范闭合，禁止builtin含fs/promises、node:、URI/绝对/相对specifier、dot traversal/prototype键；路径沿原文件解析，必须JS/TS模块并在捕获图存在，缺失停止。映射按键排序复制，调用后改原对象不影响准备身份。

只扩原snapshot loader resolve的精确映射，mapped TS仍沿原别名统一同一canonical URL。不改package.json保留路径、graph来源、源码/转换/IO/timeout/容器边界、stdout frame、清理或模型权限；不读或导入候选到host。完整映射绑定executor/contract/snapshot摘要，普通及study准备都用原全部输入，两臂同一个prepared evaluator；旧无字段默认保持、旧Task/契约/账本不回判、不建兼容桥。

验证先红真实可捕获模块映射及坏声明，再源检查与真实缓存Docker隔离消费实际SDK入口；证明SDK包名调用canonicalJson对应保存原字节，不伪装通用依赖支持、NLP语义独立或自然效果。发布完整原构建并独立复查。原CLI真实任务在该能力交付后使用既有配置执行，不本轮补样本；不重跑首自然任务。NO-GO/原发布条件/窗口/71拒删/D≥15保持。
