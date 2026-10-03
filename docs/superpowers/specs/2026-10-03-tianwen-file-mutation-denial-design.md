# 可信原生 write/edit 拒绝：继续任务且保留错误

用户已授权自主持续实现。本轮继承55f06ce及正式原f4da154结果，不重评、不追加验收，不向用户索题或许可。真实首次超预算write被原DEV guard拒绝，后write成功，但旧read-only denial没有pending使整档材料unavailable；这是已证实产品缺口。

候选方案：修改旧read receipt为union会放宽旧公开格式；直接忽略isError无法区分未dispatch与工具体异常；选择独立闭合mutation receipt，复用已有结构绑定，保留旧read格式/指令。所有检查责任继续在原native observation/保存/恢复链上，不建新loop或通过开关。

新Evolution `tianwen.native-file-mutation-denial.v1` receipt额外绑定tool恰为write/edit。共用旧read结构验证时，只在内部已核对原tool后将该call的name投影为read进行相同identity/range/unique/args/result/admission校验；不修改输入事件、不重算或替换原resultDigest，不声称发生read。原receipt保存实际tool和原所有摘要；真实native proof/完整任务span仍由Runtime认证。公开子入口导出，不使无关codec或factory根导出扰动checker身份。

Runtime新独立mutation producer admissions，原guard必须只执行一次，保持原返回/定义/disposer。新guardFiles包裹同一原guard，对read复用旧receipt，对write/edit使用新receipt；opaque token/原root/task/call/args/SDK定义在拒绝和result时绑定。任何dispatchcounterevidence、未知guard、相同文本工具体异常、取消/撤销/producer或definition漂移、缺失/重复结果仍fail closed。拒绝路径不读/写文件、不captureinput、不计输出；guard自身为合法edit预算检查读取目标不被额外描述成无I/O，receipt只证明原工具体未dispatch。

新ancillary payload `file-mutation-denied`仅主链原local-files或既有external code files admission可写入，原16记录边界不变。新file-execution v4精确动作含read/write/edit denied(path:null,reason)，只在有mutation拒绝时使用；旧v1/v2/v3和原说明不改。v4说明只证明原工具未dispatch，不证明guard自身无I/O、全任务成功、内容真或程序结果。chat实际工具拒绝可保留，真实chat write仍拒绝。

冷恢复必须重新核对原native/session/result、所有ancillary、原produceradmission与完整动作，不读取当前磁盘补原文件。新record不成为初始来源或额外回答单元。原f4da154始终completed/unverifiable/inconclusive/eval0，当前正式19observed/18identified+completed/0feedback/0study/隔离不变；工程控制不补自然资格/研究/启用/后续效果。main/Daily NO-GO及原同意/窗口/门槛保持。

验收沿上述原缺口：write超预算拒绝后合法write可完成原功能检查；edit不允许的字面修改拒绝后合法edit可检查；可信read拒绝混合保持v3或新v4所有真实动作；未知/体异常/drift/cancel/revocation仍失效；真实发行SDK及另新进程cold绑定正确。旧完整材料、原两审/指令、程序和身份恢复正确。生成物仅D:/DevData、复用正式环境/依赖/镜像，保留84原容器ID，临时自有清理，D≥15GiB。
