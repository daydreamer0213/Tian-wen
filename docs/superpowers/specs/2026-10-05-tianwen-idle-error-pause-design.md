# 原生任务出错后的暂停收尾

所有者授权主动模拟缺失条件并持续推进。已完成的 readback 批次原普通任务在操作员投影解析时抛错，最后原 turn/end 为 error、Agent idle、原生 Goal active；公开暂停设置连续 Goal 模式后 cancel/whenIdle 不能建立原生暂停。原 SDK idle cancel 仅清 inbox，round driver 只处理 aborted 转移。

最小修复保留取消与等待，仅对取消前已 idle 且最后 turn/start 或 turn/end 为原 error 的精确任务，在等待后重新读同一 Goal；仍同 ID 且 active 时用公开 goals.pause 与最新版本暂停，随后原 flush 与持久化身份/状态核验保持。运行中、成功、下一 turn、complete 不进入兜底；原错误、验收和学习来源不改写。测试用现有实际 AgentLoop/GoalService harness 主动触发错误，另覆盖正常取消、版本变化和绑定不符。通过即关闭此缺口，不追加验收。

生成物 D:/DevData/tianwen-idle-error-pause-20261005；旧自然历史/main/Daily/原治理不变。模拟解析用平衡 JSON 对象提取修复另独立保存；下一批用全新原记录，不重跑旧已完成答案。
