# Single final NEW-delta review

Reviewer: /root/native_observation_final_delta_review, gpt-6-astra/high.
BASE5a30f225142d462bfca52d503cc1883257aaecaf ->
HEAD6a3b2e715b822554df32065393ea0c255136f81a.
Package review-5a30f22..6a3b2e7.diff,749541bytes,11996lines,43commits.
Reviewer read complete diff and required reports/targeted surrounding code;
no edits/tests/process/model/browser/installation were performed.

## Verdict: With fixes before the next candidate gate

Strengths: preserved native behavior/config/scope/results/errors; matching
capture/persistence/recovery/trial identity and source boundaries; bounded
Desktop config preparation/private storage/stock fallback; coherent versions/CI.

### F1 Important

tests/dsh-migration/native-pwsh-observer.spec.ts136 still calls undefined
nativeRequire.resolve after the declaration became cliRequire. Windows full-
file CI will ReferenceError. Fix that one reference and run the existing
explicit configured composition preserves stock cwd interpreter and limits without capture
case; collection-only did not execute it.

### M1 Minor, retained deferred

native-pwsh-observer.spec.ts158 and producer task-1-report.md224: paused-reader
tinyGet-Location is not saturated-pipe cancellation proof. No established
production failure; neither upgrade severity nor claim tested. No new experiment.

### M2 Minor, root chooses same-wave fix

conversation-file-ancillary.ts188/216/250 holds execution, cloned full result,
method and receipt in pending. conversation-file-observer.ts78-83 only consumes
final without releasing state; conversation-observer.ts123 doesn't consume even
that on failure/interruption. Additional payload/reference lifetime extends to
consent withdrawal or service stop. This is new terminal raw-data retention,
not a re-audit of old small state maps; reviewer rated nonblocking.

Root decision: release terminal task state in this same concentrated fix wave,
using existing discard after successful result retrieval; include failed/
interrupted paths. Never release on turn-stopping because steering may continue.
This is routine project-owned resource cleanup, no task-writing policy or new
lifecycle framework. Exact requirements/tests are in final-fix-brief.md.

## Remaining gates

The single final fix wave is committed as5a80a9ffb8000c44a00af3a29086059db9298a0d.
Original reviewer read the complete29632-byte FIX_BASE6a3b2e7..5a80a9f package,
brief and root final-fix-report.md. Scoped verdict: Approved; F1 and M2 closed,
Critical0/Important0/newMinor0; M1 remains deferred. Eligible result is cloned
before discard/delete on every true terminal, only completed persists files,
and steering/late-callback guards remain intact. No tests rerun by reviewer.
Focused3, file-observer11, steering1, fresh Runtime type/build evidence reused.
Worker's unnecessary native fullfile repeat remains disclosed in its report.

Fresh E candidate/byte audit, actual IAB+DeepSeek, exact-main CI and Daily022
upgrade are still unexecuted. This review does not substitute for any of them.
