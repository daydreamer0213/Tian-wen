# 已结束测试缓存：2026-09-10 可恢复归档

按项目所有者最新要求，清理已结束、无进程占用的六个工程测试目录。
未按名称批量删除其他历史试验，不动任何曾被保护机制拒绝清理的目标。

归档位置：`E:/待清理/D盘迁移-2026-09-08/Tianwen-测试缓存归档-2026-09-10/`。
完成UTC时间2026-09-10T03:05:05.5263778Z。6目录、6639文件、35988404字节
（34.3MiB）全部先复制到E、逐文件SHA256比较、再次检查源路径/进程/链接，再
仅移除对应D副本。E副本保留，可按清单恢复原路径。操作exit0；随后的独立只读
检查确认六个D源路径均不存在、六个E目标均存在、文件数逐目录匹配。

| 原D目录（均位于D:/DevData） | 文件数 |
| --- | ---: |
| tianwen-task5-runtime-profile-ordinary | 95 |
| tianwen-task5-source-affected | 1357 |
| tianwen-task5-source-closure | 1277 |
| tianwen-task5-source-final | 1278 |
| tianwen-task5-source-green | 1278 |
| tianwen-task5-source-red | 1354 |

`manifest-before.json`含旧/新路径、每份文件字节及哈希：
`5ff98dd17e67c824276ac9e7b0795844fff3fb152ebc7adfbfcf8e385279c1da`。
`receipt.json`为整批收据：
`4adf38f014816b91848708107845977f51c07cf37254148a58fad613370142d5`。
`completed.jsonl`记录逐目录完成情况。脚本复用09-08既有安全归档方法，只替换
确切六目录及新目标，不遍历/迁移整个DevData或共享依赖。

D空闲观测从14517325824到14570438656字节；该变化含分配粒度及同时运行的
其他活动，不能把全部约50.7MiB都归因为本轮释放的文件字节。

带435个依赖链接的两个runtime-profile/final目录未盲目迁移；曾拒绝清理的
consumer-tests链接未重试。当前工作树、构建依赖、Python、Daily022、原快捷方式、
旧023/024验收现场及新025环境均保留。旧的操作收据/研究证明没有被改判或丢弃。
