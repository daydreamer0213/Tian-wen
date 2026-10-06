# 独立许可例外的只读状态（Task36，2026-10-07）

Task35 原完整 Python 复验 **611 通过、4 原规则跳过、退出 0**；原五套安装/Desktop **310/310**，完整包/公开反馈 **81+4**、原首审 **25/25**、原构建16步和八包类型图通过。Desktop目录成品和原审计退出0，83文件共365,231,616字节；冷候选NTFS压缩前后所有文件哈希相同，释放约121MiB，日常程序未动。

草稿 [PR #6](https://github.com/daydreamer0213/Tian-wen/pull/6) 初始未运行 CI，因为开发分支与 main 历史冲突，不是通过或云端测试失败。核对 main `65369692` 的状态维护024及简短notice；本分支已有这些源码功能与精确旧024支持。实际合并后只新增三份历史维护文档，移除自动合并造成的两处重复旧版本测试变化；563份源码/测试/CI文件与原候选def1b226字节一致，当前公开文档合同27/27。主线历史合并提交 `f9c247d5`，main引用本身没有移动。

首合并核对脚本错误要求 runtime.ts 含隔离字面属性，实际 public apply 使用 `applyConfigured(ctx, config, true)`。修正v2核对脚本，不改产品迎合；原脚本和说明保留。独立审查同时发现真实P2：状态仍说隔离阻止一切新启用，但原精确独立许可路线已允许在默认隔离下启用。

最窄修正只改只读状态：真实隔离布尔保持；提示说明直接启用默认被隔离，原独立许可路线仍要求全部原条件；待启用条目按精确studyId和scopeKey单列已保存clear记录，reject或错scope不计入，未重新验证、不声称当前许可有效/准备好/收益成立。未确定原因单列，不把有已保存clear记录的研究一律归因隔离。Ledger、启用守卫、同意、撤权和原模型记录完全不改。

原status夹具新增已保存clear/reject/错scope/空记录恢复、无模型、无私有材料泄漏与账本字节不变断言。实际 RED1→原完整status **42/42**、Runtime noEmit退出0。独立复核 PASS/PASS，之前P2关闭；运行物和审查在 `D:/DevData/tianwen-025-release-controller-20261007`。此修改后要更新正式候选构建和准确CI，不使用Task35旧成品冒充已含新提示。

Goal active/mainDaily暂NO-GO，installed Runtime0.1.24 / Desktop preview.25仍保留。完整自动学习原Task31/33闭环不重开；剩准确CI、安装/数据保护和原门槛发布结论，不追加模型样本或自然等待。此前scratch删除被自动审批以`blocked by policy`拒绝，未执行未绕过；D仍高于15GiB。
