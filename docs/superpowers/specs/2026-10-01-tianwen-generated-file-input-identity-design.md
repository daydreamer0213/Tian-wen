# 生成文件案例的重复输入边界

b8dc2f9干净树下核对C/D。现有五案例解析已拒相同inputDigest，不能重复修复。独立反证审查发现可达C漏口：guidanceInputDigest哈希原files结构；local-files/chat的adjacent/holdout可同prompt/内容、仅颠倒entries顺序或改路径大小写，得到不同摘要而打开研究。原生成要求已经禁止相同事实/复制问题，conversationFileTaskInputDigest也已将排列和路径大小写作为身份别名。不是新增案例数或通用语义门槛。

选择保留冻结guidanceInputDigest/materialDigest/studyId及原解析，增加一项仅供新判断的文件输入身份：沿现有prompt NFKC/空白归一，entries路径小写后排序、内容精确保留，outputPaths小写排序，其余文件合同原样。正常内容变化、路径集合/输出集合/模式不同仍可不同；不同要求或内容的语义独立仍不作结论。

普通file输入身份已有canonical规则，提取其小内部函数供同包共享，旧hash字节不变。生成副身份薄包装现有guidanceInputDigest，不建存储/注册表，不把新身份替换历史摘要。loop在设计后、提案/打开前比较两个生成案例和实际三来源完整原输入；账本新study-opened和guidance-activated另核对两个生成案例，防直接写入绕过。账本没有原请求全文，不能伪造来源全文核验；loop负责其可恢复部分。

gate只在新mutation使用；原parse/历史replay/重复写入幂等保持，旧accepted不改判，历史已激活不撤回，新激活不能绕过明确重复输入。失败保留已消耗的设计尝试，不重跑该来源对、不产生候选或十臂。新激活隔离不解除。

先以真实账本和DSH机制证明漏口：倒序/大小写/输出顺序变体拒绝；内容变化放行；历史同样body冷重放及重复幂等不改，旧accepted新激活拒绝。原inputDigest精确公式保持。loop拒绝前只调用一次案例设计，不调用提案/worker/reviewer、不修改原文件，并重启不重试。机制不是自然研究成功，C语义独立/D结果依据/完整目标仍缺；不添模型，不重跑旧自然材料。运行小根D:/DevData/tianwen-generated-file-input-identity-20261001，D>=15GiB优先20、NO-GO/原门槛/原十日窗口保持。
