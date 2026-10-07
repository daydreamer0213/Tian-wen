# DEV 原 CLI Profile 接入结果

基线a1f94719；完整目标active/incomplete，main/Daily NO-GO，原同意/双审/语义/来源资格及十工作日窗口不变。

## 实际改变

固定DSH 0.1.1-rc.2 原`resolveProfileDir`只接受`$DSH_HOME/profiles/<name>`，没有任意绝对Profile根覆盖。旧DEV要求根必须是专用数据目录直接子目录，且实际Loader baseUrl必须同根；因此普通CLI按自己的正常目录无法消费DEV。上轮嵌套Loader失败保留。

公开只读`resolveDevelopmentRuntimeRoot`保留旧直接根，另认可`D:/DevData/tianwen-development-runtime/<dedicated-home>/profiles/<profile>`。home/profiles/profile逐层真实canonical，拒绝模块fallback目录node_modules、链接/错层级/正式根。原baseUrl、固定state/sessions/evolution子目录、实际JSONL类型/locator及fresh Evolution规则保持。公开合同插件消费同一发行函数，避免两个判断漂移；原CLI未再修改，没有新宿主、学习循环、同意文件或任意插件配置能力。

## 验证范围

两个新增正向首次19项中17通过/2失败，分别在合同插件和原Runtime的旧目录检查拒绝；首日志保留。修复后源20项通过，包括CLI错层级/fallback/profile链接/profiles祖先链接/home链接/会话错根/实际baseUrl错根/state链接。原包原15个构建子命令、依赖引用与两个完整声明成功；直接使用现有Node/工具，未安装、删除或复制依赖。

首组合110项中109通过/1失败：原CLI已经实际加载DEV、退出0、0请求/任务/研究/同意，但控制断言误要求目录URL不带尾斜杠；未执行随后业务账本断言，不补称该首档完整通过。仅改为解析后比较实际目录身份；最终同六文件110项通过。新正常CLI控制使用原CLI/Loader、原基础服务、原JSONL与公开DEV插件；probe只读原服务后调用原appExit，无脚本adapter、harness或新任务。最终两原业务账本摘要一致。普通Runtime隔离仍true；本控制专用DEV为false，没有accepted/activation事件。

实际发布`dist/runtime.js`更新；`dist/index.js`仍为`936777c2be05f0114d122bfc32e4eda787f7546e40ade8412acdaf8b7a456cc8`，公开功能检查器身份未变化。新发布与目录机制证明不能充自然来源、语义安全或未来收益。独立只读审查无有据产品P1/P2，URL控制问题已纠正。

证据：`D:/DevData/tianwen-dev-cli-entry-20261004`的red.log、source-green.log、green.log、final-green.log、build-result.json，两次cli-packet的原合同/退出及probe收据、最终审计；原manifest与patch生成方式在提交的测试中，随临时home释放。两个新CLI临时home均由测试释放；失败小收据保留，未复制环境，71拒删根未操作，Docker未启动，D≥15GiB的最终值见final-audit。

## 下一项实际工作

原CLI入口加载控制收口，不再重复零请求冷加载或关闭控制。当前仍7自然Task、1可信问题/1不兼容完整成功、0新真实反馈/自然研究；原首20项验收和七Task终态不改。开放R9语义风险与研究裁决、方法采用、未来效果仍未完成。

接下来的必要产品工作是把目前手工维护的DEV Profile插件配置变成可复用的数据工厂：仅生成原manifest和原runtime/job/runner配置，不创建Agent/任务、执行命令或授予同意；沿现有Loader及已公开合同/任务服务。由执行者事前固定真实要求、版本及独立Node功能依据，再通过原入口唯一首次交给天问实现，结果未知、失败不重试凑来源。后续实际CLI任务消费与原学习链分别记账；不将这个工程控制或预设代码错误当第二个问题。
