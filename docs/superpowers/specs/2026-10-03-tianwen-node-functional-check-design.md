# 隔离 Node 功能检查设计

## 要解决的缺口
当前 TypeScript 生产者只能证明编译及事前约束；发布包的具体功能检查仅支持 Python。补 Node 的实际 JSON 输入/输出执行，使独立的 JavaScript/TypeScript 研发任务能使用原普通任务及研究核验链路。完整自动学习目标、历史与发布要求不变。

## 选择
复用现有 Docker CLI 生命周期和五角色合同，仅增加固定 Node 执行方式。另建执行器会复制清理与隔离边界；在宿主直接执行候选程序会失去既有隔离，均不采用。三个 Node 工厂沿用已有普通、保存研究材料、五角色 cohort 的完整绑定检查。

## 具体范围
- 支持单文件 `.js`/`.mjs` ESM 和 `.ts`/`.mts` 的 Node 原生可擦除类型语法，固定 `node --input-type=module[–typescript] --eval`。不承诺整个项目、外部依赖、tsconfig、枚举转换或类型检查。功能条件必须来自原任务，完整质量另判。
- 公共接口增加三个 `createConversation*IsolatedNode*Check` 工厂及配置类型。宿主固定不可变镜像摘要，不接受模型选择执行器、命令参数或网络权限。
- Node 镜像仅允许 `node@sha256:…` 或 Docker 官方 AWS 发布路径 `public.ecr.aws/docker/library/node@sha256:…`；校验本地 image ID、RepoDigest、Linux/amd64及唯一NODE_VERSION=22.23.1。版本不支持在准备期拒绝，不能伪装原任务功能失败。Docker 默认地址当前连接超时，官方 AWS 地址实际取得 manifest；使用该入口，不更改系统 DNS 或全局 Docker 设置。
- 固定显式 entrypoint=node、只读根、无网络/挂载、非 root、原 CPU/128MB/32 PID/16MB tmpfs/20秒/20KB源码/32KB输出限制。环境只容许官方 Node 元数据和 HOME/TMPDIR。检查身份后执行，所有退出/取消/传输失败原清理机制保持。
- 事前冻结输入、参考、用例、原请求、模型、质量合同；候选不得改变只读参考。复用无损 JSON 比较，不能让 JS 浮点舍入掩盖错误。普通/研究/候选功能失败分别记账；没有原必需条件时仅诊断。
- Python 公共 API、原 checker ID、默认 argv/环境/边界保持；新的源码摘要只用于新准备，不改旧账本/历史身份。共享执行器与工厂不新增业务循环、依赖或宽松启用开关。

## 验证及停止条件
先新能力首红，再普通与研究绑定/错误结果/边界反例及旧机制回归；实际 Docker 新 JS/TS 各正确/错误输出与资源失败，完整包声明和 JS 消费、类型/构建。不能把 mock 或控制数据当自然来源、真实反馈或完整学习效果。只清理本次容器，历史容器身份保持，停止后台，D剩余≥15GiB，尽量20；一次缓存镜像复用，不保留环境全副本。

main/Daily 完整自动学习 NO-GO、正式激活隔离、原同意、原门槛与十工作日窗口保持。正式 Profile 不挂载/不改。当前授权允许自主设计并推进，无需再次索题或请求已有权限。

官方发布依据：https://www.docker.com/press-release/docker-official-images-available-amazon-elastic-container-registry/ 。Node 范围依据：https://nodejs.org/download/release/v22.21.0/docs/api/typescript.html 及本机固定22.23.1的 module-typescript 实测。
