## 2026-10-07 收口结果

Task43已完成独立源码复核（PASS、无P1/P2）、最后facts作用范围补验10/10及准确source d6b45ccf的原四项CI。PR6合入main04e49f90同树，原main四CI全部成功；Runtime0.1.25/Desktoppreview.26已实际交付日常，两Profile、83成品、42保护/五预期变化和原窗口／正常关闭均通过，独立终审PASS。旧首次失败/原学习票不改。最终运行包以真实installer bc4354c4…绑定，旧5f候选只属历史。详见 [实际交付](tianwen-runtime-025-delivery-20261007.md)。以下保留当时的诊断与待办文字，不能作为当前NO-GO。

# Task43 文件初始捕获的并发顺序（2026-10-07）

原四CI37552830115（da3f5b41）已结束：Python、TypeScript、Desktop成功（含目录/NSIS成品审计），installer 599通过/1失败。失败为 Windows 两个大小写别名并发读取的 capture-interrupted，不是文件已存在。原日志未包含事件dump，不冒称已读到云端首捕获身份；源码追踪给出严格可达竞态，受控事件循环屏障在本机复现同一失败（Task43 RED1）。

Task43 只在首次异步路径检查前预约共享初始捕获，按原规范化别名分组；每个调用仍完整验证路径/当前许可，canonical捕获和原序号守卫保持，实际tools不串行。原三套122/122、九专项9/9及类型0；独立复核与最新facts边界补验待完成。原Task31/33学习证据不重开，不增加第三票/验收标准。因为Runtime源码改变，需要重新构建正式运行包及绑定成品，旧2651归档/旧334输入相同证明仅属前一候选。

目标active，main/Daily仍NO-GO，实际024/preview25未升级，47受保护文件保持。原CI和首次失败留存。D约15.36GiB高于15而未20；旧三次清理自动审批拒绝未执行未绕过。见[tianwen-file-capture-order-result-20261007.md](tianwen-file-capture-order-result-20261007.md)。

以下保留历史记录，以本节为当前状态。

## 原因与范围

observer 原先先 await conversationFilePath，再以小写 canonical alias 登记共享 promise。后一个调用的异步验证可以先完成，成为唯一 preimage 的 callId/callSeq/path。isCreatedFileMissingRead 原 guard 要求 input.callSeq<=每个原 missing call.seq，因此较早的缺失读取被正确拒绝。不能删这一守卫或把已保存身份事后改写。

受控RED在同一原SDK并发step延迟首 new.md path验证，第二 NEW.md 验证完成后通过 setImmediate 屏障释放首项；没有定时睡眠/模型/随机重复。原版本实际1失败，capture-interrupted，与云端症状相同。新 captureReservations 在第一次await前以原recordedFilePath纯规范化字面别名预约第一promise，promise内部仍完整路径验证，并回用原canonical captures。每个caller另验自身路径；chat写/子调用/绝对路径facts不预约，原工具next仍并发，不改 schema/version/判定/许可/撤回/安全规则。

证据全部在 D:/DevData/tianwen-025-release-controller-20261007：task43-capture-order-red-result.json（1失败）、task43-capture-order-green-result.json（9成功）、task43-file-observer-full-result.json（122成功）、task43-runtime-types-result.json（0）。均0真实模型；未把脚本机制当新真实效果研究。

## 下一有限步骤

独立最终复核和改后必要边界检查；提交准确源码原四CI；因为本次Runtime输入改变，重做正式公开构建/打包及同一Desktop候选，固定窗口验证后的83文件摘要供实际交付使用。原受管安装、Web更新、原Desktop原位切换、47数据保护和原mainCI仍要求完成，不在失败时安装Daily。
