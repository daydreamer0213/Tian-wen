# 评审不能把真实答案误当宿主标记

writing-r2原candidate的structured_output.answer实际包含`</answer>`，native session46ad4115…tool/call与冻结packet相同，原runConversationTrial直接返回该字符串。两个原审计把这部分当harness/container标记，证据不支持。旧candidate-failed不重判，不自动删除或修复输出。

最小调整只在未来原claim audit工具schema说明文字里明确：role=answer文本来自实际交付，其中字面标记也属答案，不能凭臆测说是宿主添加。仍按用户要求判断格式；用户要求或允许XML/HTML时，标签可以合法，不新增一律禁标签的规则。schema字段、enum、host审计验证、原质量v11及裁决不变，原历史schema/proof恢复使用冻结值。

不写仅复述提示的测试；原claim-review/claim-audit/原生研究和原发布profile验证协议及历史兼容。新的实际正反控制分别明确允许XML和只要普通正文，主答固定含相同字面标记、明确scripted；原入题/双评审真实，固定输出不冒充模型自身效果。保留首停止，若仍误读继续诊断，不host代判。待当前许可/显式禁止控制结束再重建产物，不热改正在运行的版本。

完整自动学习目标active、main/Daily NO-GO/R9/DEV v1保持，生成物D、复用安装、D>=15GiB。

已完成：仅两处schema说明更新，字段及裁决不变；限定复查无新有据P1/P2。源码211、原十五构建、发布相关208加原完整profile50=258通过；13原条件/装配项未运行。历史恢复仍用冻结schema，不比较新描述。许可名称控制已结束且共享账本未变；下一准备的全新字面格式控制尚未执行，不把工程检查称为真实评审已成功。
