# Learning Browser Acceptance Implementation Plan

> **SUPERSEDED — user correction on 2026-09-05:** This synthetic-history plan is not real-user acceptance. Do not execute it to close the Stage 2/3 browser acceptance gap. Its earlier generated fixtures remain diagnostic-only and are excluded from acceptance. The replacement trial uses empty Sessions, actual UI task/feedback operations and real DeepSeek model responses under `D:\DevData\tianwen-real-user-acceptance-20260905`. Only an empty workspace is pre-registered because the Windows picker is not controllable by the available browser tool; that picker is explicitly not accepted.

The uncommitted fixture source was removed from the product checkout and retained without deletion at `D:\DevData\tianwen-real-user-acceptance-20260905\evidence\superseded-learning-browser-fixture.spec.ts`. The tasks below are historical, not an active execution plan. Current fixes and retest: [real acceptance fixes](2026-09-05-tianwen-real-acceptance-fixes.md).

> **For agentic workers:** Execute inline in the current session using executing-plans. Tasks use checkboxes for evidence tracking; no product feature expansion is planned.

**Goal:** Close the Stage 2/3 real-model/native-UI acceptance gap and explicitly cover controlled branches without claiming natural effectiveness.

**Architecture:** Keep installed Runtime 0.1.11 bytes unchanged. Reuse the native DSH test harness to produce labeled synthetic historical Sessions (two failed summaries and one success), an interrupted analysis, and a test-only follow-up requesting the target interaction. Restart that isolated data with real DSH Web and the configured real model; all continuation, stopping and navigation use the Codex in-app browser. Existing automated tests cover deterministic outcomes that a real model cannot be forced to produce reliably.

**Tech Stack:** Existing Vitest/DSH public test helpers, Node 22, installed DSH 0.1.1-rc.2, Runtime 0.1.11, Codex in-app browser.

## Global Constraints

- Source baseline: `7028449ca3cb17381d2a70b72e3c3737fc8ba97f`; Runtime archive SHA256 `134c8715a070845840e959882ba64000a3b4e0cf417147b02bd14a3995d8dee1`.
- Evidence/data root: `D:\DevData\tianwen-learning-ui-20260905`, with separate `exploration` and `reuse` homes. Never modify actual user Sessions or the installed product.
- Synthetic setup uses explicitly labeled preconditions and scripted historical outputs through native tools; never labels them natural failures or real-model outputs.
- Real continuation uses the existing configured DeepSeek-V4-Flash/High. No credential copying/printing, extra provider, package installation or external publication.
- The reviewed source is an authored test-only self-contained text Skill, not an external source claimed to be approved. No scripts, downloads or extra permissions.
- Do not edit the product Skill, checker, trust gates or evaluated output to obtain a pass. No manual Candidate/promotion writes.
- A targeted instruction is part of controlled test input, not proof the production analyst would spontaneously choose the branch.
- Fix a demonstrated product bug only after diagnosis and a failing regression. Otherwise report failed/uncovered behavior without changing expectations.

## Task 1: Durable controlled setup

**Files:** new opt-in `tests/dsh-migration/learning-browser-fixture.spec.ts`; generated receipts/configuration under the evidence root.

- [ ] Reuse `mountFeedbackHarness`, native Skill/tool/Session/subagent services and the installed Runtime module.
- [ ] Create labeled first-Turn historical summaries with two omissions and one successful counterexample, preserving the current baseline Skill and checker.
- [ ] Let the existing product create its analysis child; use the test adapter only to interrupt before final submission. Add a clearly labeled native child follow-up requesting one bounded exploration or reviewed-source inspection, then interrupt before real continuation.
- [ ] Flush/dispose all native Sessions. Assert exactly one nonterminal analysis, two failed Outcomes, one success, zero Candidates and zero transitions. Save only identifiers/hashes and setup provenance.

## Task 2: Native Web and real-model acceptance

- [ ] Prepare isolated Web Profiles using existing dependencies and exact installed Runtime bytes; workspace registration is test setup, not UI acceptance of the Windows picker.
- [ ] Open each Profile using the in-app browser. Verify source conversation visibility and real model selection.
- [ ] Before typing `继续`, verify opening alone did not advance the analysis. Then continue from its exact main conversation.
- [ ] Stage 2: observe actual exploration tool use, native child execution, observation return and main-conversation progress. An indistinguishable result is valid if reported honestly; it must not be relabeled an improvement.
- [ ] Stage 3: observe real listing/loading of the admitted source and final analysis. Reuse/Candidate creation is not mandatory if evidence does not justify it; record actual branch coverage.
- [ ] Exercise native Stop and main continuation on available unfinished work; test cold restart without replaying completed work. If the real operation finishes before Stop is observed, mark that UI branch uncovered and use deterministic interruption tests for mechanism coverage.

## Task 3: Deterministic branch matrix

- [ ] Run existing exploration/reuse/product/progress suites and map named tests to: no experiment, useful/indistinguishable observations, interrupted/recovered work, open-without-resume, allowed/no source, changed/rejected source, Candidate gate and main progress.
- [ ] Add a test only for a reachable required branch missing from those suites. Do not duplicate existing coverage or claim every theoretical branch is covered.

## Task 4: Evidence and cleanup

- [ ] Compare actual UI observations with read-only persisted Sessions/ledger facts, including model/provider identity after continuation.
- [ ] Record real-model success/failure/uncovered separately from scripted mechanism coverage and natural effectiveness.
- [ ] Close only trial browser tabs and owned DSH processes; retain receipts and fixtures. Verify the user's original Session/state digest remains unchanged.
- [ ] Update the current handoff to expose the acceptance boundary accurately. No production version bump or installation change for test-only evidence.
