# 失效的未完成反馈不再永久阻止学习

当前Runtime问题选择、已检查成功对照、可选反馈线索与Ledger相应三道写入核验都对全部历史assessment执行result缺失判断。原isConversationFeedbackAssessmentActive已按原Session lifecycle/原message反馈版本/原指纹与撤回状态判断有效性；其他反馈否决都用这项规则，pending否决却漏掉，导致进程中断留下pending后，用户撤回/替换也不能解除。

只在六个现有pending guard中加同一原active条件，不增加新API/标准/来源、重评旧反馈、补写取消或重启原模型。原有效pending仍必须等待；当前正/负反馈、最新有效偏好、源码检查身份/独立输入/双审/模型/同意/隔离/十日窗口全部保持。对已经失效pending只不再施加否决，历史started缺result如实保留。

原已有工程fixture验证：来源/对照×撤回/替换4场景先红，替换尚pending仍挡；替换完成后可选择、写原attempt/study并冷恢复，原Task与全部反馈assessment原样。原现有proposal clue场景增加撤回/替换历史pending，及Runtime clue当前有效pending/失效pending两方向；这些是工程控制，不是新增公开练习/真实反馈/自然研究信用。

发布所有原Runtime构建步骤，针对原来源/账本/反馈/文件研究的回归和独立复查；真实正式/持续两账本不挂载不修改。生成物D，无环境复制/模型/自然Task/激活；原71拒删根保持。主目标active，main/Daily NO-GO，语义安全和自然研究效果未证明。
