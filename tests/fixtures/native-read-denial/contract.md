# 原生read拒绝回执原合同

实现 packages/tianwen-evolution/src/conversation-read-denial.ts，导出两个纯函数和对应接口，供随后实际Runtime guard/ancillary复用。本轮只写这个输出，其他文件只读。源码≤20,000 UTF8字节，只用Node22标准库及同目录learning-intake.js的原sha256/canonicalJson；不运行代码、命令或网络，不改学习、旧记录或验收。

## parseConversationReadDenialReceipt(value)

返回新对象，不改输入。闭合字段恰好：schemaVersion、identity、callSeq、resultSeq、argumentsDigest、resultDigest、producer、nativeTool、reason、dispatch。

schemaVersion必须tianwen.native-read-denial.v1；dispatch必须not-dispatched。identity恰好taskId/sessionId/turn/callId/rootCallId：四字符串为非空、非全空白、无NUL、精确UTF8往返且≤512字节；turn为正安全整数，callId必须等于rootCallId。callSeq/resultSeq正安全整数且callSeq<resultSeq。argumentsDigest/resultDigest和producer.digest都是严格sha256:加64位小写十六进制。producer恰好id/digest，id遵循上述512字节身份约束。nativeTool恰好package/version/adapter，必须@deepseek-ai/dsh-tool-fs、0.1.1-rc.2、tianwen.file-ancillary.v1。reason非空、非全空白、无NUL、精确UTF8往返、≤4096字节；允许正常Unicode、BOM及U+FFFD。

所有闭合对象拒null/array、缺/多字段、继承代替自身字段和symbol额外字段；坏输入抛TypeError。返回对象包括identity/producer/nativeTool都与输入独立，后改输入不影响返回。不得因not-dispatched字样或reason就推断可信来源。

## verifyConversationReadDenialReceipt(value,binding)

binding由调用者提供已核验原生会话：{task:{taskId,sessionId,turn,startSeq},boundary,producerAdmissions,events}。四task身份按上述约束验证，startSeq/boundary正安全整数且startSeq≤boundary；producerAdmissions为0至16个恰好id/digest对象，无重复id，拒稀疏/多自身属性/symbol数组；events为完整原native事件数组。返回通过parse后的新回执，否则抛TypeError；不改回执/binding，不调用模型或文件I/O。

回执identity必须逐字匹配task、turn，callSeq≥startSeq且resultSeq≤boundary，producer必须匹配唯一声明id及digest，不能接受只匹配id或空声明。

只在[startSeq,boundary]范围按callId寻找native tool/call和tool/result，必须恰好各一个。call.type为tool/call、seq=callSeq、data.name='read'、data.turn=task.turn、data.step非负安全整数、data.callId逐字相同；data.arguments为有效JSON对象（拒null/array），file_path必须字符串，sha256(JSON.parse(arguments))=argumentsDigest。参数其余字段原样参与摘要，不默默丢弃。

result.type为tool/result、surfaceOp='append'、seq=resultSeq、data.turn/step与call相同、sourceEventSeqs为无多属性/无symbol的单元素数组且仅callSeq，data.error和data.meta均未定义。data.message.role='user'、source.kind='tool'、source.callId相同；data.message.content为无多属性/无symbol的单元素数组，唯一项type='tool-result'、toolCallId相同、isError=true、content为相同单元素数组，唯一项type='text'且text严格等于'Error: '+reason。sha256完整result事件=resultDigest，不只摘要content。缺/重call或result、失败标记/文本/字段/范围/摘要/producer漂移均拒绝。范围外其他任务的事件不算本task证据。

这是结构/原事件绑定验证，不是no-dispatch来源认证。Runtime必须独立捕获真实guard返回拒绝、同opaque token未进入dispatch及实际native工具definition/producer绑定；未知来源、真的已dispatch失败、取消、撤销同意不能靠本函数通过。不得产生成功read/output、任务成功、学习资格、研究或激活标签。

## 原功能入口

只读entry.mjs导入此模块，用原learning-intake源码计算真实摘要，独立断言以上允许/拒绝边界、错误类型和不变性。全部原断言通过，stdout严格JSON {"passed":true}，exit0，stderr空。只读conversation-file-ancillary.ts提供原回执风格依据，不要求重写它。
