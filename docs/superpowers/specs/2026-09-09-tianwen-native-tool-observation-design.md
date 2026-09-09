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

Review correction: the static disable/insert patch loses effective options,
inject metadata and a profile's disabled state. Remove that automatic replacement
from the producer-only increment. The exported derived provider remains available
for an explicitly composed native entry which preserves all old entry metadata.
Restore the exact pre-feature Goal-first platform row; do not remove its existing
disabled override or change patch precedence. Preservation applies to the final
effective composition after the normal profile/Goal-first/final overrides.
Default/ordinary installation stays stock until the following startup/consumer
integration has a verified supported pre-boot route; do not claim it is already
wired. A pure entry transformation may replace only the exact native module name
after native composition and before boot, keeping every other field unchanged.
It is not a launcher or authorization to change shared installations.

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

The producer's executionSettingsDigest witnesses its actual execution spec/config
under that trusted-host boundary. Session history does not contain the full raw
settings, so the consumer validates the digest field and preserves the strict
captured receipt rather than reconstructing or exposing shell configuration.
Identity, available command/workspace/interpreter fields, qualification/frames
and final native-result linkage are checked separately. Cold recovery must not
claim that persisted tool events independently reconstruct the raw settings.

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

### Consumer decisions after installed-interface and concurrency checks

Native registry0.1.1-rc.2 has no persistent registration ID. A proper derived
ToolRuntime observes its public register method at original registration time.
Cordis traces this.ctx to the registering plugin, and public
this.ctx.fiber.runtime.callback identifies the actual imported plugin after
registry.resolve normalization. Retain exact definition/origin/callable/schema
references only after super.register succeeds, preserve the exact original
disposer, and compare the actual scoped winner before/after each dispatch.
Unknown sources, module copies, shadows, ambiguous/reused or changed definitions
have no certificate. Store only a versioned serializable producer identity in
the ledger; do not invent a persistent native registration field.

This public-service seam passed a native in-memory fs-search probe: stock10 and
observed19 checks plus two equivalence comparisons, two real scopes and global
layer, existing same-name shadow, original restrictions and disposal preserved.
An initial probe caller missing its tools injection was corrected once; no
tool/model execution occurred. Product tests must additionally exercise actual
skill/pwsh registration. Evidence is retained in E consumer-tools-probe.

Do not replace/reapply agent-plane tool rows or alter the standard preset.
Pre-step occurs after prompt/tool assembly; reapplying plugins there duplicates
handlers and child-local registration can bypass inherited restrictions.
The shared standing preset also has no supported per-agent entry replacement.
Those routes were rejected before consumer implementation.

Safe ordinary wiring uses public path resolution and composeEntries after the
existing verified profile-ready gate. A small bounded source-discovery reader
follows the native installation-first bundle resolution and bundle/profile/home
order, parses through the native entry-list schema, and does not initialize or
normalize profiles. Direct loadProfile cannot enforce the pre-parse1MiB input
limit and can initialize after a profile-disappearance race, so it is not used.
Obtain raw EntryOptions while preserving dynamic expressions/all metadata,
and pass a narrow final --patch selecting derived tools/pwsh services at Desktop
Web startup. Do not run a second CLI dump process, log full configuration or
overwrite user profile/home patches. Use cordis-plugin-include.entryListSchema
to serialize the narrow raw overlay. These are not runtime-resolved defaults.
Verify actual service activation/configuration
after composition; preserve stock behavior when unsupported/ambiguous, never
silently discard options. This startup boundary needs its own product gate.
Direct native-bin launches without the adapter remain stock and cannot claim
the new ancillary continuity; existing learning paths are not disabled.

Compatibility boundary disclosed to the owner: normal Web hot-reloads profile
and home patches, but the final startup overlay fixes these two host service
rows until process exit. Manual changes to these two rows require Desktop
restart; the next launch recomposes them. Other native rows/settings are not
frozen by this adapter. No claim of live-reload equivalence for these two rows,
and no new watcher/restart scheduler or model-task restriction is introduced.

The current native glob value is `{root, paths}`, grep value is `{matches}` with
`{path,lineNumber,line}`, and skill value is `{name,provider,resourceBase?,content}`.
Capture the canonical value and final persisted result binding separately; UI
inline retention is not the full canonical value. Native raw search overflow is
an error. Tianwen additionally bounds each retained receipt and its projection.
The foreground pwsh canonical value adds `kind:'foreground'` to the declared
ShellExecutionResult fields, allowing comparison to the producer result digest.

F1's actual summarization skill already had a frozen ConversationSkillAdmission
and a unique `isolated-reviewed-summary` filesystem provider with default roots
disabled. Its ordinary task read is not a study-source selection/adaptation
branch. Reuse this approval only in the approved independent environment, with
the new environment's exact scope binding and unchanged reviewed content; never
silently add an external source to Daily. Skill result alone lacks the complete
definition/revision, so compare it to the approved full definition at capture.

Directory, glob, skill and read calls may occur in parallel. Close each call's
own identity/result before freeze; do not serialize ordinary model execution.
Grep requires a successful persisted read result strictly before its call,
not merely an earlier read call or a promise that happened to finish first.
Any same-path write/edit call through grep completion, including failed or
in-flight calls, makes that grep unsuitable as preimage evidence.

The minimal worker projection carries only preimage-bound positive grep
locations and exact admitted method definitions. Glob/pwsh receipts keep the
host evidence chain complete but need not add directory text to workers:
captured file entries already contain their original relative paths. Never
copy model-written command, pattern, description, query, complete tool message,
or post-write directory metadata into trial input. The proof remains host-side.
This avoids an extra directory-output parser and answer leakage through queries.
Absent positive hints/methods means no optional context field, even when
directory calls were accounted for. No absence/completeness inference is added.

Freeze must await/validate all owned pending ancillary evidence and final native
results within its capture boundary. Missing, duplicate, late, revoked or
unbound records leave no file result. Recovery uses the same deterministic
projection and does not invent receipts for historical unsupported calls.

Keep the existing guidanceInputDigest(request, files) source-independence key.
Different model queries or loaded method context must not make identical user
requests/file material count as two independent failure sources. Full material
and worker/request digests already bind the optional context for exact replay.

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
