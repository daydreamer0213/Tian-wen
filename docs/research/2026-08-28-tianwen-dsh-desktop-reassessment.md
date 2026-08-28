# Tianwen 下一阶段 DSH Desktop 复用方向复核

日期：2026-08-28
状态：只读上游调研；用于修正 Desktop 复用判断，不是集成验收记录。

## 结论

- **直接复用 `anywhere-labs/dsh-desktop` 的成品或代码：No-Go。** 它虽锁定 Tianwen 当前精确使用的 `@deepseek-ai/dsh@0.1.1-rc.2`，但自身携带完整 DSH 依赖闭包、pnpm、原生模块和大量对 rc.2 包的 patch。这会产生第二套 Runtime，且不再等同于 Tianwen 已验证的 runtime tarball。
- **借鉴其 Electron 生命周期和 Profile 管理思路：条件 Go。** Tianwen 可以保留“桌面壳启动已有 Profile 的 Web Runtime、等待 loopback ready URL、在原生窗口中加载、退出时回收”的边界；必须由 Tianwen 自己的薄壳直接消费既有 `@tianwen/runtime-bundle@0.1.0`，不得把另一套 DSH Runtime 打进安装包。

这里的“条件 Go”不授权现在实现更新、遥测、签名、插件市场或新的 Runtime 管理框架。它只确定后续最小验证应验证的方向。

## 对已批准设计的纠正

既有 approved design 中“复用社区项目 DSH Desktop”的表述需要收窄为：

> 可以只读借鉴社区项目的桌面生命周期、Profile 选择和 Windows 打包经验；不得直接嵌入、fork 后作为 Tianwen Runtime，或随其一同分发其自带 DSH 依赖闭包、patch、pnpm、更新服务、市场和品牌。

这一修正不改变“DSH 是唯一正式 Agent Runtime、Tianwen 只做薄适配与治理”的产品边界；它排除了把社区桌面项目本身变成第二 Runtime 的误解。

## 已证实事实

### 1. anywhere-labs 当前状态与 rc.2 关系

- `anywhere-labs/dsh-desktop` 当前正式 Release 是 **v2.0.3**，发布于 2026-08-26；tag 为 `681ba66091fc5b1e827650137f69b3ee4c435922`。见 [v2.0.3 Release](https://github.com/anywhere-labs/dsh-desktop/releases/tag/v2.0.3)。
- 默认 `master` 在本次核对时是 `07633418c5f7c50d36f7e012071153d3cb8f5a94`（2026-08-27），比 v2.0.3 前进 12 commits，尚无更高正式 Release。见 [master commit](https://github.com/anywhere-labs/dsh-desktop/commit/07633418c5f7c50d36f7e012071153d3cb8f5a94) 与 [比较页](https://github.com/anywhere-labs/dsh-desktop/compare/v2.0.3...master)。
- 它的 `upstream.json` 把上游固定为 DeepSeek Harness `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`，source/runtime version 都是 `0.1.1-rc.2`。该 SHA 正是官方 `dsh-v0.1.1-rc.2` tag。见 [锁定文件](https://github.com/anywhere-labs/dsh-desktop/blob/07633418c5f7c50d36f7e012071153d3cb8f5a94/upstream.json) 与 [官方 rc.2 release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.1-rc.2)。
- 根 workspace 对 `@deepseek-ai/dsh`、`dsh-web-app`、agent loop、多项 UI 包、Windows ACL 等 rc.2 包应用 Yarn patch；`dsh-plugin-desktop` 又直接声明大批 `@deepseek-ai/*` 生产依赖。见 [根 manifest](https://github.com/anywhere-labs/dsh-desktop/blob/07633418c5f7c50d36f7e012071153d3cb8f5a94/package.json) 与 [桌面 manifest](https://github.com/anywhere-labs/dsh-desktop/blob/07633418c5f7c50d36f7e012071153d3cb8f5a94/dsh-plugin-desktop/package.json)。

因此，“同为 rc.2”只证明版本家族一致；不能证明 Anywhere 的运行时与 Tianwen 已验证 tarball 相同。

### 2. Electron、Windows installer 与 Runtime 形态

- 技术栈是 Electron `43.4.0`、Electron Builder `26.15.7`、Yarn `4.18.0`，开发 Node 要求为 `^22.19.0 || >=24.0.0`。见 [根 manifest](https://github.com/anywhere-labs/dsh-desktop/blob/07633418c5f7c50d36f7e012071153d3cb8f5a94/package.json) 与 [桌面 manifest](https://github.com/anywhere-labs/dsh-desktop/blob/07633418c5f7c50d36f7e012071153d3cb8f5a94/dsh-plugin-desktop/package.json)。
- Windows 目标是 x64 NSIS；`app.asar` 启用，但 `node_modules/**`、pnpm、native modules 等进入 `app.asar.unpacked` 的物理路径。Windows 打包脚本先执行完整 gate，再构建**未签名** installer；Authenticode 签名明确是另一发布步骤。见 [build 配置](https://github.com/anywhere-labs/dsh-desktop/blob/07633418c5f7c50d36f7e012071153d3cb8f5a94/dsh-plugin-desktop/package.json) 与 [Windows 打包脚本](https://github.com/anywhere-labs/dsh-desktop/blob/07633418c5f7c50d36f7e012071153d3cb8f5a94/dsh-plugin-desktop/scripts/package-win.ts)。
- 这不是单纯调用系统已有 DSH 的壳：发布包有自己的 DSH 依赖树、内置 pnpm、`node-pty`、`koffi` 等 target-native 依赖及其闭包验证。见 [运行时闭包检查](https://github.com/anywhere-labs/dsh-desktop/blob/07633418c5f7c50d36f7e012071153d3cb8f5a94/dsh-plugin-desktop/scripts/runtime-closure.mjs) 与 [架构说明](https://github.com/anywhere-labs/dsh-desktop/blob/07633418c5f7c50d36f7e012071153d3cb8f5a94/docs/architecture.md)。

### 3. Profile 创建、预装与启动入口

- Electron main 以 `@deepseek-ai/dsh-app-boot` 启动 Host Cordis root；默认 desktop profile 名称为 `desktop`。当没有 Profile 时，`beginDesktopProfileStartup()` 经 `createDesktopWebProfile()` 从官方 `web` template 创建该 Profile。见 [main 启动入口](https://github.com/anywhere-labs/dsh-desktop/blob/07633418c5f7c50d36f7e012071153d3cb8f5a94/dsh-plugin-desktop/src/main.ts) 与 [Profile 创建/选择](https://github.com/anywhere-labs/dsh-desktop/blob/07633418c5f7c50d36f7e012071153d3cb8f5a94/dsh-plugin-desktop/src/profile-manager.ts)。
- 其 profile composition 以官方 `dsh-base` 和 `dsh-web-app` 为 carrier，并在启动前执行 fallback 修复、层叠 patch 与必要时的 pnpm materialization。见 [Profile composition](https://github.com/anywhere-labs/dsh-desktop/blob/07633418c5f7c50d36f7e012071153d3cb8f5a94/dsh-plugin-desktop/src/profile.ts) 与 [materializer](https://github.com/anywhere-labs/dsh-desktop/blob/07633418c5f7c50d36f7e012071153d3cb8f5a94/dsh-plugin-desktop/src/profile-materializer.ts)。
- `cordis.patch.yml` 注入 desktop shell、terminal、diagnostics、notifications、pnpm、profiles 与 updates；并将 `web-runtime` 的自动开浏览器和打印 URL 关闭。见 [Desktop patch](https://github.com/anywhere-labs/dsh-desktop/blob/07633418c5f7c50d36f7e012071153d3cb8f5a94/dsh-plugin-desktop/cordis.patch.yml)。
- 其市场 provider 默认是 `disabled`，但项目自身把 market 相关 package 和 `dshmarket` 放入生产依赖。这仍是其桌面 Runtime 的组成，而不是 Tianwen 需要预装的能力。见 [市场状态代码](https://github.com/anywhere-labs/dsh-desktop/blob/07633418c5f7c50d36f7e012071153d3cb8f5a94/dsh-plugin-desktop/src/desktop-market.ts) 与 [桌面 manifest](https://github.com/anywhere-labs/dsh-desktop/blob/07633418c5f7c50d36f7e012071153d3cb8f5a94/dsh-plugin-desktop/package.json)。

### 4. branding、数据、更新、遥测

- appId 是 `ai.deepseek.dsh.desktop`，产品名是 `DSH Desktop`。其 README 还包含社区市场、赞助商和 DSH Desktop 专属品牌内容。见 [桌面 build 配置](https://github.com/anywhere-labs/dsh-desktop/blob/07633418c5f7c50d36f7e012071153d3cb8f5a94/dsh-plugin-desktop/package.json) 与 [README](https://github.com/anywhere-labs/dsh-desktop/blob/07633418c5f7c50d36f7e012071153d3cb8f5a94/README.md)。
- Desktop 私有数据位于 Electron `userData`，Windows 默认目录为 `%APPDATA%\\DSH Desktop`；日志在 `logs/`，DSH Home/Profile 由 `DSH_HOME` 解析。见 [CLI 数据目录函数](https://github.com/anywhere-labs/dsh-desktop/blob/07633418c5f7c50d36f7e012071153d3cb8f5a94/dsh-plugin-desktop/src/bin.ts) 与 [架构说明](https://github.com/anywhere-labs/dsh-desktop/blob/07633418c5f7c50d36f7e012071153d3cb8f5a94/docs/architecture.md)。
- 自动更新默认在启动后 60 秒检查、此后每 6 小时检查 `https://www.dshdesktop.cn/api/desktop/version`；固定版本检查会附带持久化随机 UUID 的 installation-id header。见 [更新策略](https://github.com/anywhere-labs/dsh-desktop/blob/07633418c5f7c50d36f7e012071153d3cb8f5a94/dsh-plugin-desktop/src/updates.ts)、[端点/header](https://github.com/anywhere-labs/dsh-desktop/blob/07633418c5f7c50d36f7e012071153d3cb8f5a94/dsh-plugin-desktop/src/update-checker.ts) 与 [installation-id](https://github.com/anywhere-labs/dsh-desktop/blob/07633418c5f7c50d36f7e012071153d3cb8f5a94/dsh-plugin-desktop/src/desktop-installation-id.ts)。
- Crashpad 的实现明确 `uploadToServer: false`，即本地 crash evidence；DSH 遥测 opt-out 则仍走 `DSH_TELEMETRY_DISABLED`。见 [crash evidence](https://github.com/anywhere-labs/dsh-desktop/blob/07633418c5f7c50d36f7e012071153d3cb8f5a94/dsh-plugin-desktop/src/crash-evidence.ts) 与 [Profile 遥测处理](https://github.com/anywhere-labs/dsh-desktop/blob/07633418c5f7c50d36f7e012071153d3cb8f5a94/dsh-plugin-desktop/src/profile.ts)。

### 5. 许可证与 notices

- Anywhere 的自身代码为 MIT，要求在副本或实质部分保留其版权与许可；它的 NSIS 配置把 `THIRD_PARTY_NOTICES.md` 作为安装页 license。见 [Anywhere LICENSE](https://github.com/anywhere-labs/dsh-desktop/blob/07633418c5f7c50d36f7e012071153d3cb8f5a94/LICENSE)、[桌面 build 配置](https://github.com/anywhere-labs/dsh-desktop/blob/07633418c5f7c50d36f7e012071153d3cb8f5a94/dsh-plugin-desktop/package.json) 和 [第三方 notices](https://github.com/anywhere-labs/dsh-desktop/blob/07633418c5f7c50d36f7e012071153d3cb8f5a94/dsh-plugin-desktop/THIRD_PARTY_NOTICES.md)。
- 官方 rc.2 本身为 MIT，但官方 notices 明确将完整 npm closure 的精确版本交由 lockfile 记录；不能把“上游是 MIT”简化为“任意桌面安装包只需一个 MIT 文件”。见 [官方 LICENSE](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/LICENSE) 与 [官方 third-party notices](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/THIRD_PARTY_NOTICES.md)。

## 合理推断：Tianwen 最小适配边界

以下是从上述源码结构得出的设计推断，不是已实施事实。

1. Tianwen Desktop 应只包含 Electron 壳的最小职责：单实例、窗口/托盘、启动与关闭已有 Runtime、loopback readiness、日志位置和受限页面导航。
2. 唯一 DSH Runtime 必须是已验证的 `@tianwen/runtime-bundle@0.1.0` tarball 所安装的 Profile/runtime tree。薄壳不得在生产依赖中再次声明 `@deepseek-ai/dsh`、完整的 `@deepseek-ai/*` 运行时子包、pnpm 或另一套 DSH lockfile closure。
3. Profile 的初始化、Tianwen bundle 的安装和任何依赖物化应沿用既有 runtime-bundle 流程；桌面启动时不应重新 npm/pnpm 安装 DSH，也不应为了恢复而引入第二套 package manager Runtime。
4. 桌面壳可遵循“启动既有 profile 的真实 `dsh web` → 只监听 loopback → 等待 ready URL → Electron 加载同源 Web UI → 退出时回收子进程”的顺序，但不能复制 Anywhere 的 Cordis patch、市场、产品名、appId、网站、更新端点、installation ID 或赞助/商标表述。
5. 任何后续安装器都应对 Tianwen 实际随包分发的闭包重新生成 notices；不能复用或声称满足 Anywhere 的 notices。DeepSeek/DSH 名称的使用必须另行进行非官方和商标表述审查。

## 未知项

- `@tianwen/runtime-bundle@0.1.0` 安装后的物理目录、CLI entry 与裸包解析路径，是否可由 Electron 的 Node 环境直接启动。
- 该 tarball 是否已携带 desktop profile 所需的可组合 bundle/patch；若没有，最小 Tianwen desktop 层应通过哪个既有公共 seam 挂载。
- rc.2 的 Windows native modules，特别是 `node-pty`、`koffi`、sandbox 相关包，是否与选定 Electron Node ABI 兼容。
- Tianwen 最终应用数据根、安装器、签名、更新和出站数据策略。它们是产品决策，不从社区项目继承。
- Tianwen tarball 的完整依赖闭包、随包文件及每一项 notice 是否满足最终再分发要求。

## 其他官方或社区方向

- **官方项目：未发现官方 Desktop 产品。** 官方 rc.2 README 的运行入口仍是 `npx @deepseek-ai/dsh web`，且项目明确处于会发生破坏性变更的 developer preview。见 [官方 README](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/README.md)。
- **`dataelement/dsh-desktop`：可作工程参考，不宜直接复用。** 它当前维护活跃、精确 rc.2、支持 Electron/NSIS；但同样直接打包 DSH 和大量子包，使用 patch-package、pnpm、更新与附加能力，仍不符合唯一 Runtime 边界。见 [仓库](https://github.com/dataelement/dsh-desktop)、[架构](https://github.com/dataelement/dsh-desktop/blob/d92384a5dcf56ee9c95371f5cf35f357b988bd19/docs/architecture.md) 与 [manifest](https://github.com/dataelement/dsh-desktop/blob/d92384a5dcf56ee9c95371f5cf35f357b988bd19/package.json)。
- **`foolgry/dsh-desktop`：更接近薄 Electron 壳，但仍不应直接采用。** 它声明 rc.2，却预装 `dshmarket`、自行维护 DSH Home、安全模式和自动更新，并以多项 `^` 范围直接依赖 DSH 子包；当前根目录也没有可核对的 LICENSE/第三方 notices 文件。见 [manifest](https://github.com/foolgry/dsh-desktop/blob/52a164e1983a76ab892f5bdc0298df7d2298db39/package.json)、[Electron Builder 配置](https://github.com/foolgry/dsh-desktop/blob/52a164e1983a76ab892f5bdc0298df7d2298db39/electron-builder.yml) 与 [启动/预装逻辑](https://github.com/foolgry/dsh-desktop/blob/52a164e1983a76ab892f5bdc0298df7d2298db39/src/main.ts)。

## 最小后续验证清单

这些是下一阶段的验证门，不是当前集成结果。

1. 在干净的 Windows 用户数据目录中，只使用现有 Tianwen runtime tarball 建立目标 Profile；核对解析到的 `@deepseek-ai/dsh` 实例只有该 Runtime 一份。
2. 用 Electron 自带 Node 启动该 Profile 的真实 `dsh web`，固定 Tianwen 的 `DSH_HOME`；验证 loopback ready URL、WebSocket 连接和应用退出后的子进程回收。
3. 对同一 Profile 分别运行 Tianwen 已有 headless/Web 入口与候选 Desktop 入口；比较 `dsh --version`、解析到的 runtime 路径和 profile bundle 清单，三者必须一致。
4. 在目标 Windows 环境验证工作区、子进程/终端、权限提示、重启与失败恢复，特别检查 native module 的 Electron ABI 兼容性。
5. 对最终将分发的实际安装目录生成 Runtime 闭包与 SPDX/notice 清单；保留上游所需 MIT/第三方 notices，并完成非官方/商标表述审查。
6. 在产品另行决定以前，保持自动更新、遥测上报和签名框架不在本阶段建设范围内。

## 调研边界与自检

- 全文只使用 GitHub 仓库、release、源码、许可证和构建配置等 primary sources。
- 没有下载依赖、运行安装器或修改 Runtime/生产代码。
- 本文不包含任何 Tianwen Desktop 集成、打包或验收通过的声明。
