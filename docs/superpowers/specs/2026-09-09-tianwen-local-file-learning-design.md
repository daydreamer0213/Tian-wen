# Natural learning from actual local-file work

Prospective capacity amendment (2026-09-10): the observed 024 multi-document
gap is addressed by [the bounded capacity design](2026-09-10-tianwen-file-material-capacity-design.md).
It supersedes only the capacity numbers below for future builds; historical
023/024 results, evidence schemas and the original ownership boundaries stay exact.

Status: implementing the owner's 2026-09-09 instruction to continue the recommended
product-gap repair and targeted real-model acceptance. This is not a completion
or efficacy report. Baseline is c13bad79052541751907a105d72ac43d7a5cd3c4.

## Product decision

Ordinary users ask for work, including changes to files. Their verified results
and attributable feedback must not be discarded merely because the answer is
not confined to chat text. Tianwen owns evidence capture, attribution, comparison
and future-method governance; DSH still owns execution and native tools.

The first complete increment covers bounded local UTF-8 file work using DSH's
native tools: read-only input-to-chat tasks as well as read/write/edit file
deliverables. It does not claim to verify arbitrary shell
commands, code-test execution, websites, remote transactions or subjective
satisfaction. These remain explicit unsupported evidence modes, not successful
text tasks. This boundary is a first increment, not a reduction of the overall
normal-use learning objective.

## Alternatives and reuse

1. Removing the `text` selection filter alone is insufficient: current trials
   cannot perform file effects and would judge descriptions of work.
2. A new generic executor/evaluator platform is unnecessary. Installed DSH
   0.1.1-rc.2 already exposes Agent creation, native file tools, tool guards,
   cancellation, persistence and final output.
3. Selected: a narrow file-material adapter and replica execution, connected to
   the existing task, study, exploration, source-reference, dual-review,
   activation and rollback mechanisms.

Installed public APIs were inspected locally: `dsh-tools` around-dispatch
`tools/execute` observes an allowed call before its body; it must not modify
arguments. `agents.create` supports `meta.cwd` and `setup`; one-shot
`subagents.start` does not support changing cwd. File trials must therefore use
native Agent creation, not loosen the existing one-shot's tool allowlist.
Native `dsh-tool-fs` supplies read/write/edit. No new file tool implementation,
Agent loop, database, scheduler or Python verifier is introduced.
Use DSH's exported child composition/delegated-policy helpers with native Agent
creation: they join the parent's live preset, retain lineage and pin child
approval to never. Setting cwd alone does not recreate this native composition.

## Capture and authority

Admission distinguishes local-file tasks and their delivery kind before the main
answer: `files` requires file deliverables, while `chat` reads files for a chat
answer. The output kind cannot be reassigned after a missing file result.
The observer does not ask the user for a path packet and does not independently
read model-guessed files. Observe actual allowed native file operations instead:
before the first access to each path, capture its existing UTF-8 content or its
absence. Bind the first capture to the task and native call. A read followed by
a write retains the original preimage, not the intermediate answer.

Capture only regular files inside the task's recorded cwd; reject path escape,
links/reparse-point ancestors, alternate streams/device paths, binary content,
more than 8 paths or more than 32768 UTF-8 content bytes in one snapshot. Reading
uses a bounded file handle and checks for changes during capture. Capture failure
does not stop the user's task; it makes its file-learning material unavailable.

Only actual native file tools are covered. Other work-tool effects, incomplete
capture, missing durable initial evidence, interrupted tasks or files outside
the root cannot acquire a replayable file receipt. Recovery must never read
today's file and call it yesterday's input. Existing text and historical tasks
retain their original material, identities and verdicts.

At the awaited native `agent/turn-stopping` hook, capture the actual files in
the frozen access set. Bind that snapshot synchronously to the ensuing completed
`turn/end`. Steering can cause this hook to repeat, so replace the pending final
snapshot on each stop attempt; no later tool execution may be hidden behind an
earlier snapshot. This avoids reading the next user task's edits as this task's
result. Missing stop-boundary capture after a crash is unavailable, not rebuilt
from current files. Original file input is source evidence;
new file content is the answer being checked, never evidence supporting itself.
Assistant claims and successful tool return codes alone cannot establish that
the deliverable satisfies the request. Missing required files remain failures
or unknowns, never silently replaced by the assistant's chat response.
Read-only file-to-chat tasks may have an empty output-path set only with a
nonempty frozen input set and a verified actual authorized successful native
read. Failed reads, guessed paths or a capture alone do not qualify. Any write
in a read-only task makes that learning material unavailable, without stopping
the user's ordinary task. Its later trial exposes read only.

## Replay and independent evaluation

Select only compatible sources with complete verified file material. Preserve
the existing two distinct supports, independent successful counterexample,
workspace/family/parent/model/consent/quality matching and source-pair deduplication.
Do not mix incompatible text-only and file-replay contracts in one study.
Keep evaluated text and file methods in separate optional maps within the
existing guidance snapshot; never overwrite or cross-apply a method that has
only been evaluated in the other mode or output kind. File rules are separated
by family and files/chat output kind. Historical snapshot shapes stay exact.

Each file trial receives an independently seeded temporary replica containing
only frozen preimages, including original absence of output files. The model
sees the original request/context and explicit source-to-replica path mapping,
not old output, feedback criteria, expected answers, arm identity or other trials.
Use a native Agent whose cwd is the replica. Restrict visible and executable
tools to native read/write/edit, allow reads only from the frozen set, and writes
only to recorded output paths. Deny other tools and permission escalation.
Never rewrite tool arguments to make an out-of-scope request look permitted.

Capture actual final replica files, native tool events, model configuration and
persisted Session proof. An authorized save may legitimately preserve existing
bytes; truthfully captured execution does not require a content difference.
Whether that output meets the task belongs to the existing independent review.
A bounded host-written result receipt in the existing
private study ledger binds captured files to that immutable native proof before
review starts. The installed native persistence reader does not support new
downstream Session event types; do not insert one, mutate its known-type set or
write around its active-session coordinator. The native sessionDigest covers
native execution; the separate private receipt binds actual file output to it.
Reviewer input alone is not proof of an execution's file output. Independent reviewers receive frozen original criteria,
inputs and actual produced content, with no arm labels or candidate source text.
The existing acceptance requirements remain; no skipped/unknown comparison may
activate a method. Synthetic adjacent/holdout tasks are labelled synthetic and
must exercise the same file contract. Exploration reuses this same executor.
Inherited rules remain subject to support withdrawal. If a later different-mode
method sits above an invalidated ancestor, use the existing whole-snapshot chain
rollback with explicit ancestor evidence; do not leave the inherited invalid
rule active or invent independent per-rule version stores.

Replica paths use the configured project data root, not a new system-drive cache.
Retain receipts and necessary bounded evidence; retire only exact owned replicas
after capture. Windows arbitrary-command sandbox enforcement is partial, so this
increment does not enable shell/network execution or claim OS-level isolation
against another malicious host process swapping filesystem objects.

## Acceptance, reuse and stop conditions

Preserve R0–R10, K and both 022 actual episodes. Their unchanged proof remains
valid, but none is relabelled as this increment's real file-learning proof.

Engineering checks must distinguish actual missing/wrong files from a successful
chat claim; preserve preimages; reject links, guessed/outside accesses, binary or
oversized files; prevent baseline/candidate contamination and access to original
outputs; bind recovered proof and exercise ordinary withdrawal/disablement.

After implementation and focused review, freeze a bounded real-model protocol:
ordinary natural inputs via the built-in browser, actual DeepSeek responses,
real file effects and feedback. No scripted judgments or internal trigger calls.
Track why each branch was or was not selected. Targeted exploration and source
selection scenarios are legitimate controlled real-model tests, not guaranteed
natural outcomes; an appropriate direct proposal can be valid without proving
exploration. Diagnose a missed intended branch before revising a scenario.

Prioritize actual new connections; do not rerun all historical trials. Reading
external sources remains limited to the approved isolated environment and exact
source admission. No Daily external-source permission is inferred. Text-method
activation is not labelled executable-Skill promotion or stable future benefit.

Full verification, exact-main CI, backups and ordinary Daily delivery remain
separate later gates. No tags, package publication, shortcut-target deletion,
credential relocation or broad cleanup is authorized by this increment.
