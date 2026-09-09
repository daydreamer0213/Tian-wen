# Native Directory Observation Producer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide an opt-in, independently testable native directory receipt for
the upcoming ordinary file-learning consumer without changing stock task tools.

**Architecture:** A Cordis-owned capture scope is shared with a derived native
SandboxPwshExecutor. Native AST qualification selects bounded directory syntax;
same-process lookup records and a private terminal channel certify actual
execution. The existing DSH executor retains confinement and process ownership.

**Tech Stack:** TypeScript, Node22 standard library, Cordis4.0.1, installed DSH
0.1.1-rc.2, native PowerShell7, Vitest. No additional third-party library.

## Global Constraints

- Work only in D:/DevData/tianwen-worktrees/tianwen-architecture-overview-v2-merge on codex/conversation-claim-evidence.
- Daily022 at D:/DevData/tianwen-experience and C:/Users/Administrator/Desktop/deepseek.lnk are protected.
- Frozen E-drive candidate-cached-5a30f22 and native-use are immutable; old F1/C1 remain failed file-learning captures.
- DSH owns process execution, sandbox, timeout/cancel and native Session events; no fork or shared node_modules edits.
- New generated native-test data goes under E:/待清理/D盘迁移-2026-09-08/Tianwen-本地文件学习-023/producer-tests, never C:.
- No browser/model calls, Daily update, push, merge or release in this producer-only plan.
- Unknown or missing evidence prevents certification but does not block or rewrite the ordinary task.
- Use apply_patch for source/document edits, preserve other agents' changes, and do not run package-manager healthchecks or install dependency trees.

### Task 1: Ship the opt-in native directory observation boundary

**Files:**
- Create: `packages/tianwen-runtime-bundle/src/native-tool-observation.ts` (Cordis scope, receipt types and strict validation).
- Create: `packages/tianwen-runtime-bundle/src/native-pwsh-observer.ts` (derived native executor and exported plugin).
- Create: `packages/tianwen-runtime-bundle/src/native-pwsh-observation-scripts.ts` (trusted AST qualification and bounded observation scripts).
- Modify: `packages/tianwen-runtime-bundle/package.json`, `pnpm-lock.yaml` (only locked installed native peer/dev dependency references and producer export/build/files).
- Modify: `packages/tianwen-runtime-bundle/src/runtime.ts` (register the shared service), `packages/tianwen-runtime-bundle/goal-first.patch.yml` (replace the same pwsh-sandbox row's name, never add a second shell).
- Create: `tests/dsh-migration/native-tool-observation.spec.ts`, `tests/dsh-migration/native-pwsh-observer.spec.ts`.
- Read: `docs/superpowers/specs/2026-09-09-tianwen-native-tool-observation-design.md`, producer section only; all Global Constraints above bind this task.

**Scope:** Producer only. Do not edit conversation file observer, task ledger,
recovery, guidance or trial code. No task can yet use this receipt for learning.
The provider must behave as the original native provider when no capture scope
exists. Consumer work follows in its own bounded plan after this gate.

**Interfaces:** Exact exported API for the consumer:

```ts
export interface NativeToolCaptureIdentity {
  readonly taskId: string
  readonly sessionId: string
  readonly callId: string
}
export interface NativeDirectoryReceipt {
  readonly schemaVersion: 'tianwen.native-pwsh-directory.v1'
  readonly identity: NativeToolCaptureIdentity
  readonly commandDigest: string
  readonly cwd: string
  readonly interpreter: { readonly path: string; readonly version: string }
  readonly processId: number
  readonly nonce: string
  readonly nativeResultDigest: string
  readonly frames: readonly (readonly string[])[]
}
// Strict parser rejects unknown fields, invalid shape/limits, wrong identity,
// incomplete/extra frames, unexpected command/provider implementations.
export function parseNativeDirectoryReceipt(value: unknown): NativeDirectoryReceipt
export class TianwenNativeToolObservationService extends Service {
  capture<T>(identity: NativeToolCaptureIdentity, next: () => Promise<T>):
    Promise<{ readonly result: T; readonly receipt?: NativeDirectoryReceipt }>
}
// Cordis name: tianwenNativeToolObservation. Only this service owns ALS.
// Export native-pwsh-observer as @tianwen/runtime-bundle/native-pwsh-observer.
```

Internal shared-scope methods may be introduced on this service as required
by the provider, but no module-global shared state across independent bundles.
If the strict receipt requires additional bounded fields to bind AST/options,
add them and state their exact type in the report before consumer integration.
All SHA fields use the existing `sha256:` convention. `nativeResultDigest`
binds the complete native ShellExecutionResult, not just stdout. Consumer will
separately bind the final persisted tool/result. Parser qualification must be
carried in the receipt or deterministically reconstructed from bound command
input; do not expose an unverifiable `safe: true` boolean as certification.

- [ ] **Step 1: Write focused failing tests for identity, completion and scope.**

```ts
it('leaves native execution untouched outside capture', async () => {
  const result = await runStockAndObservedWithoutCapture('Get-Location')
  expect(result.observed).toEqual(result.stock)
  expect(result.preflightCalls).toBe(0)
})
it('preserves caller errors and releases capture', async () => {
  const error = new Error('caller failure')
  await expect(service.capture(identity, async () => { throw error })).rejects.toBe(error)
  expect(service.current()).toBeUndefined()
})
```

Implement `runStockAndObservedWithoutCapture` as a test-local helper using
the actual native composition demonstrated by the preserved gate; it returns
the two ShellExecutionResults and a spy count on the preflight seam. Implement
`current()` as the provider's internal shared-scope accessor (undefined outside
capture). Tests must additionally cover two concurrent capture identities,
no/multiple shell runs within one scope, duplicate/missing terminal, wrong
nonce/PID/call/digest, over-limit frames/bytes, unexpected command implementation,
and receiver failure. A scope can yield at most one directory receipt; any
ambiguity invalidates it. Synthetic receipt fixtures are unit evidence only.

- [ ] **Step 2: Run RED using installed tools directly and retain failure.**

```powershell
& 'D:/hermes/node/node.exe' 'node_modules/vitest/vitest.mjs' run tests/dsh-migration/native-tool-observation.spec.ts tests/dsh-migration/native-pwsh-observer.spec.ts
```

Record missing-import/behavior failures before production implementation. All
fixtures/temp/spill from real native tests use the approved E producer-tests
root. Existing shared reference native resolver is available through
`createRequire('D:/DevData/tianwen-real-user-retest-20260905/node_modules/@deepseek-ai/dsh/package.json')`.
Do not assume root node_modules exposes every installed native package.

- [ ] **Step 3: Implement only the bounded producer and reuse native lifecycle.**

Use AsyncLocalStorage on the service. A typical control flow is:

```ts
const scope = this.ctx.get('tianwenNativeToolObservation')?.current()
if (scope === undefined) return super.run(spec)
const qualified = await qualifyLiteralDirectoryCommand(spec)
if (qualified === undefined) return super.run(spec)
return runWithBoundedObservation(spec, scope, () => super.run(spec))
```

`qualifyLiteralDirectoryCommand` is internal to the executor/scripts boundary:
parse original command DATA using the selected native PowerShell parser via
the parent executor without observation; never run the submitted command in
preflight. Its private output must be bounded and validation failure takes the
original stock path. `runWithBoundedObservation` temporarily associates only
that resolved spec with an argv-prefix observation and guarantees cleanup.
Use parent `run` so the native sandbox, abort/timeout and output handling remain
in force. `start` is stock and cannot produce a certificate.

Reusable mechanism evidence/scripts (read these, do not edit) are under
`E:/待清理/D盘迁移-2026-09-08/Tianwen-本地文件学习-023/tool-effect-probe/`:
`gate-observation-preamble.ps1`, `gate-observation.mjs`,
`observation-gate-report.json`. This evidence supports the API choice but
does not replace testing this product implementation.

Explicit limits: command UTF-8 at most8192 bytes; at most16 literal AST
commands; Depth/First/Last/Skip integers0..100; at most64 observation frames and
65536 total wire bytes; one start and one final PowerShell.Exiting terminal
with matching nonce/PID, EOF and no transport error. Use the command/property
options in the spec, not arbitrary parameter names. No-capture or rejected
syntax path must have no injected observer prefix. Short resolved timeouts
below5000ms bypass instrumentation. Child connection wait at most250ms;
parent readiness is bounded by original execution settlement/abort and an
overall maximum3500ms. Bounded asynchronous writes must not hang when a reader
connects then stalls. Record failure invalidates the receipt; preserve the
actual command result. Failed/truncated/aborted/timed-out/denied results never
certify. Do not widen filesystem or named-pipe ACLs.

For directory certification, real lookup identities must be native Cmdlets
under the selected PowerShell installation, with exact expected implementation
types (GetLocationCommand, GetChildItemCommand, SelectObjectCommand,
FormatTableCommand). Every qualifying command must have an observed identity;
duplicates from module autoload are valid. Unexpected lookup rejects the
receipt. Error-formatting can add lookups but failed execution is already
uncertifiable; do not rewrite or suppress the original errors. FileSystem
provider identity and every observed location must remain within the admitted
workspace. Do not treat directory output as a source snapshot.

- [ ] **Step 4: Wire the public producer without granting learning eligibility.**

```yaml
- id: pwsh-sandbox
  name: '@tianwen/runtime-bundle/native-pwsh-observer'
  disabled: !!js process.platform !== 'win32'
```

Preserve native options/config and inherited injections. Runtime registers
the scope service. Add the corresponding package export/files/build entry;
the esbuild entry keeps `@deepseek-ai/*` external as current bundle entries do.
Only add locked0.1.1-rc.2 dependencies actually imported (pwsh-sandbox,
pwsh-local and shell as needed). Do not replace historical disabled install
rows mechanically. No-capture composition must resolve one shell and use stock
arguments/results. If local dependency links are missing, report the exact
link requirement to root rather than modifying a shared installation.

- [ ] **Step 5: Run focused GREEN, then native product mechanism gate once.**

Same installed Vitest command as RED. Real native cases are:

```ts
const directoryCommands = [
  'Get-ChildItem -Recurse -File -Depth 2 | Select-Object FullName, Length | Format-Table -AutoSize',
  'Get-Location; Get-ChildItem -Force | Select-Object Name',
  "Get-ChildItem -LiteralPath './missing-native-probe'",
]
```

Use a NEW three-file tiny fixture, not old023 source materials. Compare stock
and observed complete outputs/error/exit/sandbox for these three command shapes.
First two must yield receipts; the missing path must preserve exit1 and yield
none. Include one disconnected/stalled-receiver case, rejected dynamic/function/
variable/scriptblock/redirection syntax, concurrent identity isolation, short
timeout bypass and native cancellation cleanup. Do not rerun old model tasks,
all historical Python gates or the entire TypeScript suite for this isolated
producer. Run affected runtime typecheck/build and package export/patch tests
once on final code; use installed binaries instead of pnpm run/exec wrappers.

- [ ] **Step 6: Self-review and commit only the owned producer delta.**

```powershell
git diff --check
git status --short
```

Stage explicit owned files and commit as `feat: observe bounded native directory execution`.
Report exact files/commit, RED/GREEN commands and outputs, native test evidence,
public interface additions and residual concerns. Never claim file-learning
or real-user acceptance completed; those belong to the following consumer plan.
