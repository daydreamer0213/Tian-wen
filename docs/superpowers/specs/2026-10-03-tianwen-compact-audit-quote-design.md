# 未来紧凑文件评审的逐单位引用提示

基于81fc103原native只读诊断：两模型有结构化raw met，requirements audit有效；grounding 42单位完整但answer-29.firstClaim.quote不是对应单位逐字子串，被原host正确拒绝。原整体inconclusive保持，不回填成功；这是一处具体模型输出失效，不能说程序/研究链已完成。

仅改未来compactFileAuditSchema的引用提示。先0模型测量本次原冻结evidence的旧紧凑schema字节及原quoteChoices；对每个非空单位提供该单位的有效逐字引用examples，有总UTF8预算才加入（优先一个完整单位或既有answerQuoteChoices中的短引用，不能拼接/规范化文本）。不把examples变成新枚举门槛，不删除单位或允许空quote，不改变kind/status/sourceIds/质量/host逐字检查。无预算保持旧紧凑输出。与保留完整enum和新增自动修正器比较，选择有限示例：维持紧凑预算及原有效quote空间，不修正旧响应/再请求原样本。

先固定控制：未来compact请求对应每个非空单位有准确本单位示例、空单位仍null、schema总预算不恶化、源码/Unicode/空行保持；错单位/拼接/改引文继续被原validator拒绝，旧冻结恢复/说明原义保持。旧小请求/非文件/历史不改。运行相关回归、八包类型及真实发行，确认原checker根JS字节是否保持；若改变，不把不同checker来源拼在一起。新发行未来受控端只验证接线，不称自然效果；任何自然前瞻必须新的真实待办原合同固定，不重评旧任务。

完成此具体实现后，继续根据实际来源诊断进入既有研究/受治理采用/未来效果，保持main/Daily NO-GO、同意/隔离/去重/停止及原十工作日窗口；不增加发布门槛或索所有者新题。
