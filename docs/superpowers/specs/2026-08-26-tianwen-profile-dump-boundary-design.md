# Tianwen Profile Dump Boundary Design

**Date:** 2026-08-26
**Status:** Approved direction; design frozen before implementation planning
**Tianwen baseline:** `main@f173f928184faa8049b6b1d143f0280055196b02`

## 1. Product goal

Use one existing Tianwen development problem as the first ordinary project-owner task after
Activity-22. The task is to make cold Profile inspection complete promptly without weakening the
configuration proof or changing real Profile boot behavior.

This is a product and architecture task, not another controlled Activity. It must be attempted
through the ordinary DSH Agent path after the task, workspace, acceptance criteria, and evidence
boundary are frozen. The result must not be selected, repaired, or rerun to manufacture a success.

## 2. Observed problem

`tests/dsh-migration/controlled-lifecycle-profile.spec.ts` starts two official
`dsh --profile tianwen --dump-config` processes against one fresh `DSH_HOME`. On the canonical
Windows development environment the test repeatedly exceeds its explicit 60-second timeout and
usually finishes after roughly 110–150 seconds.

A fresh CPU-profile reproduction on 2026-08-26 recorded:

- the complete test took 126,364 ms;
- the first dump child lived for 124,835 ms;
- most sampled time in that child was inside Windows symlink creation reached from
  `healProfilesModuleFallback()`;
- the second dump child, against the already-healed home, took 793 ms;
- no Tianwen configuration assertion failed.

The first dump creates the flat `$DSH_HOME/profiles/node_modules` fallback by walking the DSH
dependency closure and creating one link per package. Profile composition and the controlled patch
are not the measured bottleneck.

## 3. Design-to-code gap

DSH describes `--dump-config` as a boot-free, offline composition surface. It must read bundle,
profile, home, and command overlay patches and render the same effective tree a real boot would
mount. It does not load or execute the Profile's plugins.

The current implementation nevertheless routes dump preparation through `prepareProfile()`, which
also calls `healProfilesModuleFallback()`. That healing is needed for a real boot: bare plugin names
must resolve when the Loader mounts the tree. It is not needed to parse bundle manifests and patch
files for an offline dump, because bundle directories already resolve from the DSH installation and
the Profile directory.

The gap is therefore an ownership error:

- offline composition owns profile and patch loading;
- real runtime boot owns module-fallback materialization;
- the shared helper currently makes offline composition perform both jobs.

Raising the Vitest timeout, warming a cache, or bypassing the public CLI would hide this boundary
error rather than correct it.

## 4. Selected architecture

Correct the boundary in DeepSeek Harness, then consume the released correction in Tianwen.

### 4.1 DeepSeek Harness responsibility

The DSH CLI should expose two internally clear paths:

1. **Profile composition preparation**
   - resolve or initialize the named Profile;
   - load its ordered bundle layers and user patch;
   - write or provide the empty root document used to anchor the dump;
   - do not build the runtime module fallback.
2. **Profile boot preparation**
   - perform the same composition preparation;
   - additionally heal the module fallback before the Loader mounts plugin rows.

The smallest expected implementation is to move the existing
`healProfilesModuleFallback(INSTALL_ANCHOR)` call from the helper shared by dump and boot into the
real boot/composition path that needs module resolution. No second configuration composer, cache,
daemon, or Tianwen-owned DSH fork is introduced.

`dsh plugin` behavior remains owned by its existing plugin-management path and is changed only if
an upstream test proves it shares the same real-boot requirement.

### 4.2 Tianwen responsibility

Tianwen continues to test the official DSH CLI. It does not replace the dump with direct calls to
`loadProfile()` or `renderConfigDump()`, and it does not add a private configuration parser.

After an upstream correction is locally proven and released, Tianwen updates its pinned DSH
version through the existing dependency process. The existing controlled Profile test remains a
semantic end-to-end test of ordinary and controlled composition.

If an upstream release is not yet available, the implementation phase may prepare and verify a
minimal upstream patch in an isolated DSH checkout. It must not add a persistent Tianwen dependency
patch merely to make the test green. Publishing a branch or pull request to the external DSH
repository remains a separate external action.

## 5. Normal, counterexample, and failure stories

### 5.1 Normal story: inspect a fresh Profile

1. A user creates or installs a fresh Profile home.
2. The user runs `dsh --profile tianwen --dump-config`.
3. DSH loads manifests and patch layers, renders the effective YAML, and exits.
4. No runtime plugin fallback is materialized because no plugin is mounted.
5. A later real Profile boot heals the fallback and starts normally.

### 5.2 Counterexample: real Profile boot

A real headless or interactive boot is not a read-only dump. It still heals the complete module
fallback before mounting plugin rows. The change must not trade cold-dump speed for module
resolution failures at runtime.

### 5.3 Failure story: invalid Profile input

An unreadable manifest, unresolved bundle, malformed patch, or failed real-boot fallback remains a
hard failure at its existing owner. The optimization must not convert these failures into skipped
checks, cached stale output, or successful partial configuration.

## 6. Acceptance criteria

### 6.1 Deterministic architecture gates

- A cold `--dump-config` against a fresh `DSH_HOME` does not create or populate
  `$DSH_HOME/profiles/node_modules`.
- A real Profile boot against the same kind of fresh home still materializes the fallback and
  resolves the shipped Profile successfully.
- Ordinary and controlled dump outputs preserve their current configuration meaning:
  - ordinary DeepSeek retry resolves to `normal/2`;
  - controlled DeepSeek retry resolves to `normal/0`;
  - only controlled `session-title-llm` is disabled;
  - only the controlled dump contains the controlled lifecycle runner.
- Dump errors remain explicit and nonzero; no stale cache is accepted.

### 6.2 Performance gates

- On the canonical Windows development environment, the existing ordinary-plus-controlled Tianwen
  Profile test completes within its unchanged 60-second timeout.
- The measured target is below 15 seconds for both dumps together, leaving enough margin for slower
  CI machines. The deterministic no-fallback gate, rather than a narrow timing threshold, is the
  primary regression proof.
- The before/after report records cold first-dump, warm second-dump, and complete test wall times.

### 6.3 Regression gates

- Upstream DSH focused dump and Profile-boot tests pass.
- Tianwen's full `controlled-lifecycle-profile.spec.ts` passes without changing its timeout.
- Tianwen's Runtime Bundle build, typecheck, no-private-import check, focused migration tests, and
  exact-main CI remain green after the released dependency is integrated.

## 7. Ordinary Tianwen task protocol

This work is the first internal natural-development pilot, so task evidence must be kept separate
from controlled-mechanism evidence.

1. Freeze this design, the exact upstream and Tianwen baselines, a clean isolated workspace, and the
   acceptance commands before the Agent starts.
2. Invoke the installed configured-model Tianwen Profile through the ordinary headless DSH task
   path exactly once. Do not invoke `controlled-lifecycle`.
3. Give the Agent the observed performance facts and repository access, but not a hidden solution
   patch. The desired ownership boundary may be stated; exact code edits remain the Agent's work.
4. Preserve the ordinary Session, Evidence, Outcome, Skill-use, code diff, and test results.
5. Independently review correctness, upstream architectural fit, and simplicity before any external
   publication or Tianwen dependency update.
6. A failed or incomplete result remains the natural result. Diagnose it; do not rerun the same
   frozen task to select a better answer.

This first task proves whether Tianwen can complete a useful project-owner development task. It does
not by itself prove learning. Learning value requires a later, independently useful task in the same
problem family, frozen before execution, where reuse can be compared without answer-fitting.

## 8. Evidence and reporting

Report four layers separately:

1. **Task result:** diff, tests, measured timings, review findings, and merge/CI identity.
2. **Natural runtime evidence:** ordinary Session, Evidence completion, Outcome, and Skill-use.
3. **Learning evidence:** Signal, Ticket, Case, Candidate, or no-case exactly as the product records
   them; no manual promotion or manufactured failure.
4. **External facts:** upstream release or pull-request status and Provider-account usage only from
   their independent sources.

Internal model-step and tool-call events must not be promoted into Provider-account billing claims.
Project-owner evidence must not be called external-user validation.

## 9. Alternatives rejected

### Tianwen-only direct composition test

Calling lower-level DSH composition APIs would make the test fast but leave the official command
slow and weaken end-to-end coverage. It is useful only as a diagnostic, not as the product fix.

### Longer timeout or prewarmed fallback

Increasing the timeout or moving the 125-second link creation into setup preserves the same wasted
work. A shared warm cache also introduces machine state and concurrency concerns without correcting
ownership.

### Tianwen configuration cache or private composer

A cache would need invalidation across manifests, patches, installation moves, and DSH releases. A
private composer could drift from DSH boot semantics. Neither is justified by the measured problem.

## 10. Non-goals

- no new controlled Activity;
- no Agent loop, Provider wrapper, scheduler, logger, telemetry, retry, or budget subsystem;
- no change to controlled lifecycle safety, receipt, Evidence, or governance semantics;
- no general DSH startup optimization beyond the proven dump/fallback ownership gap;
- no claim of external-user improvement or autonomous learning from this single task;
- no external repository push or pull request before the local patch and evidence are reviewed.

## 11. Completion boundary

The design phase is complete when this document is reviewed and committed. Implementation planning
must then separate:

1. reproducible upstream RED and minimal DSH correction;
2. upstream-focused and Tianwen compatibility verification;
3. the one-attempt ordinary Tianwen execution evidence;
4. external publication and released-version integration;
5. a later same-family natural task for learning-value evaluation.

The project must stop and revisit the design if the cold dump remains slow after fallback healing is
removed, or if a real Profile boot no longer resolves modules. Those outcomes would disprove the
selected ownership hypothesis and must not be patched around.
