# E046–E047 受控真实任务：审核材料上限与引文候选边界

**结论：**两轮均从准确提交 `aae1ee59066ab7967329b251df13597f0e4c7e18` 的同一产品包前瞻运行，各用全新隔离配置档和新任务。E046 的四份文件共 102,964 字节，主任务完整读取，但审核材料在准入时超限，结果为 `inconclusive / material-too-large`，没有原结果审核者。E047 收窄到三份文件共 34,917 字节，完整读取后两位独立原生审核者都提交了整份逐条审计；第一份有效，第二份有三处非逐字引文，宿主正确拒绝，结果为 `inconclusive / invalid-judgment`。**两轮都不是双审核通过。** 两轮均无研究，main/Daily 保持 NO-GO。

## 冻结与可核验过程

候选包 SHA-256 为 `62aa3555d731d5cd5565059cf53ed6a4e2c2677d74b5ca3ecbca728885813557`。E046 四份文件为 3,748、5,320、25,849、68,047 字节；五次原生 `read` 留下完整文件证据。任务 ID 为 `conversation-task:c8518d2bbe12fb227b483ac00916120fb5caa977f32fcf3d8ceae839ad3d39d3`，回答长度 9,225 个 JavaScript 字符单元，SHA-256 为 `sha256:ab3581012f022d2f221a24de00e7c5f5baa764abd671a7d38fe92d5e4356618f`。独立终态审计在 `D:/DevData/tianwen-acceptance-runs/046-controlled-audit-cap/native-use/evidence/audit-046-final.json`，状态 `completed`，SHA-256 `fe45f78239480f9f4cd251fd5aeec55af60339ace7bbf6470eb4b8def378557d`；五份 Session 导出审计 SHA-256 为 `678479bad1304000e78c15ab65b6c6cddcbfb28e2a24cc784691314637f435b2`。

E047 仅保留前三份文件，三次原生 `read` 覆盖 19/19、93/93、319/319 行。冻结清单 SHA-256 为 `a069232e7aa95605313e08ee398d0209027185b130b72d093cc9bc4790abc5aa`。任务 ID 为 `conversation-task:abd9002d8492fc4a76ead49ec73a95df2db8f51bcba0f3902b6a5b2b509665c5`，回答长度 9,521 个 JavaScript 字符单元，SHA-256 为 `sha256:04c64853e7a472503b807c399c4f3b9860945fbd03319d98b691e08a82a017c4`。两份原结果审核的原生 Session 分别为 `05350d19-9ae3-4610-80e4-c06af7d4c9af`、`a1cbd3e6-abbb-4313-8e9c-afe7cb117847`，逐条审计分别为 35,586、38,108 字节，均超过旧 32 KiB 上限，但在新 128 KiB 上限内。第一份经离线宿主校验有效，第二份的 `answer-62`、`answer-67`、`answer-92` 引文不属于各自回答单元。两份原生工具调用虽都记录成功，产品没有保存有效双审核结果或触发研究。独立终态审计在 `D:/DevData/tianwen-acceptance-runs/047-controlled-audit-cap/native-use/evidence/audit-047-final.json`，状态 `completed`，SHA-256 `95c4eaa0df329f6c58670058123bfa9daa7d5402cc59e94d69922698e8856758`；七份 Session 导出审计 SHA-256 为 `50c98dd4c05389778ebf27c3460ededc64f18f5b0aba8f0497026e3cdd679647`。

两轮的同意均关闭至 revision 2 / `enabled:false`，测试 host 已停止，研究数为零。两轮都限定只用原生 `read`，因此不构成自然文件查询的产品验收。

## 原因与下一关

E047 回答有 94 个单元，双位置引文候选合计 70,820 字节，超过原来 65,536 字节的全局预算；整个工具模式于是退回自由文本引文。第二位审核者在三个单元改写或跨单元复制原话，严格宿主校验按设计拒绝。开发分支把这一有界预算提高至 98,304 字节；94 单元回归测试先在旧预算失败，再于新预算通过，128 单元近上限用例仍使用自由文本并保留严格校验。设计见[引文预算修正](../superpowers/specs/2026-09-27-tianwen-medium-answer-quote-choices-design.md)。这是工程证据，须从新准确提交做全新真实任务。自然目录、行数、哈希查询的原生证据另行实现与验收，不以受控只读任务代替。

本轮对话相关 21 组回归 **566/566 项通过**，八个包的 TypeScript 类型检查通过。该测试成绩不改变 E046/E047 的原生裁决。
