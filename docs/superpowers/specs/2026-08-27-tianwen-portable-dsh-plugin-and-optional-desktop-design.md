# Tianwen 可移植 DSH 插件与可选桌面发行版设计

日期：2026-08-27

状态：用户已批准

## 1. 结论

Tianwen 的主产品不是一个绑定专用安装器或桌面壳的独立 Agent Runtime，而是一个
可安装到兼容 DeepSeek Harness Profile 的普通 DSH Bundle：

```text
DeepSeek Harness
├── Tianwen Runtime Bundle
│   ├── DSH CLI / headless Profile
│   └── dsh web Profile
├── Tianwen 自带安装器（消费同一 Runtime）
└── 可选 Tianwen-owned Electron 薄壳（消费同一 Runtime）
```

核心 Bundle 只依赖 DSH 的公开插件、Profile、Agent、Session、Goal、Tool 和 Skill
能力，不依赖 Electron、DSH Desktop 或某个特定安装器。用户已有 DSH CLI 时，应能
把 Tianwen 安装进自己选择的兼容 Profile，继续使用原来的 DSH 命令和界面。需要
跨 Run 创建、查询或恢复 Tianwen Goal 时，同一产品包中的 `tianwen` CLI 必须能显式
指向该用户的 DSH home、Profile 和状态根，不能继续假设 Tianwen 托管安装目录。

Tianwen 自带安装器继续保留，作为隔离、已知版本、开箱即用的便利方案。桌面端则
由 Tianwen 提供最小 Electron 薄壳，作为第三种可选分发形式；它只启动已经安装好的
同一个 Tianwen Runtime Bundle。社区 DSH Desktop 仅作为桌面生命周期与 Windows
打包经验的只读参考，不能成为核心产品的上游依赖或第二套 Runtime。

实施顺序固定为：

1. 隔离验证 DSH `0.1.1-rc.2`；
2. 通过后把 Runtime Bundle 产品化为可移植插件；
3. 更新 Tianwen 托管安装器；
4. 最后制作可选桌面发行版。

首期不开发 Tianwen 专属 Web 页面。Goal、Evidence、Learning 等能力先通过现有
Runtime 和 CLI 合同工作，Web 与 Desktop 继续使用 DSH 自带界面。

## 2. 设计时事实快照

### 2.1 2026-08-27 Tianwen 产品基线

当前仓库固定 DSH `0.1.0-rc.7`。`@tianwen/runtime-bundle` 已具备 DSH Bundle
metadata、Cordis patch、公开运行入口和 `tianwen` bin，因此产品依赖方向已经基本
正确。

当前缺口是分发合同，而不是重写 Runtime：

- 包版本仍是 `0.0.0`，并且标记为 `private`；
- 正式安装器把本地 tarball 安装进 Tianwen 自己管理的 DSH host/Profile；
- 尚无把一个正式版本安装进用户已有 DSH Profile 的产品流程；
- 当前 `tianwen create/resume` 仍固定查找托管 `dsh-host`、`dsh-home` 和名为
  `tianwen` 的 Profile，尚不能控制用户选择的现有 Profile；
- 尚未声明和验证新版 DSH 兼容范围；
- 包名、命令名和桌面品牌仍使用内部项目代号 Tianwen。

Tianwen 目前还维护两个精确 rc.7 pnpm patch：

1. `@deepseek-ai/dsh@0.1.0-rc.7`：保持冷 `--dump-config` boot-free；
2. `@deepseek-ai/dsh-app-boot@0.1.0-rc.7`：在 Windows 并发 Profile 准备时原子发布
   文件和链接。

升级不能把这两个产品边界静默丢掉，也不能假设新版仍需要相同补丁。必须先以新版
实际代码和行为分别判断：上游已修复则删除本地补丁；仍有问题才为精确新版移植。

### 2.2 DSH 新版

截至本设计核对时，DeepSeek Harness 官方最新预发布版为
[`dsh-v0.1.1-rc.2`](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.1-rc.2)。
从 rc.7 到该版本的变化包含图像/多模态、Windows 持久 PowerShell、可安装的 Profile
Bundle，以及 Web 启动和界面改进。中间的
[`dsh-v0.1.0-rc.8`](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.0-rc.8)
还明确改变了 SQLite 存储格式，因此这不是一次只改 package version 的升级。

这些能力对未来桌面和普通用户体验有价值，但迁移是否成立必须由 Tianwen 的真实
公开接口、Profile、Session、Goal、Skill、安装器和补丁行为共同证明。

### 2.3 可复用桌面项目

最匹配的现有项目是社区维护的
[`anywhere-labs/dsh-desktop`](https://github.com/anywhere-labs/dsh-desktop)，本设计核对
的版本为 [`v2.0.3`](https://github.com/anywhere-labs/dsh-desktop/releases/tag/v2.0.3)。
它是一个 Electron 桌面发行版，启动 DSH Host/Web UI，并通过 DSH/Cordis 插件增加
窗口、托盘、终端、Profile 管理和更新能力；其
[`architecture.md`](https://github.com/anywhere-labs/dsh-desktop/blob/v2.0.3/docs/architecture.md)
说明了它如何同步固定上游源码。

进一步的源码复核表明，它同时打包完整 DSH 依赖闭包、pnpm、原生模块和多项 rc.2
patch，因此不适合作为 Tianwen 可直接复用的桌面外壳。它适合只读借鉴 Electron
生命周期、Profile 选择和 Windows 打包经验。Tianwen 薄壳必须直接消费已经验证的
Runtime Bundle，不得继承社区发行版的 Runtime、品牌、市场、遥测或自动更新通道。

## 3. 产品依赖边界

### 3.1 核心 Bundle 允许依赖

- 精确验证过的 DSH 公开 package-root API；
- DSH/Cordis 的 Bundle 与 Profile 组合机制；
- DSH 的 Agent Loop、模型、Session、Goal、Tool、Skill 和本地运行能力；
- Tianwen 现有 Runtime、Evidence 与 Evolution 实现。

### 3.2 核心 Bundle 禁止依赖

- Electron、`BrowserWindow`、托盘或桌面 updater；
- `dsh-plugin-desktop` 的 Profile service、pnpm service 或其他桌面私有入口；
- Tianwen 托管安装目录或固定 DSH home；
- 某个特定 Web 页面或桌面窗口生命周期；
- DSH 私有源码路径或复制的上游 Runtime。

若未来出现真实的桌面专属需求，例如原生通知或托盘动作，再增加独立、可选的桌面
适配包。没有具体需求时不预建该包。

## 4. 方案选择

### 4.1 采用：新版验证后产品化通用插件

先验证 DSH 新版，再建立正式 Bundle 版本与安装合同，可以避免围绕 rc.7 完成一次
对外分发后马上重做兼容、补丁和文档。这条路径也最早服务已有 DSH CLI 用户。

### 4.2 不采用：先在 rc.7 对外发布，再升级

它能更早得到一个公开包，但会迫使首期同时承担 rc.7 和 rc.2 两套支持面。当前没有
外部已发布版本需要维持，因此这项兼容负担没有产品价值。

### 4.3 不采用：桌面端先行

桌面先行容易快速产生可见界面，却会推迟最重要的“安装到现有 DSH”能力，并诱导
核心 Runtime 依赖桌面 Profile service 或 Electron 生命周期。它与已确认的产品方向
相反。

## 5. 阶段一：DSH `0.1.1-rc.2` 兼容验证

### 5.1 隔离边界

验证在新的 D 盘工作区、依赖 store、DSH home、Profile 和数据根中进行。不得就地
升级当前正式安装，不读取或迁移历史 Activity、Evidence、debug 或 legacy 数据，
也不得修改用户已有的 DSH Profile。

验证分支只回答“能否迁移、需要哪些最小改动”。在结论成立前，不更新 main 的正式
版本声明，不制作桌面安装包，不调用真实付费 Provider。

### 5.2 必须验证的产品路径

1. Tianwen workspace、Runtime Bundle 和现有测试可以在新版依赖上构建；
2. Bundle 只通过 DSH 公开 package-root API 加载；
3. 全新 headless Profile 能安装 Tianwen Bundle 并完成离线任务；
4. Goal 创建、普通 Turn、Session 持久化、显式 resume、Tool 与 Skill 行为保持正确；
5. 冷 `--dump-config` 仍不触发真实 Profile boot 或创建运行时依赖目录；
6. 真实 Profile boot 能正确准备并加载插件；
7. Windows 并发 Profile 准备不会发布半成品文件或链接；
8. 新旧 SQLite 格式差异被如实识别；仅当目标 Profile 实际使用 SQLite 时验证其
   兼容边界，Tianwen 当前 JSONL Session 路径不因此扩建一套 SQLite 迁移子系统；
9. DSH base、headless、web 和 Bundle 安装命令的实际公开合同被记录；
10. 当前本地两个 rc.7 patch 分别得到“删除、移植或阻塞”的证据结论。

性能验收使用同一机器、同一隔离条件下的多次分项测量，关注相对变化、插件正确加载
和实际副作用，不用单个绝对秒数决定通过。配置 dump 必须继续 boot-free；真实 boot
可以准备运行依赖，但不能出现明显的新回退。

### 5.3 迁移决策

只有以下条件同时成立才进入正式升级：

- Tianwen 承重运行路径和本地全仓门通过；
- 新版 Profile 安装与真实 boot 正确；
- 两个本地补丁都有清晰、可维护的结论；
- 数据格式变化不会破坏或静默覆盖现有用户数据；
- 没有依赖 DSH 私有源码或桌面私有服务。

若新版阻塞核心路径，Tianwen 保持 rc.7 产品基线，记录阻塞事实并停止升级。不得为追
新版而自建第二套 Agent、Session、Profile 或插件系统。

## 6. 阶段二：可移植 Tianwen DSH 插件

### 6.1 包合同

现有 `@tianwen/runtime-bundle` 是唯一核心部署包。通过兼容验证后，它需要：

- 一个真实、可发布的产品版本；
- 取消 `private`，但仅在本地 tarball 验收通过后准备外部发布；
- 精确声明首个支持的 DSH 版本，不先承诺未经测试的宽 semver 范围；
- 保持 Tianwen 内部 workspace 包被编译进单一产物；
- 保持 DSH/Cordis 为外部依赖和公开 API；
- 保持同一 tarball 可用于 headless、web 和 desktop-capable Profile。

当前 `cordis.patch.yml` 中的 `D:/DevData/tianwen-dsh-probe/evolution` 是内部探针部署值，
不是可移植产品默认值。产品化时，Bundle 默认 patch 只负责挂载 Runtime；Evolution、
Evidence 和其他持久状态根必须由目标 Profile 的受信任配置明确提供，或按 DSH 正式
Profile 数据根推导。核心包不得硬编码 Tianwen 托管安装目录、开发机盘符或探针路径。

包名仍暂用 `@tianwen/runtime-bundle`。最终公共名称在外部发布前决定，实施不得把
“Tianwen”硬编码进新的持久数据协议。

### 6.2 可移植与托管入口

同一个产品包中的入口必须明确分层：

- **可移植产品入口：** Runtime Bundle，以及 `tianwen status/list/create/resume`；
- **托管或内部运行入口：** model 配置、live smoke、controlled lifecycle、Natural
  Trial 和安装回执相关 runner。

可移植 `tianwen` CLI 必须接受并验证用户选择的 DSH home、Profile 和 Tianwen 状态
根。它从目标 DSH 安装解析正式 executable，并核对目标 Profile 已安装同版本 Runtime
Bundle；不得再固定查找 `<data-dir>/dsh-host`、`<data-dir>/dsh-home/profiles/tianwen`
或硬编码 Profile 名。准确参数名、DSH executable 解析方式和 package bin 的可发现
调用方式由阶段一对新版 DSH CLI 的真实探测冻结，不能凭 rc.7 记忆猜测。

托管安装器可以为这些目标参数提供已知默认值或包装快捷方式，因此现有内部使用体验
不必变差。托管或内部 runner 可以继续只服务托管部署，但不得被文档描述为已有 DSH
用户的通用入口。产品化实现还应核对 public tarball 的 exports/files，明确保留哪些
托管 runner；不为此拆出第二个 Tianwen Runtime 包。

### 6.3 已有 DSH 用户流程

用户选择自己的 DSH home 和兼容 Profile，通过 DSH 正式插件/Profile 命令安装一个
精确版本的 Tianwen Bundle。实现计划必须先对新版 CLI 做真实探测，再冻结准确命令，
不能根据 rc.7 记忆猜测参数形式。

安装完成后：

- 用户仍从原来的 `dsh` CLI 启动和管理任务；
- headless Profile 获得 Tianwen Runtime、Evidence 和学习治理能力；
- 含 DSH Web Bundle 的 Profile 使用 DSH 原有 Web UI；
- `tianwen status/list/create/resume` 显式指向同一个 DSH home、Profile 和状态根；
- 安装 Tianwen 不创建或替换 DSH Desktop；
- 安装和卸载只影响用户选定的 Profile，不修改其他 Profile；
- Runtime 的持久状态写入该 Profile 明确配置的数据根，不回落到 Tianwen 内部探针目录；
- 不要求用户再安装 Tianwen 的一体化安装包。

首期不增加 Tianwen 专属 Goal/Evidence/Learning 页面。若之后需要可视化，优先使用
普通 DSH Web 插件/slot 合同，使它同时适用于 `dsh web` 和 DSH Desktop。

### 6.4 非破坏性安装、失败与卸载

新增产品路径会修改用户选择的已有 Profile，因此验收不能只检查其他 Profile。使用
DSH 公开安装/卸载机制，对目标 Profile 做前后快照和真实失败探针，必须证明：

- 成功安装只增加 Tianwen package/Bundle 和 DSH 正式产生的必要 lock 变化；
- 原有 Bundle 顺序、其他依赖和插件、用户 patch、模型配置、Session 与状态文件保留；
- 安装前置检查或中途失败时，目标 Profile 的 manifest、lock、patch 和已安装 package
  集合保持原样；若新版 DSH 不能保证这一点，阶段停止并设计最小的目标 Profile 恢复，
  而不是建设新的通用安装器；
- 卸载只移除 Tianwen package/Bundle 组合，不删除 Goal、Evidence、Evolution、Session
  或用户工作区；持久状态清理必须是另一个显式动作；
- 任一操作都不修改未选中的 Profile。

快照用于验证 DSH 原生机制是否满足边界，不成为新的长期备份格式、数据库或事务框架。

### 6.5 发布边界

第一轮使用本地构建的 tarball，在全新 DSH home、已有兼容 headless Profile 和已有
兼容 web Profile 三种环境验证。发布 npm、GitHub Release 或签名安装包属于外部动作，
需要在技术验收完成后单独获得用户授权。

## 7. 阶段三：Tianwen 托管安装器

现有官方安装器继续提供：

- 精确、已验证的 DSH 与 Tianwen Bundle 组合；
- 独立 DSH home、Profile、Session、Evolution 和配置；
- 面向内部使用和不想自行管理 DSH 的用户的一键安装体验；
- 在 `D:\DevData` 或用户明确选择的非系统盘位置保存大型依赖、缓存和运行数据。

安装器与可移植插件必须安装同一个版本、同一内容的 Runtime Bundle。安装器不能维护
一个仅自己可用的 Tianwen 变体，也不能成为已有 DSH 用户的必经入口。

## 8. 阶段四：可选桌面发行版

### 8.1 实现方式

桌面端是 Tianwen 自己维护的最小 Electron 薄壳。它只负责：

- 单实例、桌面窗口、可选托盘与最小应用生命周期；
- 启动已经安装好的 Tianwen Profile 的 DSH Host/Web UI；
- 等待 loopback ready URL，并只在原生窗口中加载该本地页面；
- 退出时回收自己启动的 Runtime 子进程；
- Tianwen 的产品名、图标、数据位置和后续单独决定的更新来源。

薄壳不得再次声明或打包完整 `@deepseek-ai/*` 运行时闭包、pnpm、社区项目 patch、市场、
更新服务或另一份 DSH lockfile。Profile 创建、Runtime Bundle 安装和依赖物化继续沿用
已经验证的 Tianwen 产品流程，桌面启动本身不执行新的包安装。

Tianwen 不复制社区 DSH Desktop 的产品代码来形成第二 Runtime；只读借鉴其生命周期
和 Windows 打包经验。若后续确实采用少量 MIT 源码，才对实际采用内容保留相应许可证、
版权文本和第三方 notices；最终发行物仍需按自己的真实依赖闭包生成 notices。

### 8.2 Profile 边界

桌面 Profile 由 DSH 桌面运行所需的 base/web 组件与 Tianwen Runtime Bundle 组成。
准确层顺序由阶段一对新版 DSH、Tianwen Web Profile 与 Electron ABI 的真实兼容探测
决定，不在本设计中猜测内部服务顺序。

同一个 Tianwen Bundle 必须也能安装到纯 CLI/headless Profile。若某个功能只有桌面
Profile 才能工作，它不能被算作核心 Bundle 首期完成。

### 8.3 更新与数据

Tianwen 桌面发行版不得继续指向 DSH Desktop 社区发行版的品牌或自动更新接口。
首版在没有 Tianwen 自己的签名与发布通道前，应禁用自动更新；建立受控发布通道后
再显式启用。

DSH home、Profile 和大型包 store 优先位于 `D:\DevData` 或用户选择的位置。Electron
必须留在系统用户目录的少量设置和日志应有大小上限，不得静默把依赖闭包复制到 C 盘。

## 9. 命名策略

`Tianwen` 是内部项目代号，不是必须保留的公共品牌。`LearnLoop` 可以作为候选名，
但在采用前需要检查 GitHub、npm、域名、商标和同类产品重名。

命名不阻塞 DSH 兼容验证。现有 schema 字段、service id、Session/Goal 前缀、环境变量、
receipt 字段和托管 Profile 技术身份中的 `tianwen` 冻结为内部协议命名空间；即使公共
品牌改变，也不为了显示名称重写历史数据或维持两套协议 alias。

公共包首次发布和桌面安装包首次对外分发之前设置一次明确决策点，然后一次性确定：

- npm scope/package 名；
- CLI 命令；
- 安装器与桌面产品名、图标；
- 默认 Profile 名；
- 面向用户的新文档。

最小选择是只改变显示品牌，保留所有技术名称。若决定同时改变首次公开包名、CLI 或
新安装的默认 Profile 名，必须在首次外部发布前完成；已有托管 `tianwen` Profile 只
允许一次明确迁移，不建设永久双名称兼容层。

历史 Activity、Evidence、operation handoff、旧提交和既有数据继续保留当时的 Tianwen
名称，不重写历史证据。

## 10. 验收矩阵

同一版本、同一内容的 Runtime Bundle 至少通过以下入口：

| 入口 | 必须证明 |
| --- | --- |
| 已有 DSH headless/CLI Profile | 安装、普通任务、Goal、Session、resume、Tool、Skill 和卸载正确 |
| 已有 DSH web Profile | DSH Web 正常启动，Tianwen Runtime 加载，原有 Web UI 不被替换 |
| Tianwen 托管安装器 | fresh install 使用精确 DSH/Bundle，数据位于受控根目录 |
| 可选桌面发行版 | 窗口启动正式 DSH Web Host，预装 Tianwen Bundle，退出和重启正确 |

所有入口还必须保持：

- 冷 dump boot-free；
- 真实 boot 正确加载插件；
- 不读取或修改无关 Profile；
- 目标 Profile 安装失败后保持原样，卸载后保留持久状态；
- 不依赖 DSH 私有源码；
- Runtime Bundle 不依赖 Electron 或 desktop plugin；
- Runtime Bundle 不硬编码内部部署、探针或开发机状态路径；
- 大型生成数据不写入 C 盘；
- 本地全仓门通过。

真实 DeepSeek 任务用于产品级最终 smoke，不用于替代可重复的兼容单元与离线集成测试。
同一发布候选只需一次受控真实运行；失败应如实报告，不通过反复运行挑选较好结果。

## 11. 明确不做

- 不创建新的 controlled Activity 或复制历史 15-task/25-role 流程；
- 不开发 Tianwen 专属 Web 面板；
- 不自建桌面框架、Agent Loop、Session、Profile 或插件市场；
- 不把 DSH SQLite 格式迁移扩建成 Tianwen 子系统；
- 不同时承诺 rc.7 与 rc.2 的长期双版本支持；
- 不自动迁移或清理旧 SQLite、Activity、Evidence、debug 或 legacy 数据；
- 不向 DSH 上游推送 Tianwen patch；
- 不在技术验证前发布 npm 包、GitHub Release 或桌面安装包；
- 不先增加通用遥测、重试、预算、安全门或更新框架。

## 12. 本阶段完成标准

本设计阶段完成于：

1. 用户确认依赖方向、首期无专属 UI、实施顺序与命名延期策略；
2. 本设计进入仓库并通过自审；
3. 后续实施计划把工作拆成新版兼容验证、可移植插件、托管安装器和桌面发行版四个
   独立门，不把它们合成一次大爆炸升级。

本设计提交本身不代表 DSH 迁移、插件发布或桌面产品已经完成。
