# Native tool observation: bounded design investigation

Status: execution-record expansion authorized by the project owner after the
023 real-use failure. This note records implementation evidence, not a new
model acceptance or completed product feature. Daily022 remains unchanged.

## Problem and ownership

Ordinary file tasks correctly enter local-files admission but use directory
discovery, skill context and search in addition to read/write/edit. Both real
023 tasks completed; both lost file evidence at their first glob. Fixing only
the glob name check would leave both observed pwsh trajectories unsupported.

DSH still owns tools, process execution, sandbox, timeout/cancel and native
Session events. Tianwen owns evidence projection, input/result attribution,
independent comparisons and future-method governance. We need bounded execution
facts, not a new Agent loop, task-specific writing policy or generic Shell
safety classifier. Unknown facts must make learning unavailable without
blocking or rewriting the ordinary task.

## Reuse and alternatives

1. Tool-name/AST-only allowlist: rejected. Literal syntax alone does not bind
   actual command resolution or the execution context. Whole-workspace endpoint
   snapshots likewise cannot replace actual input/effect evidence.
2. Public native executor observation: preferred hypothesis. Derive from the
   exported SandboxPwshExecutor, reuse its run/start/argv extension points and
   retain its sandbox/process lifecycle. Observe actual PowerShell command
   resolution with PostCommandLookupAction; do not pre-resolve with Get-Command,
   replace cmdlet names, restrict ordinary tools or print receipt text to the
   model. This avoids a DSH core fork if the bounded noninterference gate passes.
3. A versioned upstream sideband interface is a fallback only if the public
   extension fails. No shared node_modules mutation or broad OS provenance
   subsystem is authorized as an implementation shortcut.

The existing threat model trusts the host installation and does not promise
protection against an independent malicious host process replacing filesystem
objects. It still treats model command text and tool-returned content as
untrusted. A directory observation must not be upgraded to file-content proof,
and a successful process exit must not become a successful task judgment.

## Verified native seams

- Installed DSH packages: 0.1.1-rc.2. Public SandboxPwshExecutor inherits
  argv/runArgv/startArgv/onProcessDone from PwshLocalExecutor. Its run calls the
  native confinement path; a derived observer must not bypass that parent.
- tools/execute supports an around-dispatch observer; tools/result supplies the
  frozen final result. The latter does not provide arbitrary metadata mutation.
  Tianwen can bind its own receipt to an actual native call/result instead of
  inventing a new Session event.
- shellEnv can contribute DSH_* values, but declarations are enumerable and an
  extra variable changes commands that inspect the environment. Prefer a
  process-local AsyncLocalStorage capture owned by one Cordis service when
  binding a tool dispatch across separately bundled runtime/provider entries.
  No consent/task eligibility means no capture context and the stock path.
- The native subprocess contract exposes stdin/stdout/stderr only. It does not
  already have a fourth private descriptor.

Primary references:

- [DSH native PowerShell executor](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/shell/pwsh-local/README.md)
- [DSH sandbox-consuming PowerShell executor](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/shell/pwsh-sandbox/README.md)
- [PowerShell command lookup callbacks](https://learn.microsoft.com/en-us/dotnet/api/system.management.automation.commandinvocationintrinsics?view=powershellsdk-7.4.0)
- [PowerShell command precedence](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_command_precedence?view=powershell-7.5)

Installed sources are the implementation authority for this locked version;
upstream master documentation is context, not proof of an installed upgrade.

## Isolated diagnostic results

All files below are under
`E:/待清理/D盘迁移-2026-09-08/Tianwen-本地文件学习-023/tool-effect-probe`,
outside frozen native-use. These are tiny native-command mechanism checks,
not repeated user tasks, scripted model responses or natural learning evidence.

1. Root's initial in-process lookup check used the Codex-provided PowerShell
   7.6.5 and saw actual cmdlet/module/assembly resolution. It established API
   feasibility only.
2. `report.json`: two native workspace-write/partial executions of the F1
   directory command on a new three-file fixture. Stock and instrumented
   stdout/stderr/exit matched, but the original private pipe received no
   connections or frames. The check correctly stopped; it did not establish
   observation completeness or the other command/error cases.
3. `init-diagnostic-report.json`: one Get-Location in each native mode.
   Full-access connected and supplied three frames; workspace-write failed
   in Connect with inner UnauthorizedAccessException. The outer HRESULT was
   0x80131501; no independent Win32 error code was obtained. This is not a
   result-equivalence test because diagnostic stdout deliberately includes
   the initialization error. No permissions were changed.
4. `reverse-pipe-diagnostic-report.json`: one workspace-write/partial
   Get-Location, with the restricted child creating NamedPipeServerStream and
   the parent reading it. One connection, three real frames, exit0 and no
   initialization/receive/cleanup errors. No ACL changes. Bounded connection
   readiness checks belong to this one call, not command retries. Diagnostic
   text means this proves transport feasibility only, not noninterference or
   complete observation through default formatting.

The current public native resolver selected the same Codex-provided pwsh.exe
in these diagnostics (file version7.6.5.500). This does not retroactively establish
the historical 023 interpreter identity, which was not retained explicitly.
Earlier diagnostic scripts/reports are hash-checked and retained unchanged.

5. `observation-gate-report.json`: eight native calls, four bounded comparisons,
   all passed. One diagnostic Get-Location showed the PowerShell.Exiting marker
   after native default formatting and exactly one final terminal frame. The
   two directory commands and a missing LiteralPath were then compared stock
   versus observed without diagnostic output: stdout, stderr, exit code,
   signal, timeout/abort fields and sandbox result were identical. The missing
   path retained exit1 and the exact error. A disconnected parent also retained
   the F1 command result, with zero frames and therefore no certificate.
   This is not universal Shell noninterference or a new real-user pass.

The error formatter itself produced additional lookup callbacks (including
Set-StrictMode, Get-ConciseViewPositionMessage and Get-Command). Callback count
is not AST command count. The first consumer need not certify failed commands;
their original output and error still must remain intact.

## Implementation decision

Use the public executor extension with a bounded directory-metadata producer;
no DSH fork or ACL widening is needed. Capture is opt-in per admitted dispatch,
not a permanent environment variable. Unknown syntax uses the stock path.
Missing, truncated, wrong-call or incomplete records cannot authorize learning.

Keep file material/result/trial-receipt v1 unchanged. Add an independently
versioned ancillary receipt within the existing optional task-ledger mechanism
and an optional typed context on recovered task/trial inputs. Existing digests
remain byte-for-byte unchanged when the new context is absent. The consumer
still binds every receipt to persisted native calls/results and prevents original
answer leakage into independent replicas. Old Tasks1-4 and evidence retain
their original scope. The producer and consumer have separate implementation
gates; passing this mechanism probe does not complete either product gate.
