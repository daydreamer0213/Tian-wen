# Tianwen controlled lifecycle CI context repair

日期：2026-08-23

状态：架构监督已冻结；只修 exact-main CI 的 GitHub Actions 上下文位置，
不改产品代码、评测合同或真实 operation。

基线：`main@70fb0cb6f848cb9f8bfeb9aa1ee4676786f8b299`

## 1. 已保留的首次失败

自动 push run
[`32609883224`](https://github.com/daydreamer0213/Tian-wen/actions/runs/32609883224)
精确指向上述 main，`run_attempt=1`，结论为 failure。GitHub 在创建 job 前拒绝
`.github/workflows/ci.yml:28`：

```text
Unrecognized named-value: 'runner'
```

因此 Python、TypeScript 和 installer-windows 都没有启动；这次失败不能被重跑或
本地结果改写为成功。

根因是 `runner.temp` 被写在 `jobs.typescript.env`。GitHub 的
[context availability](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#context-availability)
合同不允许 `runner` 出现在 `jobs.<job_id>.env`，但允许它出现在
`jobs.<job_id>.steps.env`。这是 CI 声明位置错误，不是 Runtime、Provider 或受控生命周期
实现失败。

## 2. 最小修复

只改两个现有文件：

- `tests/contracts/test_public_repository_surface.py`
- `.github/workflows/ci.yml`

先修改合同测试并运行，必须出现与当前错误相符的 RED：当前 workflow 仍在 TypeScript
job 级 `env` 使用 `runner.temp`，且两条受控步骤没有自己的隔离 root。

GREEN 只做以下改动：

1. 删除 `jobs.typescript.env`；
2. 在包含六个 controlled Evolution/Runtime specs 加 demo spec 的现有 Vitest 步骤上增加
   step-level `env`；
3. 在现有 `pnpm demo:controlled-skill-lifecycle` 步骤上增加相同 step-level `env`；
4. 两处值都精确为
   `${{ runner.temp }}/tianwen-v0.1-eval-fixtures`。

不新增 setup step、`GITHUB_ENV` 写入、action、脚本、依赖、缓存、矩阵或通用 CI 抽象。
旧测试和旧 demo 不需要继承这个 controlled fixture root。

## 3. 验证与集成

实现主控按 TDD 执行：

1. focused public contract RED；
2. 上述最小 workflow 修改后，同一 focused contract GREEN；
3. YAML 解析、Ruff focused、`git diff --check`；
4. 静态确认 TypeScript job 仍包含原有受控 specs 与 demo 命令；
5. 提交 `fix: scope controlled CI fixture root to steps`，报告 exact SHA 并停止。

架构监督复核 exact SHA 后，才允许普通推送修复分支、一次 `--no-ff` 合并 main 和一次
普通 main push。只观察由新 main SHA 自动触发的原始 CI；不 rerun 失败的 run
`32609883224`。新 CI 若失败，同样保留首次现场并停止。只有 Python、TypeScript、
installer-windows 三 job 在新 exact main 全绿，才可进入 Task 9 runbook。

## 4. 明确不做

- 不修改任何 `packages/**`、Runtime、Evolution、installer 或 lockfile；
- 不调用 Provider、Goal、installed product 或真实数据；
- 不补跑、删除或隐藏失败 run `32609883224`；
- 不触碰或清理现有 legacy dirty worktree；
- 不趁机扩建 CI helper、预算器、遥测、重试或生命周期框架。
