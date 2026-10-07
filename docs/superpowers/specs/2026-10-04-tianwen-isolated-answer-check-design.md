# 可信宿主答案核验生产者

目的：已有 answerStudyResultCheck 只定义接口，不能产生可信结果。复用原 prepareIsolatedPythonCli，执行事前固定的宿主 verifierSource；模型回答只能进入 stdin JSON，绝不能成为执行源码。不新增执行环境、模型复核或默认语义 oracle。

公开工厂接受一至五份明确材料合同，每项固定 caseId、完整 material、requiredCondition、宿主 verifierSource，另固定 modelConfigDigest 与原隔离配置。工厂创建时复制全部配置，prepare 仅在原完整材料、案例和模型身份精确一致时返回。它不编造独立案例，不提供来源资格，不从回答反推规则；后续独立案例供应必须另沿原原生设计接缝接通。

运行 packet 为 schemaVersion/material/answer/files。文件仅来自原捕获材料，chat 不能写文件；无文件文本只能传空 files。完整 packet 上限沿原32KiB，规则源码沿原20KiB。超限与身份不符不执行且 unverifiable，不截断答案。规则只输出 JSON 布尔 true/false，退出0且无stderr才有效。false 对应事前原条件；规则异常、非法输出、隔离失败不得成为原任务失败。

沿原执行器固定镜像、网络关闭、只读系统、资源上限和取消清理。合同包含生产者源码、宿主规则、完整材料、模型、案例和执行器摘要，原workRoot保存小合同与每次结果收据；核验前核合同未变。执行后保存实际 packet摘要、隔离收据和状态。该工厂的身份绑定不证明宿主规则覆盖开放文本全部语义：宿主必须有独立完整依据，缺失就不供应合同。

范围：工程机制与实际发行工厂/隔离执行分别验证；不新增自然来源、反馈、研究或未来效果，不重跑旧业务样本。R9与main/Daily NO-GO、原门槛及窗口不变，完整目标active/incomplete。
