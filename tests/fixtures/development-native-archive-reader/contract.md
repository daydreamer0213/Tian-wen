# 尚未执行的真实邻近待办：有界归档读取

实际消费者需要复用六个白名单记录的读取逻辑，不复制每轮readFile脚本，也不读取目录/未知文件。实现 scripts/development-native-archive-reader.mjs，仅导出 async readDevelopmentNativeArchiveEntries(readRecord, {signal,maxBytes})。readRecord是调用者拥有文件权限的异步回调，按顺序且仅各一次调用 attempt-started.json/task.json/root-native.json.gz/result.json/failure.json/cleanup.json；null表示文件缺失。函数自身无文件/网络/进程I/O，无其他依赖。传入非函数readRecord、非AbortSignal signal、非正safe integer maxBytes在任何回调前TypeError。

每次回调前和await后检查取消，取消按原signal.reason拒绝；回调真实错误原样传播，不继续后续文件。返回{path,content}列表，仅存在的文件，顺序固定，content独立Uint8Array复制。字符串必须逐字UTF8往返，Uint8Array仅真实view offset/length；其他值TypeError。累加实际字节超maxBytes时RangeError，不继续后续文件；等于边界通过。不能把缺失当空字符串或执行成功，不解析JSON/gzip或判断学习。输入及回调返回byte view不修改，返回数组不共享可修改字节。

完整原功能入口所有断言通过，stdout严格JSON {"passed":true}、exit0、stderr空；输入参数不得改变。此待办第一次答案尚未生成，不算已有来源或研究效果。
