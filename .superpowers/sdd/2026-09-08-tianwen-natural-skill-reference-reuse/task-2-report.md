# Task 2 implementation report

Status at this checkpoint: implementation and assigned checks complete for the frozen **source before exploration** design; commit intentionally paused at controller request while the controller checks whether the permitted ordering should change. This is a source-connection implementation checkpoint, not release, live acceptance, effect evidence, or total-route completion.

## Scope and changes

- `packages/tianwen-runtime-bundle/src/learning-skill-reuse.ts`: separate natural catalog/read helpers. Admissions are strictly parsed and filtered by exact scope, environment and purpose, with ambiguous names removed before snapshot. Empty eligibility performs zero registry calls. Complete native metadata only is offered; get is deferred until selection. The selected complete definition is checked by the Task 1 parser, including reviewed digest, name, provider, model invocability, stable serialization and 16 KiB body. Old `inspectLearningSkills` and `hasLearningSkillObservation` implementation and native tool/result meaning remain unchanged; the stricter new definition parser is not substituted into legacy behavior.
- `packages/tianwen-runtime-bundle/src/conversation-judgment.ts`: optional source names/read digest in the native closed-object proposal schema; a generic persisted structured-judgment recovery helper shared by the existing review-request recovery API. It verifies one successful exact capture, one one-shot descriptor/turn, subagent lineage, persisted hash, completed turn, exact request digest and request headers. The old review verification API remains public and unchanged.
- `packages/tianwen-runtime-bundle/src/conversation-guidance-loop.ts`: cloned loaded config, exact explicit absolute-root environment digest, scoped native registry options, metadata-only initial catalog, one durable native selection before one host read, immutable read receipt before a further proposal, strict final declaration binding, explicit source→optional exploration sequence, and current admission/support/consent checks at pending-study boundaries. Recovery checks the actual native selection and candidate captures/material/model headers without model or registry calls.
- `packages/tianwen-runtime-bundle/src/runtime.ts`: independent `conversationSkillSources`; forwards the same explicit `config.evolutionRoot` passed to core. No learning-source fallback or private Evolution root getter.
- Tests changed only in the three assigned source/judgment/loop test files.

## Actual TDD evidence

Every command below ran from `D:/DevData/tianwen-worktrees/tianwen-architecture-overview-v2-merge`. Exact shared prefix:

```powershell
. 'D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1'
& 'D:/hermes/node/node.exe' 'D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs' <arguments>
```

1. RED, 17:19:06: `exec vitest run tests/dsh-migration/learning-skill-reuse.spec.ts tests/dsh-migration/conversation-judgment.spec.ts`.
   Actual output: `Test Files 2 failed (2); Tests 16 failed | 26 passed (42)`, exit 1. Missing natural list/read exports failed 15 intended helper cases. Native schema rejected `value.inspectSource` as undeclared in the new schema case. These were the new, absent feature boundaries.
2. GREEN, 17:19:52, same command: `Test Files 2 passed (2); Tests 42 passed (42)`, exit 0, duration 3.67s.
3. RED, 17:22:16: `exec vitest run tests/dsh-migration/conversation-guidance-loop.spec.ts -t 'source-adapted|source-not-used|source-explored|recover-source'`.
   Actual output: `Tests 5 failed | 48 skipped (53)`, exit 1. Natural scenarios reached the new expectation but the host performed zero gets instead of one, and recovery scenarios had no accepted decision. This showed the native event-driven host still lacked source connection.
4. RED, 17:22:56: `exec vitest run tests/dsh-migration/conversation-judgment.spec.ts -t 'uses a native'`.
   Actual output: `Tests 2 failed | 17 skipped (19)`, exit 1, because the new generic recovery export did not exist. The test uses real persisted one-shot Sessions and subsequently rejects a different claimed capture.
5. During integration, an actual Cordis failure was diagnosed: `cannot get property "skills" without inject`. The service now uses the existing public optional `ctx.get('skills')` pattern, and the helper rejects an absent registry only when an admission actually qualifies. No fake registry getter was introduced. A new payload assertion also initially tried to parse ordinary user requests as judgment material; the assertion was corrected to inspect the body-bearing proposal payloads.
6. GREEN, 17:27:01: `exec vitest run tests/dsh-migration/conversation-guidance-loop.spec.ts -t 'source-'`: `Tests 11 passed | 42 skipped (53)`, exit 0.
7. GREEN, 17:29:56: `exec vitest run tests/dsh-migration/conversation-guidance-loop.spec.ts -t 'source'`: `Tests 27 passed | 39 skipped (66)`, exit 0, duration 25.61s.
8. GREEN, 17:31:35: `exec vitest run tests/dsh-migration/conversation-guidance-loop.spec.ts -t 'actual explicit runtime|valid-source-explored'`: `Tests 2 passed | 66 skipped (68)`, exit 0.
9. Final assigned scope, started 17:32:49, after adding source/exploration recovery and exact body-bearing Session checks:

```powershell
. 'D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1'
& 'D:/hermes/node/node.exe' 'D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs' --filter @tianwen/runtime-bundle typecheck
& 'D:/hermes/node/node.exe' 'D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs' exec vitest run tests/dsh-migration/learning-skill-reuse.spec.ts tests/dsh-migration/conversation-judgment.spec.ts tests/dsh-migration/conversation-guidance-loop.spec.ts tests/dsh-migration/conversation-guidance-ledger.spec.ts tests/dsh-migration/learning-exploration.spec.ts
```

Actual output: `$ tsc -b --pretty false`, no diagnostics; `Test Files 5 passed (5); Tests 178 passed (178)`, final exit 0, duration 77.58s (tests 71.41s). The two commands were sequential. Typecheck had also completed without diagnostics before the focused native integration run. No warnings or failures appeared in this final output; deliberately unavailable scenarios capture and assert their own expected warnings.

## Verified behavior

- Registry: no admission, wrong exact scope/environment/purpose and duplicate admission names yield zero snapshot/get. Native valid list performs no body get; selected read performs exactly one get with the same options. Partial catalogs, provider/model-invocable mismatches, absent or changed definitions, and a 16,385-byte body are refused.
- Configuration: actual public runtime `apply` passes its explicit root plus independent natural admissions to the service. Native scenarios with no explicit root, relative root, other environment or other scope stay on the ordinary path with zero snapshot/get. No core default-root change.
- Native source studies arise from three normal user events, with no manual study triggering in the main table. Covered adapted, not-used, insufficient after read, source then exploration, outside selection, mixed selection, second selection, missing/blank/wrong declaration, sourceUse alone and sourceUse alongside exploration.
- Existing successful direct and explored baselines retain 48 and 55 model requests, including the future user turn. Successful source cases use 49 and 56 respectively: precisely one extra proposal. Exploration remains two arms and formal evaluation ten arms. Actual source-selection and candidate native proofs are independent; body-bearing native request Session IDs belong only to the source-aware proposal(s), each exposing only `structured_output`.
- Actual consent invalidation and actual message-feedback support withdrawal during get and before candidate refuse continuation. The host rechecks after get before appending the source receipt. No fallback source or host retry exists.
- Interrupted source read: the durable read survives an interrupted following proposal with lost stop append; reinitialization stops the undecided study and produces no second registry read/model call.
- Accepted pending source and source+exploration recovery activate with zero additional model/snapshot/get calls. Missing/replaced selection proof and removed loaded admission refuse activation.
- Genuine substituted candidate case: the test creates an authentic additional persisted one-shot capture of the same candidate/declaration, with substituted sourceReference request material; replaces the candidate proof in the test ledger; verifies ledger replay; then restarts from disk with no scripted model responses or registry. Activation is rejected as `invalid-judgment` with zero calls. This is not a nonexistent-session-only fixture.
- Raw attributed feedback remains byte-exact through independent case design, source-aware proposal before exploration, final proposal and existing review consumers. Source text is not supplied to cases/workers/blind reviews or evidence quotation whitelists. Existing feedback and formal audit tests remain in the assigned GREEN run.

## Self-review and boundaries

- Reviewed production diff, strict proposal key handling, native capture/proof binding, config cloning, body read ordering, pending-study admission checks and zero-call recovery. No domain, ledger, worker, reviewer or persistence-service changes were made.
- No new native tools, Run/SkillUse, executable promotion, scheduler, retry, database or dependency. Host registry reads do not claim to be old native inspection-tool observations.
- No live model, browser, external source, network, Daily, R11, historical cohort rerun, desktop build, packaging or full-suite command. Fixtures are repository-owned and use example.invalid provenance labels only. Generated native test data stayed on D: and test cleanup is unchanged.
- Existing files are already large; this stays within the specified ownership and does not create a generalized orchestration loop or extra service.
- Other modified progress/delivery documents belong to the controller and are not part of this implementation or intended commit.
- Controller ordering inquiry: enabling source selection after exploration cannot be done correctly only by changing proposal prose. Minimum affected seams are the schema's source-selection availability, the two explicit host branches, and Task 1's source-read-before-exploration ledger invariant, followed by the corresponding frozen spec and tests. Await controller's factual/design decision; current implementation deliberately follows the supplied frozen source-first contract.

Commit: paused by controller; no implementation commit created at this checkpoint.

## Revised two-order contract completion — 2026-09-08

Status: DONE. The checkpoint above is retained as actual source-first RED/GREEN evidence. This correction completes the subsequently revised brief/spec, on base `79294cf75b7c9e3f7abfdf6555df7b0225454520`, including the reviewed domain order correction already present in that base. No domain edits were needed.

### Correction implemented

- `sourceNames` now enables an unread source independently of `allowExploration`; host parsing has the same rule. Following a read, the source option disappears. The prompt permits selection before exploration or after its complete result.
- Two explicit bounded host branches support source→proposal→optional exploration→proposal and exploration→proposal→optional source→proposal. The shared small read operation preserves one immutable receipt, the completed native selection proof, admission/current-state checks before and after get, and duplicate-stop behavior. There is no generic loop, retry, second read or second pair.
- Accepted source recovery now verifies the complete final exploration observation against the durable proposal/result and both arms: exact answer hashes, arm identities, independently derived verdicts and complete retained review checks. A source selected after exploration must carry exactly that observation in its own native selection request.
- Recovery also recovers the authentic exploration proposal capture and verifies its study/source IDs, model headers, unchanged sources/current guidance and absence of a prior exploration observation. If that proposal is source-aware, it must carry the identical read reference and its selection must have no observation. If it is source-free, the selection must contain the complete observation. This checks the material consistency of the actual bounded order without adding domain state or native calls.
- The existing native event scenario table now includes explore→source success and intact accepted recovery. Genuine substituted final-observation and selection-observation fixtures preserve authentic saved native Sessions. The selection fixture additionally rebinds the changed read receipt and creates an authentic final candidate with its new read digest, so rejection cannot be explained by a stale candidate binding. Both altered ledgers replay cleanly, then fresh initialization with no registry and no model responses rejects activation as `invalid-judgment`.

### Additional actual RED/GREEN evidence

All commands used the same D: workdir and exact gate prefix documented above.

1. RED, started 19:31:16:
   `exec vitest run tests/dsh-migration/conversation-judgment.spec.ts tests/dsh-migration/conversation-guidance-loop.spec.ts -t 'unread source after|source-explored-first'`
   Actual: `Test Files 2 failed (2); Tests 4 failed | 88 skipped (92)`, exit 1, duration 6.03s. Schema specifically rejected `value.inspectSource` as undeclared after exploration; native event scenario performed zero gets, and the pending-recovery scenarios had no accepted decision. This was before the correction implementation.
2. Intermediate boundary, 19:32:03, same command after only the schema/host order correction:
   `Test Files 1 failed | 1 passed (2); Tests 1 failed | 3 passed | 88 skipped (92)`, exit 1. Normal explore→source succeeded, but intact recovery still emitted `invalid-judgment`, identifying the source-first recovery assumption.
3. GREEN, 19:32:54, after the native recovery correction:
   `exec vitest run tests/dsh-migration/conversation-judgment.spec.ts tests/dsh-migration/conversation-guidance-loop.spec.ts -t 'unread source after|source-explored-first|recover-source-explored$|source-explored$'`
   Actual: `Test Files 2 passed (2); Tests 6 passed | 86 skipped (92)`, exit 0, duration 12.01s. Both source/exploration orders, intact recoveries and genuine substituted final observation were covered.
4. Focused genuine substituted selection check, 19:34:14:
   `exec vitest run tests/dsh-migration/conversation-guidance-loop.spec.ts -t 'source-explored-first-substituted-selection'`
   Actual: `Test Files 1 passed (1); Tests 1 passed | 72 skipped (73)`, exit 0, duration 4.29s.
5. Final assigned verification, typecheck followed sequentially by the five-file run started 19:35:05:

   ```powershell
   . 'D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1'
   & 'D:/hermes/node/node.exe' 'D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs' --filter @tianwen/runtime-bundle typecheck
   if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
   & 'D:/hermes/node/node.exe' 'D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs' exec vitest run tests/dsh-migration/learning-skill-reuse.spec.ts tests/dsh-migration/conversation-judgment.spec.ts tests/dsh-migration/conversation-guidance-loop.spec.ts tests/dsh-migration/conversation-guidance-ledger.spec.ts tests/dsh-migration/learning-exploration.spec.ts
   ```

   Actual: `$ tsc -b --pretty false` with no diagnostics, then `Test Files 5 passed (5); Tests 184 passed (184)`, exit 0, duration 80.15s (tests 74.18s). Output contains no warnings or failures. The integration assertions retain no-source direct/explored totals 48/55 and source totals 49/56 (including a future user turn), one get, two exploration arms, ten formal arms, independent source/final native proofs and source-body isolation. Intact source recovery checks zero additional model/snapshot/get calls.
6. `git diff --check` completed with exit 0 and no output after implementation. The owned staged diff will be checked again before committing this report.

### Final self-review and limitations

- Reviewed all four production-file diffs and the added native recovery scenarios. The previous helper, configuration, current consent/support and source-body isolation implementation was preserved; source-first assertions still pass in the final run.
- Ownership remained the four runtime files, three test files and this report. Controller changes to `progress.md` and `verification-delivery-next.md` are excluded from staging and commit. No domain, ledger, other documentation or unrelated work was edited or reverted.
- The runtime file and integration suite were already large; this adds only the two explicit orders and bounded recovery validation. No general orchestration engine, new persistence or additional dependency was introduced.
- This is native scripted engineering evidence, not real-model usefulness, causal effectiveness, release, delivery or external-source permission. No live model/browser/source/network, package/Desktop/Daily/dependency, historical R0–R10 or R11 action occurred. The final check was exactly the assigned five files plus runtime typecheck, not a full suite.
- Commit contains this report and only the seven owned implementation/test files; the exact resulting SHA is supplied in the implementation handoff (a commit cannot embed its own hash).
