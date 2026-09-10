# Bounded multi-document learning material capacity

Status: selected implementation detail under the owner's standing direction to
repair observed normal-use learning gaps without repeated routine approvals.
Base: e942b96. This does not regrade 024 or authorize a new model cohort yet.

## Evidence and ownership

The frozen 024 C1 legitimately read three workspace documents: 8614, 8231 and
28494 UTF-8 bytes, total 45339. All are below the existing single-file bound,
but the aggregate 32768 bound rejected the third capture. Earlier captures
survived two native glob calls, so the ancillary continuity work is not reopened.

Capture material and replay fidelity belong to Tianwen. Normal tool execution,
model choices and the ordinary task's answer remain DSH responsibilities.
The authoritative normal-use objective and the 2026-09-09 local-file design are
inherited, including fail-closed incomplete evidence and unchanged ordinary work.

The capacity hypothesis must cover both producer and consumer. The ordinary
claim-review packet contains original source entries, final entries and the
lossless claim-evidence projection. For this read-to-chat task, file text alone
would contribute 3 * 45339 = 136017 bytes before JSON/metadata, above the old
98304-byte material limit. Increasing only capture capacity cannot repair it.
This is static flow analysis, not a reconstructed successful 024 review.

## Alternatives and decision

1. Keep 32 KiB aggregate: safe but excludes the observed normal multi-document
   workflow. This no longer sufficiently serves the approved increment.
2. Coordinate small bounded capacities using the existing exact representations:
   selected. Keep 8 files and 32 KiB per file; allow 64 KiB aggregate per snapshot.
   Allow 256 KiB serialized judgment material rather than 96 KiB. The latter
   accommodates three 64 KiB text representations with 64 KiB metadata headroom;
   it is still an independently enforced bound, not a guarantee for every shape
   of 64 KiB source. Short-line metadata or large prior context may still exceed
   it, in which case the material remains unavailable, never silently truncated.
3. Introduce deduplicated model packets, content references or read-on-demand
   reviewers: may reduce overhead but changes the evidence/recovery protocol and
   adds more machinery than this measured gap requires. Defer until actual
   capacity or resource evidence warrants it. Do not summarize source text to fit.

The constants are storage/material safeguards, not model call/token/money quotas.
DSH and the provider continue to own model context and native completion. No
request count, retry limit or new pricing machinery is introduced. The 256 KiB
limit is not a bound on total API wire bytes, generated schema size or host memory.

## Concrete contract

- `CONVERSATION_FILE_MAX_ENTRY_BYTES = 32768`: enforce on each non-null entry
  and bounded file reads. A single 32769-byte file still cannot enter capture.
- `CONVERSATION_FILE_MAX_BYTES = 65536`: aggregate initial/final snapshot cap.
  Exact boundary is inclusive; UTF-8 bytes, not character count.
- Preserve the existing 32768-byte file-trial assistant reply bound separately;
  increasing aggregate file capacity must not accidentally increase reply size.
- `CONVERSATION_MATERIAL_MAX_BYTES = 256 * 1024`: shared serialized material and
  quote-enumeration limits. Keep one shared material contract across ordinary
  review, feedback, proposal, generated cases and blind review; do not make a
  larger packet legal only in one caller.
- Keep file count, path/link safety, permissions, exact UTF-8/BOM handling,
  original absence, provenance, complete snapshots, two reviewers, claim-audit
  coverage/count bounds, adoption criteria, consent and persistence semantics.
- Existing source/result/receipt schemas and their hashes do not change. This is
  a prospective capacity expansion, not a migration, rewritten old record or
  permission to revive 023/024 incomplete material from today's filesystem.
- If a later-stage guard still rejects a packet, retain its actual reason and
  stop the dependent learning path. Do not bypass it or keep adjusting constants
  during a real-use run.

## Structured-result investigation: separate disposition

024 F1's native child had the schema and tool but ended with ordinary JSON.
Installed DSH 0.1.1-rc.2 `dsh-subagent-in-process-driver` attaches the child-scoped
tool and instruction, validates/commits actual calls and maps completion without
capture to error. It does not perform a missing-tool repair. `dsh-llm` explicitly
has no tool_choice field, and `dsh-llm-deepseek` serializes no such override.
This is not a misconfigured existing Tianwen switch or a missing tool binding.

[DeepSeek strict-mode documentation](https://api-docs.deepseek.com/guides/tool_calls/)
describes schema enforcement for calls using the beta endpoint; changing the
endpoint/schema contract is not a switch already exposed by the installed DSH.
[LangChain's structured-output documentation](https://docs.langchain.com/oss/python/langchain/structured-output)
illustrates provider-native and tool-based strategies, including optional error
handling; it is comparative evidence, not a reason to add another runtime.

Selected disposition: retain native fail-closed behavior and the actual failed
admission. No third judge, ordinary-JSON fallback, hidden request rewrite or own
Agent loop. One observed miss does not establish an unacceptable long-term rate.
Native structured-result reliability remains an explicit uncertainty, not a
reason to require every model judgment to succeed before completing engineering.
Improving the generic native mechanism belongs upstream if later warranted.

## Verification and next gate

Before implementation, add failing checks for aggregate multi-file capture,
single-file/reply limits and a full ordinary claim-review packet greater than
96 KiB. Use synthetic contents and the real native scripted harness for the
packet/receipt test; label it engineering proof, never real-model acceptance.
Check exact aggregate boundary, one-byte overflow, Unicode and unchanged source
identity. Reuse existing path/sandbox/ancillary evidence outside changed seams.

After the narrow patch: run affected file-material, file-learning, file-trial,
claim-review and judgment suites plus Evolution/Runtime typechecks and build.
Review only this increment; freeze its exact revision before deciding the
smallest new real-use gate. 024 stays closed and inconclusive. No candidate
package, main integration or Daily upgrade is authorized as passing by this doc.
