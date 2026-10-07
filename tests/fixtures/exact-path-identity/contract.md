# 原功能要求

请修复 packages/tianwen-evolution/src/conversation-files.ts 和 packages/tianwen-runtime-bundle/src/conversation-file-material.ts 的文件路径身份缺陷。

当前两个不同的损坏 UTF-16 名字 bad\ud800.ts 与 bad\ud801.ts 都能被文件材料解析接受，但 Node UTF-8 编码和模块 URL 相同。这不是两个独立文件。要求：所有捕获路径必须可精确 UTF-8 编码/解码往返；不能把损坏字符替换成 U+FFFD 后接受。conversationFilePath 也应在任何文件 I/O（包括 root 检查）前拒绝编码损坏的 candidate，无论相对还是绝对路径。

保持现有合法路径及其原拼写/摘要；中文、合法 emoji 代理对、字面 U+FFFD、BOM、百分号均可用。保留原 NFC、大小写别名、保留名、目录/文件冲突、路径逃逸、内容 UTF-8、数量/字节限制、已有读写种子行为和导出类型。不得添加学习资格/反馈/研究/激活规则，不改其他源文件。

只读独立核验入口 tests/fixtures/exact-path-identity/entry.mjs 使用两实际模块和 learning-intake.ts。所有原功能断言应通过，输出严格 JSON {"passed":true}、退出 0、stderr 空。该条件对应功能完成；源转换失败或环境异常不能当作必需条件失败。
