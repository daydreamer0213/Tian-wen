# 天问单体 Runtime Bundle 设计

日期：2026-08-15

状态：用户已批准

前置决策：采用方案 B——一个可安装的 Tianwen Runtime Bundle，DSH/Cordis 继续作为外部依赖。

## 1. 结论

第一版不发布多个相互依赖的 `@tianwen/*` 包，也不复制或重写现有 Runtime、Evidence、Evolution。

构建时使用仓库已经锁定版本的 `esbuild`，把以下现有代码编译进一个部署文件：

- `@tianwen/runtime`
- `@tianwen/evidence`
- `@tianwen/evolution`
- 上述代码实际用到的少量 Tianwen compat 代码

最终只安装一个 Tianwen 产品 tarball：`@tianwen/runtime-bundle`。DSH、Cordis、Session、Goal、Tools、Sandbox、Profile 和未来桌面端继续使用 DeepSeek Harness 提供的组件。

原来的多个 `@tianwen/*` workspace package 继续保留，方便开发、测试和职责分离，但它们只是构建期输入，不是部署依赖。最终 tarball 的 manifest、文件树和运行时代码都不能要求 Profile 另行安装这些包。

## 2. 为什么这样做

Phase 1 已经证明现有天问代码能够运行，Task 4 的阻塞只是发布方式：

- `workspace:*` 依赖无法从离线 tarball 中解析；
- `bundledDependencies` 会形成嵌套包，Profile 根目录无法直接加载；
- 嵌套依赖还会带入源码和不完整的 DSH 原生依赖闭包。

因此不应该重写已通过测试的运行逻辑，只需要把多个天问内部模块在构建阶段合并成一个部署产物。

## 3. 产品边界

### 3.1 天问自己负责

- 顶层 Runtime 组合；
- Evidence 最小证据投影；
- Evolution Artifact/Champion 治理；
- 持续学习循环后续新增的差异化组件；
- Tianwen Bundle 的构建、版本和安装验收。

### 3.2 继续复用 DSH

- Agent Loop；
- Session 与 JSONL 恢复；
- Goal 和 Goal round driver；
- Tools；
- Local Sandbox；
- Cordis 插件运行与动态插件加载；
- Profile 和 Bundle 安装机制；
- 后续可直接复用的 CLI、任务面板或桌面端能力。

本阶段不开发桌面端，也不新建 Tianwen Sandbox、Session 框架或插件管理框架。

## 4. Bundle 结构

`@tianwen/runtime-bundle` 保留 DSH Bundle 所需的普通入口和配置补丁，并新增公开运行时入口：

```text
packages/tianwen-runtime-bundle/
├── package.json
├── cordis.patch.yml
├── src/
│   ├── index.ts
│   └── runtime.ts
└── dist/
    ├── index.js
    └── runtime.js
```

- `dist/index.js` 是普通 DSH Bundle 入口。
- `dist/runtime.js` 是单文件 Tianwen Runtime。
- `cordis.patch.yml` 只插入 `@tianwen/runtime-bundle/runtime`，并传入受信任的 `evolutionRoot` 部署配置。
- tarball 不包含 Tianwen 源码、内部 workspace 包、内部 `node_modules` 或测试文件。

## 5. 构建方式

使用精确版本的 `esbuild`：

1. 先按现有方式构建 Tianwen workspace packages。
2. 以 Runtime 公开入口作为 bundling entry。
3. 把所有 `@tianwen/*` 运行代码合并到 `dist/runtime.js`。
4. 把 `@deepseek-ai/*`、Node 内置模块和构建后实际需要的第三方包标记为 external。
5. 对产物做静态检查，确保：
   - 不再含有 `@tianwen/*` import；
   - 不含 `@deepseek-ai/*/src/*` 等私有路径；
   - 不包含测试 harness；
   - 不意外打入 DSH、Cordis 或原生扩展源码。

`esbuild` 目前已由仓库锁文件固定为 `0.28.2`。实现时由 `@tianwen/runtime-bundle` 声明精确的直接开发依赖，lockfile importer 也必须记录该版本，避免依靠未声明的传递依赖；不引入新的构建工具族。

如果现有 `@tianwen/dsh-compat` 宽入口导致 tree-shaking 后仍残留无关 DSH import，只允许增加一个最小公开 runtime 子入口，导出 Runtime/Evidence/Evolution 真正需要的值和类型。没有实际失败证据时不提前做这项拆分。

## 6. 外部依赖

Bundle 的 `package.json` 只声明 `dist/runtime.js` 最终真实 import 的外部包，并使用已经验证的精确版本。

构建必须生成 `esbuild` metafile，并用它建立精确闭包：

- bundled inputs 只允许来自 Tianwen Runtime、Evidence、Evolution 和实际需要的 compat 代码；
- `node_modules/@deepseek-ai/**`、Cordis 和原生扩展不能成为 bundled input；
- 每一个非 Node 内置 external specifier 必须是公开 package-root export；
- external specifier 集合必须与 Runtime Bundle manifest 的运行时依赖完全一致；
- 在一个全新的隔离 Profile 中，先以 Profile 的 `package.json` 为锚点加载 Runtime Bundle，再以已安装 Runtime Bundle 的 `package.json` 为锚点逐一 `resolve` 并 `import` 所有 external；
- 任一 external 无法从 Runtime Bundle 的真实安装位置解析，或加载 Runtime 时继续缺少传递依赖，都视为 Bundle 失败，不能用嵌套 Tianwen package、私有路径或源码复制补洞。

这条验收专门防止再次出现 `@deepseek-ai/node-addon-landlock-run` 一类“打包时没暴露、Profile 加载时才缺失”的问题。

原则：

- Tianwen 内部包不能成为安装时依赖；
- DSH/Cordis 不复制进 tarball；
- Runtime Bundle 的 manifest、lockfile importer、tarball 和运行时依赖图都不能引用 `@tianwen/dsh-probe-bundle` 或其 `./adapter`；
- 不使用 registry 上不存在的 Tianwen 包；
- 不使用绝对 `file:` 路径；
- 不依赖私有 DSH 源码路径；
- 不 fork DeepSeek Harness。

## 7. Profile 验收

测试 Profile 仍可使用现有无密钥 scripted adapter 产生可执行验证，但它只是测试夹具，不是 Tianwen Runtime Bundle 的产品依赖。

一次有效验收必须证明：

1. 使用公开 DSH plugin/Profile 接口离线安装 tarball；
2. Profile 根可以 resolve 和 import `@tianwen/runtime-bundle/runtime`；
3. 已安装 Bundle 的真实位置可以逐一 resolve 和 import 其声明的所有 external；
4. dump-config 中存在 Tianwen Runtime，并且配置没有扩大；
5. Runtime 能挂载 Evidence 与 Evolution；
6. Runtime Bundle 不依赖测试 scripted adapter；测试 Profile 可以另外装入现有 probe fixture；
7. 不调用付费模型、网络或真实 Docker；
8. Windows 本地沙盒仍按已验证的 `partial` 能力如实标注。

## 8. 测试与失败处理

采用最小 TDD：

- RED：当前仓库缺少可安装的自包含 Runtime Bundle；
- GREEN：单体产物通过 archive、公开 import、Profile 安装和 Runtime 挂载测试；
- 回归：Tasks 0–9 Node、Python A1–A5、全量 pytest、Ruff、闭包和私有导入检查继续通过。

若失败：

- 产物仍有 `@tianwen/*` import：修正 bundling，不增加第二个产品包；
- 宽 compat 入口引入无关依赖：只增加最小 compat runtime 子入口；
- DSH 公开 Profile 接口仍无法加载自包含产物：停止并报告真实公共接口边界，不通过复制源码或私有路径绕过。

## 9. 不做的事情

- 不合并或删除现有 Python Runtime/A1–A5；
- 不做完整迁移切换；
- 不开发桌面端；
- 不建设通用打包框架、插件市场、数据库、消息总线或多版本迁移系统；
- 不为已审核的同进程插件增加虚假的安全隔离；
- 不把测试 scripted adapter 当成生产模型方案；
- 不在本阶段处理 DeepSeek Harness rc.6 之外的未来兼容性。

## 10. 完成标准

本阶段只有同时满足以下条件才算完成：

- 一个 tarball 包含全部 Tianwen Runtime 产品代码；
- 安装时不存在 `@tianwen/*` 内部包依赖；
- DSH/Cordis 保持外部且只走公开 package-root API；
- Bundle metafile、manifest 和隔离 Profile 对同一 external 闭包达成一致；
- 所有 external 都能从干净 Profile 中已安装的 Runtime Bundle 位置 resolve 和 import；
- 公共离线 Profile 安装、加载和 dump-config 成功；
- Runtime/Evidence/Evolution 行为测试通过；
- archive 没有源码、私有路径或多余依赖；
- Node、Python、Ruff、closure、private-import 全部通过。

## 11. 交付门

技术完成标准通过后，还要满足以下交付条件：

- 独立复审没有 Critical/Important；
- 工作树干净；
- 分支普通推送到 GitHub；
- 用 `ls-remote` 记录精确远端 SHA。
