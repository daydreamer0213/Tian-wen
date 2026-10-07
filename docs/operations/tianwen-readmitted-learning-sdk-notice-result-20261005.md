# 真实恢复已完成，SDK运行提醒被误拒绝

唯一 do-dw 批在已推送的 `f073a72b886fe4441bc0704f8946b2ea87a3654c` 原发布 Runtime/CLI 中结束：127 次真实模型请求与完整原/实际轨迹，15 次显式 scripted 训练请求另存，原 CLI 退出1、原句柄排空成功。七个原 Task/Goal 全部完成，三训练各真实经过宿主收尾标记、原 SDK get_goal/精确 scoped completion，原 JSON 保持。四事前未来基线3/4；三训练独立功能结果为两拒绝、一通过。

研究仍为0，原因不是缺样本或漏收尾。第一错误与正常对照产生两来源；第二错误的独立功能结果明确 rejected，但原内容评审记录为 unverifiable/invalid-judgment，未产生 researchSource。原两项错误来源要求未满足，本批立即原样停止，没有额外样本、补判或人工研究/激活。

## 已定位的具体兼容性错误

第二错误 requirements 原会话 `78082c7d-9107-4366-a5f9-abdcb4d0037a`，grounding `883c9b62-82ec-41a1-8eb9-9b2d73a570a4`。最终双方均为 not-met/source-fidelity，原引用、claim audit、汇总 parser 的只读生产检查均通过；解释分别855/1160 UTF-8字节。前五次工具确实拒绝了错误 quote，模型在原评审轮第六次更正后 seq7978/7979 唯一成功捕获，不能把前期失败当成最终语义失败。

三次同参数错误调用 seq2858/4012/5214 触发安装的原 SDK `repeat-tool-reminder`。seq5220 原 notice 的插件、summary `structured_output × 3`、正文逐字匹配 SDK gentle 提醒，真实调用和失败结果支持其计数。七条原评审 provider 轨迹没有信息故障或请求改写。生产恢复函数在 `conversation-judgment.ts:207` 拒绝了这个官方提醒，因为原代码仅承认天问自己的捕获提醒。只读诊断在内存核谓词，没有保存替代proof、改评旧答案或产生学习来源。

这是把正常运行辅助提醒误作非法新输入的流程错误。下一窄修复识别可核实的原 SDK 提醒，保留原要求、唯一成功捕获、原请求/会话摘要和独立引用检查；运行提醒不成为事实或新要求。默认提醒阈值与文本按已安装 SDK 核实，不只为当前一次 ×3 写特例，避免同一共享恢复入口在其他评审再次误拒绝。未知或被改写的提示、无实际工具调用支撑的计数继续拒绝，不新增研究或效果验收标准。

修复验证及新任务批的责任由执行者承担，不要求用户提供问题或评价；本批首结果与旧invalid状态保持。完整目标active，main/Daily当前NO-GO/R9与原窗口保持。

## 保存与空间

证据 `D:/DevData/tianwen-real-readmitted-learning-20261005`，保留 `batch-first-result.json`、两种完整 JSONL、原 `learning-admission.json`、排空及最终审计。29实际消费者、冻结输入和三历史账本不变，84 Docker完整身份保持，自启Docker已关闭。七 phase 副本逐项等于首结果对应项后删除3,304,167字节，D约17.14GiB；无环境复制/安装，77保护根与拒绝路径未访问。后续SDK修复数据放 `D:/DevData/tianwen-native-repeat-notice-20261005`。

## 窄兼容修复交付

只修改共享 `conversation-judgment.ts` 与原判断测试。实际SDK默认阈值3/5/8、参数深排序及500字符预览通过原同参数失败调用/结果和同ID next-step inbox插入/消费支持；通知不成为事实或新要求。未知插件、改文、伪计数、无调用/结果/inbox、乱序、重复通知等继续拒绝。原自身捕获提醒独立保留许可/次数；原唯一成功捕获、请求/会话摘要、lineage、材料及引用/audit检查保持。

源码基线29；新增RED四失败十通过；最终判断44、五相关文件67全通过，严格noEmit与diff检查0。原15实际构建0，发布profile49通过/10原跳过。四发布dist公共SDK控制（3/5/8与own reminder共存）26 scripted/0真实请求全部通过，各唯一成功捕获，恢复新增请求0，allowfalse仍拒绝未授权自有提醒；四临时根核真实范围后已清。证据 `D:/DevData/tianwen-native-repeat-notice-20261005`，receipt在其published-sdk-controls新UUID目录。限定复查无有据P1/P2；旧原评审只读谓词检查可恢复，不保存替代proof或修改原首结果。

下一 `D:/DevData/tianwen-real-native-notice-learning-20261005` 新dx-ef/7107—7179场景准备及八零模型操作员检查通过。仍按原两问题/一正常、五例十臂、四冻结未来和撤回阶段核实际效果；所有者已授权自主模拟缺条件，执行者不自然等待、不索题或机械标blocked。原main/Daily/R9发布条件不变。