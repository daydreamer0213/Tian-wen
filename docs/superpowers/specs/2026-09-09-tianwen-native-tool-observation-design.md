# Native tool observation and ordinary file-learning continuity

Status: scope approved by project owner; implementation details delegated to
Codex. Design baseline is aefd083 plus the preserved mechanism gate. This is
the repair of 023's real-use capture gap, not a restart of the overall roadmap.

## Outcome and responsibility

Ordinary DSH file tasks may discover directories, consult an admitted method,
read files, search within them and write a deliverable. Tianwen must not discard
otherwise sufficient evidence solely because these supported ancillary steps
occurred. DSH still owns task execution and native process/sandbox handling.
Tianwen observes evidence and governs future methods; it does not constrain the
model to an acceptance script or add task-specific writing requirements.

Old 023 F1/C1 remain failed file-learning captures. Daily022, its shortcut and
the frozen candidate/native-use artifacts stay untouched. Existing successful
engineering and historical learning gates are reused only within their scope.

## Producer subproject: native directory execution receipt

Use exported `SandboxPwshExecutor` and its `run`/`argv` extension points, calling
the parent confinement/lifecycle implementation. No DSH fork, shared dependency
edit, custom process runner, new shell provider alongside the old provider, or
permission expansion. A single Cordis service owns AsyncLocalStorage so runtime
and executor entry bundles share the same capture, not duplicated singletons.

Only an explicit consumer capture scope can request observation. Outside that
scope, on non-Windows, for background start, for rejected syntax, or when a
safe preflight cannot finish, execute the original command by the native stock
path. No environment variable declarations or ordinary tool argument changes.
The producer alone grants no task eligibility and appends no ledger event.

Use the selected native PowerShell parser on command text as DATA before
instrumenting an eligible command. No handwritten PowerShell tokenizer, no
Get-Command pre-resolution, no invocation of submitted text during preflight.
Accept only literal directory metadata expressions involving Get-Location,
Get-ChildItem, Select-Object and Format-Table; statement lists and pipelines
may combine them. Reject dynamic invocation, expression/scriptblock arguments,
redirection, splatting, variable expansion, arbitrary types/methods, assignments,
other providers and parameters that execute scripts or write state. Parameters
are explicit metadata options, not arbitrary pass-through. Actual command
resolution and FileSystem location still must be observed during execution.

Initial accepted metadata options: Get-Location with no arguments;
Get-ChildItem with optional literal Path/LiteralPath, File, Directory, Force,
Recurse, nonnegative bounded Depth, literal Filter/Include/Exclude; Select-Object
with literal metadata property names Name, FullName, Length, Mode,
LastWriteTime, Extension and optional bounded First/Last/Skip; Format-Table
with those literal property names and AutoSize/HideTableHeaders/Wrap. No
calculated properties, ExpandProperty or arbitrary common parameters. Literal
paths must remain under the admitted workspace; wildcard directory enumeration
is context only, never a complete source snapshot or an absence certificate.

Observe actual resolution through PostCommandLookupAction without altering its
arguments/result. Use the successful child-owned private pipe mechanism from
the E-drive probe. All observer statements stay on the same physical prefix
line and original command text stays byte-for-byte intact; do not append a body
tail that overwrites the native exit status. PowerShell.Exiting supplies the
terminal frame after formatting. No diagnostic receipt text in stdout/stderr.
Any observation setup/transport failure disables certification, not the command.
Bound startup/writes/bytes/frames so a missing or stalled reader cannot hang the
task. Very short native time budgets are not instrumented. Timing equivalence
is not promised; tests must show timeout/cancel behavior is still native.

A receipt binds capture task/session/call identity, original command digest,
resolved cwd, selected interpreter/version, native execution settings/result,
one process and nonce, parser qualification, real cmdlet/provider implementation
identities and complete terminal/EOF. Trust the installed host per the existing
architecture threat model, but reject shadow functions/aliases or module/assembly
identities outside the expected selected PowerShell installation. Missing or
unexpected lookups, wrong identity, incomplete bytes, unsuccessful execution,
truncation, timeout, cancellation or denied sandbox produce no certificate.
Failed original commands still run and return their original errors.

This receipt proves bounded directory metadata behavior only. It is neither
file-content provenance, proof of every path's existence, a generic Shell safety
classifier, nor a task-success judgment. Background, arbitrary Shell, network,
subagent and external-effect learning remain outside this increment.

## Consumer subproject: optional typed ancillary context

Preserve `ConversationFileMaterial.v1`, `ConversationFileResult.v1` and
`ConversationFileTrialReceipt.v1`. Add an optional ancillary ledger record
within the existing conversation-learning envelope. No field is added to old
records/inputs when ancillary is absent, preserving historical digests.

- Glob: bind native call/result and bounded structured paths, with native tool
  identity. Directory names are navigation metadata, never file contents.
- Pwsh: require the above producer receipt plus the corresponding persisted
  native call/result; preserve directory output only as bounded typed context.
- Skill: exact admitted skill provider/name/revision/content binding, as method
  context. A skill about the task is not an independent source of task facts.
- Grep: initially support redundant positive search only after a certified
  native read captured each returned file's complete UTF-8 preimage. Validate
  every returned match against that preimage, with no intervening mutation.
  Reject truncation, unknown paths, mismatch and current-task generated text.
  Keep digest-bound positive locations, not absence/completeness claims.

Read/write/edit keep their existing first-access preimage and final-output
mechanism. Every tool call must be accounted for. Unknown tool effects, missing
or mismatched receipts make learning unavailable, not normal task execution.
Consent revocation deletes in-memory pending evidence and prevents new appends.

Recovery independently checks ledger receipts against persisted native Session
calls/results and their boundaries, not merely in-memory reports. Independent
replicas receive source preimages plus typed context, never the original output,
feedback or arm identities. Existing trial tools remain read/write/edit (read
only for chat). Existing material and worker digests bind optional context.
Fact assessment must not flatten method or navigation hints into source facts.
Generated cases with no original discovery trajectory keep their existing form.

## Gates and stop conditions

1. Producer implementation: test-first contract validation, actual native
   composition, output/error equivalence, fail-closed corruption and isolation,
   package export/loader wiring. The disposable mechanism gate is supporting
   evidence only; test the product implementation separately.
2. Consumer implementation: test-first capture/recovery/trial tests for each
   supported ancillary step, old-v1 digest compatibility and no answer leakage;
   scoped independent review and affected runtime/packaging checks.
3. One fresh bounded ordinary-use cohort in a new E-drive directory, through
   Codex's in-app browser and real DeepSeek. Use natural requests, no mandated
   tools or fabricated feedback. Stop at a clear product defect and diagnose
   it; do not run repeated similar tasks merely to seek a favorable branch.
4. Update the branch matrix with mechanism vs ordinary-use evidence and any
   unresolved branches; review the new delta once, then integrate only after
   the required current gates pass. No claim that model simulation is organic
   user evidence or that untriggered learning adoption is proven.

The producer and consumer have separate plans because the producer can be
reviewed and rejected independently without modifying historical learning data.
