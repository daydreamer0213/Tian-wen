# 2026-10-03 真实核心前瞻及文件身份/权限集合修复

本轮自主找到真实文件身份缺陷，事前独立复现并固定合同/功能驱动，让天问一次未知答案修改两个实际核心模块。原稿修复已逐字工程交付；真实执行还暴露了多文件检查器对捕获顺序的错误假设，随后修复。没有索任务/催评价/重跑旧任务或新增学习门槛。

## 原生结果与工程结果

- 事前依据：6d04b50 接受 bad\ud800.ts / bad\ud801.ts 两个字符串，但实际 UTF-8 字节及模块 URL 相同；损坏 candidate 先访问缺失 root。host 首红与真实隔离首红一致。设计 4f3d691、合法绝对路径补齐后冻结 HEAD 72fe917。
- 原任务 `conversation-task:429ba9a6495b36cf29502783f18b4ee59bc83eac0baf3cc5983941cece196263`：1任务/0重试，13真实提供者请求、8根请求、10文件工具、prepare1/evaluate1，两个原审查 met/met，完整两输出/三参考捕获。
- 原程序结果 **unverifiable**：完整原输入及参考字节均正确，但原观察器按捕获到账顺序保存 outputPaths=[Runtime文件, Evolution文件]，检查器要求反序数组。实际权限集合一样，却在任何功能容器执行前停下；不是必需条件失败或新增失败来源。
- 原封存驱动末尾同样存在顺序假设，最终断言失败保存为控制端 run-failure；finally保存两 unverified-candidate 并恢复工作区。原驱动/首任务/条件不改，native-result 未生成，不以此缺件掩盖原任务证据。
- 独立工程检查使用原捕获五文件和同一份事前入口：Windows host 全部断言通过（包括合法绝对路径/Windows分隔），实际隔离容器 exit0/stdout {"passed":true}/stderr空。随后仅逐字接纳这两原稿，**没有把原任务改成 verified**。
- 同档冷恢复原 task/material/program/两个原审查精确，0模型/prepare/evaluate/新研究。旧实际发行两个JS压缩留存并核对原摘要。

## 产品修复与验证

Evolution conversation-files.ts 在原路径边界拒绝不能精确UTF-8往返的字符串；Runtime conversation-file-material.ts 在root I/O之前只增加该编码检查。中文、emoji合法代理对、字面U+FFFD、BOM、百分号、绝对路径及Windows分隔原流程保持；旧内容/路径/限额/摘要/学习规则不改。

conversation-isolated-python-check.ts 仅 node-project 的 evaluate 对复制后的完整权限数组排序比较。没有Set去重，缺/重/增/只读冒充仍拒；合同原数组/摘要、普通请求/context、完整原输入/只读参考和 saved study body 精确冻结保留。旧单文件分支不变；study prepare声明与保存outputPaths的原顺序绑定仍保留。

2个反序ordinary/study首红、30项当时通过；最窄修复后旧/新两组104通过。最终8组282通过（包括Windows独立原功能入口），八包类型/Runtime完整build通过。实际新发行fullRuntime反序read控制：原observer保存反序路径、prepare1/eval1、功能verified及scripted met；同档cold task/ledger准确、0请求/重执行，旧Python分支显式跳过。该控制仅机制，不是又一自然任务。独立只读审查无剩余有据P1/P2。

## 正式状态及存储

正式持续档现16观察/15识别任务/15完成，0反馈评估/0研究，quarantine true、readiness awaiting-compatible-sources。账本 `574d6e96be5762d14d24538ba19afa479f37599ff07c44d83742d76186c74778` /870269字节，原bc1b30d…698604字节前缀精确保持。后续工程接纳、构建及只读状态读取没有修改该完整账本。旧78fb…原功能rejected保留；本任务unverifiable不能补来源/成功对照或学习效果。

运行根 `D:/DevData/tianwen-path-identity-native-20261003` 约1.1MB，复用持续档/依赖/固定镜像，无全工程/依赖副本或安装。3自有容器（首红、独立工程原稿、反序fullRuntime控制）全部移除，历史84完整ID集合保留；快照/宿主临时目录空，Docker停止及最终D空间见cleanup/final-audit回执。

## 后续执行

多文件原计划Task3已真实执行并交付必要工程修复；不把“首任务无法核验”重写成成功。下一将已证实的原生驱动装配规则收进可复用DEV开发入口：明确任务声明/只读合同/输出权限集合/工具结果关联，原结果保存优先于控制端摘要，减少每轮改写一次性驱动。用受控反例关闭入口错误后，自主继续新的有实际依据核心待办，经修复后的真实发布包一次前瞻。来源、功能、模型评审、研究/采用/未来收益分别记账，不制造失败凑来源。

完整目标active/incomplete，main/Daily完整学习NO-GO、原同意/隔离/发布门槛/十工作日窗口保持。本轮有真实实现进展，不执行阻塞空审计、不索用户题目或评价。
