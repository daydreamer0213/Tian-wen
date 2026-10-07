# DEV 原生归档字节封存合同

实现 scripts/development-native-archive-seal.mjs，仅两个导出 sealDevelopmentNativeArchive(sessionId, entries)、verifyDevelopmentNativeArchiveSeal(seal, sessionId, entries)。Node22标准库，无文件/网络/进程I/O，无SDK或外部包依赖；不重建SDK任务/模型身份、功能或学习裁决。

原六个合法路径固定顺序为 attempt-started.json、task.json、root-native.json.gz、result.json、failure.json、cleanup.json。entries 为数组，每项恰 {path,content}；content 是字符串或 Uint8Array（含Buffer），其他类型拒绝，重复/未知路径拒绝；空数组或缺文件可封存。字符串经UTF8编码必须逐字往返，不能默默替换孤立代理字符。二进制只取真实视图的byteOffset/byteLength，不能混入底层buffer前后字节。sessionId必须非空白字符串；保持原文，不trim返回或改输入。

sealDevelopmentNativeArchive 返回恰 {schemaVersion:'tianwen.development-native-archive-seal.v1',sessionId,files,complete}；files只含实际文件，以上述固定顺序输出，每项恰{path,bytes,digest}，bytes为实际原字节长度，digest为原字节sha256:后64小写hex，不是JSON序列化内容的hash。不保存原content。complete要求四项 attempt-started/task/root-native/cleanup，及result/failure至少一项；result/failure同时存在合法。无任务/成功/学习含义，不解析压缩native或JSON语义。

verifyDevelopmentNativeArchiveSeal 接受如上合法seal；顶层/每条file字段须恰闭合，schema/session/complete类型有效，files顺序须固定、唯一合法路径，bytes非负safe integer、digest格式合法，complete必须与seal文件集合相符。损坏seal（包括不一致complete）TypeError。entries及session仍按上述校验；输入排序顺序不影响核对，不修改任何输入。返回恰 {sessionMatches,filesMatch,complete,missing,changed,added}：sessionMatches为原session逐字相等；missing为seal有而当前缺，changed为双方有而长度或原字节hash不同，added为当前有而seal无；三数组按上述固定顺序。filesMatch仅三数组皆空，与sessionMatches独立；complete仅三条件sessionMatches、filesMatch、seal.complete全true。不改变原清单、原请求、原状态或失败结果。

正常空/部分/缺失/新增/内容改变/会话不同返回事实，损坏参数TypeError；字符串与对应UTF8 byte view视为相同内容。返回清单和数组独立，不共享原可变对象。只允许指定唯一输出脚本，原entry/本合同只读，不执行命令或修改断言。全部原断言通过，唯一stdout JSON {"passed":true}、exit0、stderr空；输入参数不得改变。
