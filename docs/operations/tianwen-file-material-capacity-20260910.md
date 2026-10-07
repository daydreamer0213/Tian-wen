# 多文件材料容量修正：工程检查点

## 当前结论

代码`27f264b6a27d526ddad50a40af61f26e43ff0279`已完成小范围容量协调。
新增定向5项、受影响6套113项及超大自然反馈1项检查通过，Evolution/Runtime类型
检查和Runtime完整14阶段构建通过。一次限定独立审查已关闭，三类发现均0；未准备新候选、
未进行新真实模型验收或Daily升级，不能称为完整文件学习已通过。

继承[024真实结果](tianwen-local-file-learning-024-real-results-20260910.md)，
不重开旧五项改造，不重复旧023/024。设计和取舍见
[容量设计](../superpowers/specs/2026-09-10-tianwen-file-material-capacity-design.md)。

## 实际修改

- 单个文件仍限32768字节、最多8份；多份文件的合计上限改为65536字节。
- 完整送审材料上限协调为262144字节，避免输入虽被接受但随后卡在原96KiB边界。
- 文件试验的聊天回答仍限32768字节，未跟随合计上限意外扩大。
- 原文、身份、保存格式、双评审、质量和采用标准不变；没有摘要截断、重试或第三评审。

这仍是有边界的本地文件增量，不表示任意大文档、任意工具/外部效果都已接通。
既有回答审计单位等边界也保留。材料不能完整装入时仍如实不可用；模型正常工作
不受学习采集失败阻断。

## 新鲜验证与保留的失败

1. 改前定向检查：4失败/1通过，分别实际落在32KiB聚合守卫和96KiB后续送审守卫。
2. 第一次改后检查仍4失败/1通过：Runtime测试消费的是未重建的Evolution公开dist，
   新常量未导出。保留原失败；重建Evolution后定向5/5，未改测试答案以掩盖失败。
3. 受影响6套113/113：file-material、file-learning、file-trial、file-observer、
   claim-review、judgment。复用已有其他工具/权限证明，不重测全仓库旧路线。
4. 仅另跑共享材料上限影响的自然反馈边界1/1（该文件另84项未选择），确认仍保留
   超大原文、停止评估且不生成学习研究。原生点赞留言8KiB限制检查未改。
5. Evolution与Runtime `tsc -b`均exit0。完整Runtime构建14阶段全部exit0；把声明中
   `pnpm run build:types`原样展开为其现有CLI命令，没有调用pnpm、安装或修改共享依赖。
   只更新开发构建，不覆盖Desktop默认产物或024已安装候选。

额外只读容量核算使用哈希仍匹配的024三文及实际C1评审输入：假设当时有完整文件
快照，现有无损投影会产生221924字节材料包（original102950、projection118944），
小于262144。495个来源单位、32个回答单位。该数值**仅是反事实尺寸诊断**，未运行
模型、补写捕获、补造遗漏的辅助上下文或重判024，不是新的原生取证证明。

## 证据索引

目录：`E:/待清理/D盘迁移-2026-09-08/Tianwen-本地文件学习-024/native-use/evidence/`。
`capacity-*`为024关闭后的工程诊断，不属于原冻结验收；原audit/final-state不变。

| 文件 | SHA-256 |
| --- | --- |
| capacity-engineering-red.json | `99fed60767739a553507df8c2b9c9574269d1670b0c6c0b36b94220716770c78` |
| capacity-engineering-green.json（旧dist失败） | `2136b285bb2ecc8578f28b41807836d6b99789cd400dd80bd66949f7d656d0f0` |
| capacity-engineering-green-2.json | `6bdbded99fed0c37d04f1b0c5c45a9514b99e0358a85c85a1982cd80ebef9528` |
| capacity-engineering-regression.json | `412a43d23b4df053d5e01aad3558e9f4196994bd91866f408a73a61ff99c4f17` |
| capacity-engineering-feedback.json | `8ab5ceb6051e0c0fc1337cdaea3ff59c1e88f63ccf55feb734f470067b31faf7` |
| capacity-build-1.json | `5a2a515fe09c0281e149f3669583cf5993b6484878fe64e70b78ed52fbdc65e4` |
| capacity-real-shape-size.json | `c70ea306d364416ee70bd3e8399ff6a591b9ce619178c316b6b9b5bee91a7d03` |

024已安装Runtime仍为`1f3568acb40647e6ee7585f59fd53b5ddcb5f96766adbef9a86efe46dccf1c49`，
本轮复核未变；原关闭状态和失败证据不改写。

## 判断提交问题的处置

已完整核对安装的DSH原生结构化驱动、调用配置和DeepSeek请求序列化：提供工具、
校验工具结果及无提交时拒绝都由原生负责；没有现成tool_choice或缺提交自动修复
开关。F1的一次格式未提交保留为真实不确定性，不新增天问Agent循环/普通JSON后门，
也不把一次模型失败误判为平台全部失效。未来如有更充分可靠性证据，优先上游机制。

## 后续门禁

限定审查仅检查4d898ff到27f264b的8文件差异及直接消费者，没有另跑测试或模型。
确认保留的文件试验96KiB执行材料限制具有独立用途，并非漏改判断材料入口。
结论只允许进入下一门禁决策，不代表合并或Daily升级已通过。

限定复核已关闭，下一步协调新候选身份与冻结新的有限实际使用入口；仅检验变化后的
完整文件材料连接，不再逐一重测未改分支或要求模型必然探索/采用。
仍须分别报告实际文件捕获、原生评审/恢复、是否形成新研究。没有新研究不自动判
失败，缺少捕获也不能用普通任务完成冒充通过。必要门禁满足后才进入已授权合并、
准确main CI和Daily交付。
