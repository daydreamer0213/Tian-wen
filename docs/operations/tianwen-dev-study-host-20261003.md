# 固定 DEV 宿主研究结果入口已补齐

本轮完成一项实际工程接入，完整自动学习仍 **active/incomplete**。原开发入口现在可消费实际公开包的普通、单研究和五角色研究结果工厂，共用固定执行配置，不另建研究循环。配置装配和自然学习分别记账，main/Daily 完整学习 **NO-GO** 保持。

## 交付及实际验证

事前设计提交 `026d480`，修改 `scripts/development-isolated-node-check.mjs`：保留原 `createDevelopmentIsolatedNodeCheck`，增加 `createDevelopmentStudyIsolatedNodeCheck` 和 `createDevelopmentStudyIsolatedNodeCohortCheck`。通过原发布清单 `.default` 加载实际发行根；固定宿主JSON及两个发行JS全字节不变。

单研究按原目标路径选固定JS/TS执行配置；五角色分别从完整保存材料的唯一outputPath选择配置。顶层/每角色的 `isolated` 覆盖全部拒绝。原条件、请求、质量、模型、案例/期望不改，原SDK仍负责精确五角色、原来源顺序、完整材料及模型绑定；不新增来源资格、Agent、默认启用或宽松开关。

新增16项默认Node测试，首红7通过/9失败，第一项明确缺新导出，不是缺依赖；实现后16/16通过。覆盖普通原API、单研究、完整保存材料供应、来源顺序/请求/参考/模型/质量漂移、每角色覆盖拒绝、缺角色/多输出、未知角色/材料/模型及取消。运行：`node --test scripts/development-isolated-node-check.test.mjs`。

唯一新实际控制使用固定缓存Node22.23.1，共五角色准备及五个不同功能合同；JS三项与TS两项分别使用原固定配置，不把语言及目录同时变化说成单一语言因果实验。JS source1和TS adjacent各真实执行一次，均verified；改变已保存criteria后在执行前返回unverifiable，未增加容器。普通工厂和单研究工厂的薄入口结果与同配置/同条件的直接公开工厂逐字段精确相同，旧原生任务的checker代码/执行器摘要保持；这不把本控制的新条件改成旧任务条件。

实际发行runtime子入口在原完整装配下接收普通检查及研究检查；既有loop登记的研究hook与传入对象精确相同。正式Profile只读状态仍awaiting-compatible-sources，因此运行期供应/准备均0、模型/脚本请求0、研究0/隔离true，完整账本全字节不变。**这只证明API与宿主可组合，不表示已为未来任意任务持续注册一套研究合同，也不表示原自然来源形成研究。** 未来驱动仍须在案例设计前提供合法组的五角色原材料、检查依据和条件。

## 原事实及资源

正式档案完整SHA256仍 `bc1b30d23c2d228492bbd9c6b2eb5901e0ac20798c51e3caf6881ddd08a6f586`，继承15观察/14识别完成/0反馈评估/0研究及上一轮原功能失败。没有新自然任务、反馈、研究、启用或未来自然收益，未修改或重判旧来源。原同意、正式隔离、身份算法、门槛及十工作日窗口不变。

两自有容器边界/清理核验通过，历史84ID精确保持，原JS回执及TS历史均保留；五个小合同及两回执留在固定共享目录，不复制环境。fixture参考文件与目录已移除，临时执行目录0、Docker后端0；本轮运行根约65KB、0下载/档案副本，D约18.66GiB≥15，未达20偏好。首终审误将Windows已解析cwd与正斜线文本直接比较，保存初始日志后按路径语义纠正，未重新执行控制、改功能期望或原结果。

运行根 `D:/DevData/tianwen-dev-study-host-20261003`：`red.log`、`green.log`、`frozen.json`、`control.mjs`、`control.log`、`result.json`、`cleanup.json`、`initial-audit-control-failure.log`、`final-audit.json`。独立只读审查无有据P1/P2；精确DEV交付以git HEAD及运行根remote-final.json核对，不合并/发布main/Daily。

## 下一实际重点

本接线已完成，不重复16项控制、两次运行或已完成的全研究生命周期。下一转向**实际核心模块开发的行为核验覆盖**：当前Node具体生产者明确只支持单文件ESM JSON CLI，不能把它的通过当作多文件项目功能正确；既有结果接口允许其他受信宿主生产者。先选择现有核心源码待办/测试并核对捕获材料与执行接缝，在真实缺口成立后复用现有测试与隔离执行能力，避免再追加维护小工具或另造通用平台。工程可独立推进，合法重复问题及未来收益仍必须从实际结果获得，不向所有者索题/催评价、不制造第二失败或改条件拼来源。
