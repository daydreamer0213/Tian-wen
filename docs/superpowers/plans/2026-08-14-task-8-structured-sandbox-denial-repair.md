# Task 8 Structured Sandbox Denial Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Task 8's incomplete free-text denial check with exact, machine-readable filesystem-error evidence while preserving every existing runner-failure and D-drive boundary.

**Architecture:** Keep DSH `LocalSandboxProvider` unchanged. The fixed Node child catches only its own `writeFileSync()` failure and emits one prefixed JSON record; the test accepts denial only when that record binds the expected exit code, filesystem code, syscall, target path, runner status, and absent file. DSH's published denial dialect remains recorded as compatibility evidence, but a missing phrase alone no longer fails the ordinary local sandbox gate.

**Tech Stack:** TypeScript, Vitest, Node.js 22, public DeepSeek Harness `0.1.0-rc.6` package roots, Windows ACL local sandbox.

## Global Constraints

- Modify only `tests/dsh-probe/sandbox.e2e.spec.ts` and `docs/operations/deepseek-harness-probe-task-8-handoff.md`.
- Do not modify DSH packages, `vitest.config.ts`, dependencies, runtime code, Tasks 0–7, Python, Goal, Evidence, Evaluator, Evolution, or UI.
- All sandbox workspaces and reports remain below `D:\DevData\tianwen-dsh-probe`.
- Keep program-plus-argv execution, `shell: false`, minimal environment, and the existing 15-second timeout.
- Keep runner-failure classification ahead of denial classification.
- Never accept an arbitrary nonzero exit.
- Windows enforcement remains `partial`; outside-root protection remains `not-proven`.
- Do not use Docker, network, paid models, interactive DSH, private DSH source imports, or an unconfined fallback.

---

### Task 1: Prove Structured Child Filesystem Denial

**Files:**
- Modify: `tests/dsh-probe/sandbox.e2e.spec.ts`
- Modify: `docs/operations/deepseek-harness-probe-task-8-handoff.md`

**Interfaces:**
- Consumes: public `ConfinedArgv.denialSignatures`, `ConfinedArgv.runnerFailureRules`, and `LocalSandboxProvider.confine(argv, policy)`.
- Produces: a test-local `StructuredWriteError` parser and a passing Task 8 report with `readOnlyDenialEvidence` and `providerDenialDialectMatched`.

- [ ] **Step 1: Add focused RED tests for the structured record**

Add table-driven assertions around a pure parser/classifier. The accepted record is exactly:

```ts
interface StructuredWriteError {
  readonly code: 'EPERM' | 'EACCES' | 'EROFS'
  readonly message: string
  readonly path: string
  readonly syscall: 'open'
}
```

Use the prefix:

```ts
const DENIAL_PREFIX = 'TIANWEN_SANDBOX_WRITE_DENIED '
```

Require all of these cases to remain rejected:

```text
exit code other than 73
missing or duplicated prefix
malformed JSON
unknown filesystem code
syscall other than open
path different from the exact target
runnerFailure === true
target file exists
```

The current real Windows observation must classify as denied only when it has:

```text
exitCode = 73
code = EPERM
syscall = open
path = exact read-only target
runnerFailure = false
target file absent
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
$env:TIANWEN_DSH_PROBE_ROOT = 'D:\DevData\tianwen-dsh-probe'
$env:TIANWEN_RUN_DSH_SANDBOX = '1'
pnpm.cmd exec vitest run tests/dsh-probe/sandbox.e2e.spec.ts
```

Expected: the existing path-safety test passes and the real gate still fails because the structured parser and fixed child record are not implemented.

- [ ] **Step 3: Emit the fixed synchronous child record**

Replace the raw one-line write probe with the following fixed child script:

```ts
const DENIAL_PREFIX = 'TIANWEN_SANDBOX_WRITE_DENIED '
const WRITE_SCRIPT = `
  const { writeFileSync, writeSync } = require("node:fs")
  try {
    writeFileSync(process.argv[1], "probe")
  } catch (error) {
    writeSync(
      2,
      ${JSON.stringify(DENIAL_PREFIX)}
      + JSON.stringify({
        code: error.code,
        message: error.message,
        syscall: error.syscall,
        path: error.path,
      })
      + "\\n",
    )
    process.exit(73)
  }
`
```

`writeSync(2, ...)` is required so the record cannot be truncated by immediate process exit.

- [ ] **Step 4: Implement the minimal classifier**

Preserve the current order:

```text
apply allowedExitCodes
remove exact informational lines
check fatal signatures
if runner failure: reject denial
check selected backend denial signatures
parse exactly one prefixed child JSON record
```

Accept read-only denial when either:

```text
selected backend denial phrase matched
```

or:

```text
exitCode === 73
one structured record
code in EPERM/EACCES/EROFS
syscall === open
path === exact target
runnerFailure === false
target absent
```

Do not add `operation not permitted` to DSH's backend phrase list.

- [ ] **Step 5: Update the machine-readable report**

On the current Windows host, write:

```json
{
  "schemaVersion": "tianwen.dsh_sandbox_probe.v1",
  "platform": "win32",
  "provider": "@deepseek-ai/dsh-sandbox-local@0.1.0-rc.6",
  "enforcement": "partial",
  "readOnlyWorkspaceWrite": "denied",
  "readOnlyDenialEvidence": "structured-child-fs-error",
  "providerDenialDialectMatched": false,
  "workspaceWriteInsideRoot": "allowed",
  "outsideRootProtection": "not-proven",
  "highRiskRecommendation": "use-container-remote-or-microvm"
}
```

Keep the actual observed values if a future host differs; an unexpected Windows `full` result still requires compatibility review.

- [ ] **Step 6: Run GREEN and default-skip regression**

Run:

```powershell
$env:TIANWEN_DSH_PROBE_ROOT = 'D:\DevData\tianwen-dsh-probe'
$env:TIANWEN_RUN_DSH_SANDBOX = '1'
pnpm.cmd exec vitest run tests/dsh-probe/sandbox.e2e.spec.ts
Remove-Item Env:TIANWEN_RUN_DSH_SANDBOX -ErrorAction SilentlyContinue
pnpm.cmd run test:dsh
pnpm.cmd run typecheck
pnpm.cmd run check:no-private-dsh-imports
```

Expected:

```text
explicit sandbox gate: all tests pass
default suite: sandbox tests discovered and skipped
workspace typecheck: pass
private DSH imports: 0
```

- [ ] **Step 7: Update the canonical Task 8 handoff**

Preserve the original failed observation and explain the correction:

```text
ACL denial was real.
The rc.6 provider phrase list did not include Node 22's wrapped EPERM text.
The accepted proof now uses an exact structured child filesystem error.
Windows enforcement remains partial.
High-risk execution still requires a stronger provider.
```

Record exact final report content, tests, review findings, commits, push, and remote SHA.

- [ ] **Step 8: Obtain fresh scoped review**

Reviewer must confirm:

- no arbitrary nonzero exit is accepted;
- the child record is synchronous and uniquely prefixed;
- code, syscall, and path are exact;
- runner failure still wins over denial;
- the target file must be absent;
- Windows `partial` is not described as strong isolation;
- no production sandbox abstraction or dependency change was added.

- [ ] **Step 9: Run final gates and commit**

Run the Task 8 focused gate, default Node suite, closure/private-import/typecheck, offline frozen install, Python A1, foreground full Python pytest, Ruff, `git diff --check`, and clean status.

Commit:

```powershell
git add tests/dsh-probe/sandbox.e2e.spec.ts docs/operations/deepseek-harness-probe-task-8-handoff.md
git commit -m "test: accept structured sandbox denial evidence"
git push origin codex/deepseek-harness-probe
git ls-remote origin refs/heads/codex/deepseek-harness-probe
```

Use the authorized command-scoped local proxy only if direct GitHub access fails. Never force-push or modify global Git configuration.
