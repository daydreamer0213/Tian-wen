# Runtime Public Types Implementation Plan

> Execute task-by-task with executing-plans in the existing DEV worktree under standing autonomous authorization; no approval is pending.

**Goal:** 可信宿主可以从实际发布runtime子入口严格类型消费原配置，并接入公开普通/研究/cohort工厂。

**Architecture:** 复用dts-bundle-generator生成独立子入口声明，不发布源码或私有模块；原manifest添加types/files，JS行为保持。

**Tech Stack:** 既有Node22、TypeScript、dts-bundle-generator9.5.1、Vitest、pnpm11.20.0。

## Global Constraints

- main/Daily完整学习NO-GO、原同意/隔离/资格/门槛及十工作日窗口不变。
- 正式Profile/旧历史不挂载不改，0模型/Docker/旧题，不把声明交付当自然学习。
- 生成物D:/DevData、复用依赖不安装；D至少15GiB、prefer20GiB。

## Task 1: 可发布的Runtime配置与声明

**Files:** 修改packages/tianwen-runtime-bundle/package.json及tests/dsh-migration/runtime-bundle.spec.ts；按实际工具行为必要时才加极薄声明构建适配，不改业务模块。

**Interfaces:** 原apply(ctx: Context, config?: TianwenRuntimeBundleConfig): Promise<void>、原Runtime配置与其他现有运行入口导出；兼容根公开三工厂返回接口，不启用新行为。

- [ ] 记录9f12f2e、两个JS SHA、正式账本SHA、Docker停止及D余额；继承上轮TS7016红证据。
- [ ] 在原发布范围消费者测试中先加typed runtime配置/三工厂接线及非法配置负例，运行保存缺声明首红。
- [ ] build:types串联原根声明与新runtime声明生成，manifest加types/files；生成并核对没有私有相邻模块/@tianwen工作区引用。
- [ ] 同一发布范围消费者变绿；实际独立裸包消费者在原发布范围编译，并验证非法返回/错误配置确实被拒绝，不以any或skipLibCheck掩盖声明问题。
- [ ] 运行相关runtime-bundle与公开API机制回归、现有八包类型/实际完整build；不重复旧真实隔离/模型样本。核对两JS身份与原配置/声明一致。
- [ ] 独立审查声明实际导出/依赖/配置边界，清理本轮临时材料、正式账本不改；DEV提交推送及权威交接记录，完整目标仍active/incomplete。
