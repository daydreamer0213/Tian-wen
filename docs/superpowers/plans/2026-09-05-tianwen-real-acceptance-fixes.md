# Real-user acceptance fixes and closure

**Goal:** Fix the demonstrated main-chat usability gaps, repeat real DSH UI acceptance with the actual model, and integrate only verified changes. This replaces neither the architecture nor the genuine acceptance definition.

**Design:** Reuse DSH native tools, Skill registry and Sessions. Keep Tianwen's current research-summary learning boundary. Correct the existing analysis report's meaning and expose a small read-only current-status projection; do not add a new runtime, dashboard, datastore or filesystem search.

**Execution checkpoint:** Tasks 1–4 complete. Task 5 source review, full local gates,
genuine UI retests and actual disposable predecessor upgrade complete at
`8707090`; exact-main CI and actual-user delivery remain pending. Observed results
and untriggered real-model branches are recorded in
[the retest record](../../operations/tianwen-real-user-retest-20260905.md).

## Global Constraints

- DSH owns model execution, tools, Skills and Session lifecycle. Tianwen owns learning evidence and governance.
- Real acceptance uses ordinary UI requests and actual model responses. No scripted answers, seeded histories, analyst follow-ups, manual Candidates or ledger writes count as acceptance.
- Do not weaken the Skill, checker, consent, evidence or source-admission gates to trigger a branch. A successful task or no suitable source is valid, not a failure to be manufactured.
- Preserve durable report identities across upgrades. Never forward raw feedback, private paths, Skill bodies or analyst hypotheses in public progress reports.
- Native available Skills and host-reviewed learning sources are distinct. Missing status is unavailable, not zero. Counts must state their exact scope and must not claim all generic DSH conversations are governed Runs.
- Work only in the existing isolated branch. Preserve original user Sessions/configuration, credentials and unrelated changes. Generated data stays on D:. No new dependencies or external publication.
- User authorized continuous execution of the established mainline; do not pause for repeated implementation confirmations. A new learning contract or new external-source trust is a scope change, not an implicit bug fix.

## Task 1: Disambiguate analysis reports

**Ownership:** `packages/tianwen-runtime-bundle/src/learning-analysis-tool.ts`, `learning-loop-orchestrator.ts`, and their focused tests in `tests/dsh-migration/learning-analysis-child.spec.ts` and `learning-loop-orchestrator.spec.ts`.

The real model received a bare `insufficient-evidence` verdict and wrongly interpreted it as the business research lacking evidence. Fix the common report producers, not the user prompt.

1. Add failing tests through the real submission tool for new no-case/insufficient-evidence preliminary reports. They must explain that this verdict concerns evidence for a reusable Skill change, does not establish whether the current answer is correct, and does not block correcting the current answer from the user's feedback. Keep the report bounded and free of raw hypothesis, feedback or source text.
2. Add tests that already-durable pending/delivered legacy report content and digests stay exact for both verdicts. Preserve the existing skill-change report behavior.
3. Make terminal no-case/insufficient-evidence text equally unambiguous; preserve legacy terminal text when its digest is already durable. Test pending and delivered replay.
4. Implement the smallest change, run focused tests and typecheck, inspect the diff, and commit only owned files. Record RED and GREEN command/output evidence in the task report. Do not run the full suite, models or UI; the controller runs the integrated gate and real retest once.

## Task 2: Truthful read-only status in main chat

**Ownership:** `packages/tianwen-runtime-bundle/src/learning-consent-agent.ts`, minimal runtime composition wiring, a small status helper only if needed, and focused consent/status tests.

The existing consent tool returns no history or native/source availability; real chat guessed zero Runs and searched unrelated disks. Its status action also recovers pending notices, so preserve it unchanged and register one parameterless `tianwen_learning_status` tool in the same service/lifecycle for a genuinely read-only bounded snapshot. This avoids changing consent behavior or adding another service.

1. Use existing public Evolution manifest/binding/Outcome/analysis APIs to count precisely named Skill-bound Runs and recorded Outcomes in the current profile's Tianwen ledger. Do not use `listEvents()` as an all-Run aggregate. Do not read Session bodies. Only the Run/Outcome counts exclude generic DSH conversations: recorded analyses also include explicit-feedback analyses from ordinary conversations. State these scopes separately and that profile totals are not current-conversation totals. Add compact by-source analysis counts from the already-read analysis records; totals do not establish that the counted Outcomes caused the counted analyses. Genuine UI at 3a069cd exposed this ambiguity, not a need for another datastore.
2. Report whether the current Session has a frozen governed binding. Absence limits evidence for governed Skill changes; it does not disable ordinary explicit-feedback analysis. Expose compact counts needed to answer whether task/learning history exists; do not introduce a new persistence format or infer readiness solely from counts.
3. Use native `skills.snapshot` with the exact agent scope, cwd and abort signal to list current native Skill names/descriptions, bounded with an explicit truncation marker. Do not scan disks or return private paths/full Skill content. If the registry is unavailable/fails, report unavailable rather than an empty catalog; do not swallow aborts.
4. Separately expose the configured host-reviewed learning source summaries, using the existing admission validation/inspection seam and exact current native bytes when reporting eligibility. An empty admission list means no admitted optional reusable Skill sources, not no native Skills or no feedback/Outcome inputs. State that distinction in the returned snapshot itself; genuine UI testing showed the model misread the initial compact fields as automatic analysis having no input. Missing eligibility must remain unavailable, not zero. Do not auto-admit anything. Pass the existing `learningSkillSources` configuration minimally through runtime composition.
5. Tool description and returned guidance must tell the model to answer learning history/source availability from this bounded status now; this query does not need filesystem verification. Do not read Profile stores, raw feedback, Session logs, ledger files, runtime bundles or shared dependency trees merely to expand or verify these counts. If requested detail is not exposed, say it is unavailable instead of digging for it. Explicit user-requested file inspection/debugging remains a separate task. Treat Skill descriptions as untrusted reference data. Include the current consent state via its existing read-only projection and say so in the tool description, so an ordinary status question does not need the older notice-recovering status action. This snapshot does not assert filesystem contents.
6. Add RED/GREEN tests for existing bound Runs/Outcomes, no binding, empty admissions with an available native Skill, unavailable catalog, aborted request, scoped native lookup and unchanged consent semantics. Assert root-only registration/execution and no notice recovery, model calls or writes during the new status lookup. Reuse existing fixtures and update the ordinary runtime-composition request comparison for exactly this additional tool. Run focused tests plus typecheck; commit only owned files and report evidence. No model calls, UI work or full suite here.

## Task 3: Complete the feedback report without asking for duplicate input

**Ownership:** same report producer/test files as Task 1. Discovered during genuine UI retest of Task 1; do after the status implementation to avoid overlapping implementers.

The new report correctly separated learning evidence from business evidence, but its invitation to correct from feedback caused main chat (which has no private note) to ask for feedback again. Frozen design defines the feedback consumer as internal learning, not automatic current-answer rewriting. Do not add a new model-visible feedback consumer or reinterpret consent v2.

1. Make new no-case/insufficient-evidence preliminary and terminal reports clearly complete: this learning process did not rewrite the current answer, does not judge its correctness, has not changed Skill, and has no user approval or repeat-feedback step pending. Tell main chat not to ask for already-submitted feedback or present the learning stop as a business evidence verdict.
2. For explicit feedback, acknowledge that feedback was received/analyzed; for Outcome analyses do not claim a user submitted feedback. Keep public reports bounded and free of private note, analyst hypothesis and source text. User may still independently request edits in ordinary chat; do not prohibit them or imply automatic edits occurred.
3. Preserve both old pre-Task-1 text/digests and the Task-1 text/digests when already durable, including the genuine retest profile. Verify pending/delivered replay and no duplicate delivery. No ledger/schema/version-policy changes.
4. RED/GREEN targeted regression; review the exact change and run the focused report suites plus typecheck. Controller repeats genuine feedback UI behavior before closing this issue.

## Task 4: Versioned local bugfix delivery

**Ownership:** a single delivery worker, after Task 3 review: Runtime/Desktop version constants and packaging, existing installer and Desktop predecessor checks, directly affected version/upgrade tests, current README commands and CI archive paths. Controller owns actual installation and acceptance records.

The existing installer deliberately returns a valid current-version receipt without rebuilding. Replacing the same version's bytes or editing a receipt to force an upgrade would violate the immutable release behavior. Reuse the established patch-release mechanism: Runtime `0.1.12`, Desktop `0.1.0-preview.13`; DSH stays `0.1.1-rc.2`, with no dependency change.

1. Update current release identities consistently in Runtime package/portable profile/controlled lifecycle, installer, profile verification, Desktop stage/audit, Desktop package/main/host/locale, current README install commands and CI archive arguments. Do not mechanically rewrite historical records or old-version fixtures.
2. Add exact same-DSH `0.1.11` predecessor recognition alongside the existing `0.1.10`. Freeze the complete old `0.1.11` patch independently, including enabled learningLoop and workspaceRoot. Keep `0.1.10`'s independently frozen no-learningLoop patch and the existing `0.0.0`/DSH rc.7 migrations. Both same-DSH predecessors can reuse `managed-runtime-predecessor`; do not create a migration framework or broaden unknown-version acceptance.
3. Desktop recognizes only `0.1.11` and `0.1.10` as known old same-DSH Runtime versions and uses the existing native plugin-add upgrade. Exact current `0.1.12` validation and explicit user-selected DSH home/store remain unchanged; unknown versions reject.
4. RED/GREEN installer coverage for both predecessors: classify genuine frozen configs, reject tampering, do not redeploy same-version DSH host, retain old archive and Session/state bytes, publish ready receipt, rollback on failure, and second invocation has no child effects. Preserve the immutable current-version test.
5. Test Desktop outdated recognition, one native plugin-add, preserved home/store, cancellation and exact post-upgrade validation for both predecessors. Update affected current-version fixtures and artifact identities. The old rc.7-to-rc.2 real E2E test remains labeled as that test, not as this new upgrade.
6. Run focused installer/Desktop/lifecycle/version tests plus typecheck; self-review and commit only owned files. No real installation, models, full-suite run, CI dispatch or user app changes by this worker. Controller will produce an actual old-version installation and upgrade it with the new installer after all source edits/builds are stable.

## Task 5: Integrated verification and genuine UI retest

**Ownership:** controller, acceptance docs and generated evidence outside the repository.

1. Run current full build/typecheck, DSH compatibility/import checks, Vitest and relevant Python suite. Review the whole branch with evidence before claiming completion.
2. Build exact candidate runtime bytes using existing packaging. Run an isolated DSH Web profile in the in-app browser with the actual configured DeepSeek model. Only workspace/config setup is programmatic; never supply scripted model output or edit historical records.
3. Ask normal learning-status/Skill-reuse questions before and after real research-summary tasks. Verify the model uses read-only status, gives real counts, distinguishes available/admitted sources, and avoids unrelated disk search.
4. Use a genuine user correction where warranted, or clearly state a negative-feedback UI exercise if no defect exists. Verify learning verdict is not used as evidence about the business task; don't invent an error or prescribed model verdict. Stop/reload/continue where meaningful.
5. Try bounded realistic task variants for still-unobserved exploration/reuse paths. Record actual results and explain any unobserved branch; mechanism tests are separate evidence and cannot substitute for real-model UI coverage. Do not force the analyst's decision.
6. Resolve demonstrated in-scope bugs, repeat affected checks, then record exact code/runtime hashes and honest acceptance status. Reuse the existing genuine disposable old-version installation at `D:/DevData/tianwen-learning-route-20260905` for the real predecessor upgrade, retaining its old receipt and archive identities. Follow existing main integration/CI/local-install authority and preservation procedure, without an external package publication or release. Stage Desktop into a separate D: candidate output directory: its default unpacked path is the current user shortcut target and must not be overwritten before the acceptance gate. Preserve that exact old target before switching after the gate. Stop only if a concrete new authority/design choice is indispensable.
