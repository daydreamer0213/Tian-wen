# Bounded larger-file evidence after E039

Status: implemented on the development branch. Affected regression suites: 18 passed, 490/490 checks; eight package typechecks passed. No new real-model acceptance or main/Daily promotion is implied. E039 and earlier results remain unchanged.

## Observed gap

E039's ordinary DeepSeek task used native `read` twice on the same 68,047-byte, 757-line source: lines 1–400 and 401–757. Read-only comparison of the persisted native result metadata against the frozen workspace source found 757 distinct visible lines, zero missing lines and zero mismatches. The longest source line was 1,530 characters, below the installed native read tool's default 2,000-character line cap. The task did no file writes. Tianwen still rejected the source because its independent complete-file capture cap was 32 KiB. This comparison is an E039 diagnostic, not a retroactive repair of E039's missing ledger evidence or a general guarantee that every future read window is complete.

The old 64 KiB aggregate cap also cannot hold E039's three files (74,744 bytes total). The original review packet carries source entries, final entries and a line-preserving claim-evidence projection; a representative 757-line packet exceeds the old 256 KiB serialized-material guard. All three limits must be considered together. E039's answer also named the wrong ledger record for `consentRevision`; admitting the file will not by itself correct that semantic error.

## Choice and boundaries

Keep the existing v1 complete-snapshot, native-call and cold-recovery contract. Extend its bounded capacity prospectively to 96 KiB per file, 128 KiB per snapshot and 512 KiB per serialized judgment material/quote set. The 32 KiB trial assistant-reply bound stays separate. A scripted native read-to-chat task and packet/recovery check exercise the observed size and two review calls; they establish engineering transport only, not model judgment quality.

This is smaller than adding a new partial-read evidence schema, line-window replay format or new reviewer workflow for one observed 68 KiB source. Native `read` already supports offsets, and E039's two windows covered the source. A future source above 96 KiB, an aggregate above 128 KiB or a judgment packet above 512 KiB remains unavailable. No silent truncation, dynamic limit escalation, historical backfill or arbitrary PowerShell content certification is permitted. Generated file cases retain their stricter 32 KiB prompt budget for now.

For read-to-chat tasks, the frozen final entries must equal the first-access entries; the same equality is checked during cold recovery. A file changed between native read and task boundary must fail closed, while ordinary task execution continues. This does not prove that every byte of a future native read result equals the snapshot during a transient concurrent file change. Persisted native results remain the independent record of what the model saw, and a separate result-to-snapshot verifier would be needed before claiming that stronger property for general workloads.

## Verification and next gate

Tests cover inclusive byte boundaries and overflow, 68 KiB native reads split into two windows, complete review-packet delivery/recovery, changed read-only source rejection, historical v1 shapes, and unchanged 32 KiB trial-reply limit. After focused tests, run the affected file, review, guidance and feedback suites plus package typechecks. Freeze an exact candidate revision only after those pass.

Then use a new isolated profile and a new input-frozen real project task with a bounded 64–96 KiB source. Audit native calls, saved results, captured files, review child sessions and answer facts separately. This must be prospective; E039 cannot be regraded from today's filesystem. Research, method activation, future effect and main/Daily remain separate gates.
