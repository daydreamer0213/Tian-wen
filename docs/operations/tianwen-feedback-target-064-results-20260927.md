# E064：两项先前任务中的明确归因与真正歧义反馈

**结论：main/Daily NO-GO。**在全新隔离配置档中，同一会话先完成两份不同摘要后，明确指向较早 E063 摘要的持续偏好直接关联到较早任务，并产生一份 `preference / user-preference` 原生反馈评估。另一新会话也先完成两份摘要；随后反馈明确表示“其中一份，但未指定是哪份”，首次准入与第二次归因复核都保留 `relatedTaskId:null`，没有为它启动反馈评估。这只验证了本轮两种受控文字的归因边界，不能外推为所有歧义表达安全，也不是完整学习链路或发布证明。

运行目录为 `D:/DevData/tianwen-acceptance-runs/064-feedback-target-multi`。当前分支准确提交 `31d67ef`，相对运行时提交 `4e52733330c7bba344194cd1d8091ac93e0ebe66` 仅有文档变更；复用 E063 准确安装包 SHA-256 `ee01e31d64be3ad7c49fe8750aacb64e2e051def1b5aa734379a66095eb7e9ae`，安装后的 `dist/runtime.js` SHA-256 `1e0355e6cb2f9059ccca9a9ec40281097f6c3ffb740ed1a02dcdb3edc6356f84`。首次任务前冻结协议、四项普通任务、两条反馈与包，`freeze.json` SHA-256 `ab25bcae32b6c9920b16d87f3ff0f3ac1c718a70cda037d174235cea5f2d271b`；六条输入的原生准入请求均与冻结文本去掉末尾换行后逐字一致，歧义反馈因第二次复核出现两份相同请求。包与依赖、会话和生成数据都在 D:。

正例 A：A1（E063 摘要，任务 `conversation-task:829d4a4a697700576422e99ab6f1f25d419a6392bc09c068ffd752adea316af8`）和 A2（E061 摘要，任务 `conversation-task:96df19dd6aaedfe2d78118f26f9d722e57a7e89ffcdd621c4d47075d6b1ea522`）都只在聊天回答、没有工具调用或文件副作用，各有两份独立 `met` 审核。读到实际答案后，按冻结原话发送 `feedback-A.txt`，明确指向第一份且排除第二份。原生准入 Session `25804986-b962-4ac5-ac7d-e8a19fd9e671` 的 `priorTasks` 同时包含 A1 和 A2；它直接返回 A1 的准确 ID，因此无需第二次归因复核。终态随即保存一份 `preference / user-preference` 反馈评估，原生评估 Session `09d206b2-0739-4062-9d10-2eca30fe8ee3`，标准仅面向今后同类摘要，不追溯改判 A1。

负例 B：B1（E058 摘要，任务 `conversation-task:762c5a86d343105d31b18adfafdc458ca99424ce64b6a52f5421c2e0db46ad10`）和 B2（E060 摘要，任务 `conversation-task:9d7adb42c8a77c3fcfa9fc67a27edb1748dc4ee6a71d9447c596624cf4341bed`）同样各获两份独立 `met`，只在聊天回答，隔离输入目录终态为空。读后按冻结原话发送 `feedback-B.txt`，它明确要求不要猜目标。首次准入 Session `b5d34539-2f12-44f6-8249-e69748d59d63` 和第二次复核 Session `e85f2e17-abef-41e6-9a99-511da79aee2b` 都识别 `preference`、都看见 B1/B2 两个先前任务、都返回空关联；终态没有第二份反馈评估。

只读审计覆盖 20 份原生 Session，19 次工具调用中 17 次为结构化模型提交、2 次为同意开关，没有普通任务文件或命令工具调用。原生摘要 `native-use/evidence/audit-064-native.json` SHA-256 `7277484f0d26ee8134dd0820db75eab4f7bfa120a516766ef084f6289bcc7eea`；完整准入材料 `native-use/evidence/admission-material-064.jsonl` SHA-256 `8290bab2f9562a2e8665fe3889b9c581d7af12d50f3b57f6602fba58c8331ea4`；终态账本 SHA-256 `18a1d2ac2c9e13364f52945134b304f2c289c516624672c9ce5f78b761fd2b82`。隔离档同意从 revision 1 / `enabled:true` 关闭到 revision 2 / `enabled:false`；host PID 4312 已停止，浏览器页已关闭。两条反馈轮的普通任务审核为 `inconclusive`，关闭轮为 `inconclusive / cancelled`，均不计入四项摘要的质量结果。研究与方法激活为零。

**下一阶段：**归因已有明确先前任务、唯一先前任务全局偏好、两任务歧义三种前瞻观察，但不能用这些样本凑出学习改善。下一项若继续自动学习，应重新冻结两条不同输入的同族自然反馈与成功对照，核查产品自行打开的研究、试验答案语义、采用决定、实际方法激活和之后任务效果；任一门槛未过即停止。E062–E064 不回填或重判。E061 的量词范围语义缺口也须单独验证，不能由本轮反馈归因结果代替。
