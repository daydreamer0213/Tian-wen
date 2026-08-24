# Tianwen One-Shot Profile Lifecycle Repair Design

**Date:** 2026-08-24

**Status:** approved

**Baseline:** `main@c6edff01314f2595948fb2390fa9aea273b1a7b4`

**Baseline CI:** run `32712903485`, `push`, attempt 1, all three jobs successful

## 1. Product goal

Restore the ordinary installed Tianwen model-selection flow before creating another formal real
Provider activity:

```text
official install
→ model use --model deepseek-v4-pro
→ model status
→ model use --model offline
→ model status
```

Each one-shot command must finish its business operation, shut down the booted DSH Profile, and exit
normally. A successful model-selection receipt followed by an abnormal process exit is a product
failure even when the persisted selection is correct.

This repair is about normal program behavior. It is not primarily a receipt-hardening, privacy,
forensics, evidence-format or formal-operation project.

## 2. Product-first design rule

The project must establish its architecture and working happy path before spending design attention
on additional security machinery.

The order for this repair is fixed:

1. define the normal user-visible flow;
2. assign process-lifecycle and state-transition ownership;
3. repair the owner of the broken lifecycle;
4. prove the real installed process flow on Windows and in automatic CI;
5. only then review whether the now-working boundary needs any additional security hardening.

Security checks do not define the product architecture. Digests, evidence filenames, exact key sets,
path inventories and replay rules cannot substitute for proof that the command starts, performs its
work, shuts down and returns a coherent result.

Existing basic constraints still apply while developing: do not expose credential values, do not
start a Provider request, do not replay consumed Activities, and do not delete historical evidence.
They are guardrails, not the main workstream or the acceptance proof.

## 3. Observed failure

Activity-03 Command 1 invoked the official installed command exactly once. The model runner persisted
`deepseek-official/deepseek-v4-pro` and printed one valid `tianwen.model-config.v1` `use` receipt with
`modelRequestsDelta=0`. The child then exited with code 13 and wrote a DSH warning to stderr. The
formal operation correctly stopped before model status and `controlled-lifecycle`; offline recovery
and final offline status both succeeded.

Activity-03 therefore remains permanently consumed under its approved historical contract. This
design does not rerun, reinterpret or repair that result. It uses the failure only as evidence for a
separate product repair.

Node documents exit code 13 as an unsettled top-level `await`. The current DSH executable performs a
top-level `await runProfile(...)`. The observed warning identifies that same await.

## 4. Current execution path

The current product flow is:

```text
installed tianwen CLI
→ packages/tianwen-runtime-bundle/src/model.ts
→ spawn installed @deepseek-ai/dsh/lib/bin.js
→ DSH runProfile()
→ boot the tianwen Profile and Tianwen model runner
→ save/read model selection
→ write model receipt
→ call ctx.appExit(0)
→ dispose the DSH root
→ finish post-boot Profile setup
→ settle top-level runProfile()
→ child exits
```

`model.ts` currently inherits child stdout/stderr and waits for the child `exit` event. The Tianwen
runner writes its receipt and calls `appExit(0)`. The business operation is therefore complete before
the failing portion of the observed invocation; the unresolved portion is DSH Profile shutdown.

## 5. Root-cause hypothesis and falsification

The strongest current hypothesis is a race between fast one-shot shutdown and DSH's post-boot user
patch watchers:

1. `runProfile()` boots the Profile.
2. A fast Tianwen runner completes and calls `appExit(0)`.
3. Root disposal closes HMR config watchers while `runProfile()` is still awaiting user-patch watcher
   readiness.
4. `@deepseek-ai/cordis-plugin-hmr@1.0.16` waits on a `ready` promise that resolves on watcher
   `ready` and rejects on watcher `error`.
5. HMR disposal closes the watcher but does not settle that pending `ready` promise.
6. `runProfile()` therefore remains pending after the event loop has no live work, producing Node
   exit code 13.

This sequence matches the Activity-03 receipt, exit code, warning and timing, and it matches the
installed source. It is still a falsifiable hypothesis, not permission to patch blindly.

The first implementation task must establish a deterministic `close-before-ready` RED against the
current dependency. If that test does not reproduce the pending promise at the HMR boundary, stop and
revise this design before changing product code.

## 6. Ownership decision

DSH owns Profile boot and shutdown. HMR owns the readiness promise for a watcher it creates. Tianwen
must not compensate for an HMR promise that never settles by sleeping, retrying, accepting exit 13,
filtering the warning or forcing `process.exit(0)`.

The chosen root repair is a version-bound pnpm dependency patch to the existing
`@deepseek-ai/cordis-plugin-hmr@1.0.16` package:

- a config registration has one explicit terminal readiness state;
- watcher `ready` resolves it once;
- watcher startup `error` rejects it once;
- disposal before either event rejects or otherwise cancels it once, then closes the watcher;
- late `ready`, `error` and repeated disposal are harmless;
- `registerConfig()` never remains pending after its owning HMR service is disposed.

Use pnpm's existing dependency-patch mechanism and bind the patch to exactly version `1.0.16`. The
patch changes the owner of the defective promise; it does not fork DSH, add a Tianwen watcher, or add
a second shutdown controller.

An upstream issue or pull request should carry the same minimal fix and regression test, but upstream
acceptance is not a prerequisite for restoring Tianwen's current pinned product. A later released
upstream version may replace the local patch only after the same product tests pass without it.

## 7. Rejected approaches

### 7.1 Accept the receipt despite exit 13

Rejected. The process contract remains broken and callers cannot know whether shutdown completed.

### 7.2 Add delay, retry or forced exit

Rejected. A timing delay makes the race less visible rather than closing ownership. Retrying a model
selection hides the first product result. Forced exit can interrupt cleanup and output completion.

### 7.3 Build a Tianwen lifecycle framework

Rejected. DSH already owns boot and shutdown. Tianwen needs no scheduler, daemon, state machine,
generic child supervisor or second Profile runner for this defect.

### 7.4 Add a Tianwen-specific `--no-watch` mode immediately

Deferred. Avoiding watchers may become a valid upstream product feature for one-shot profiles, but it
adds a new DSH public mode and does not repair the demonstrated HMR ownership defect. Consider it only
if the deterministic owner-level test disproves the chosen repair or later performance evidence shows
that watchers are an unnecessary material cost.

### 7.5 Harden transport before restoring function

Rejected for this repair's first phase. The current inherited transport made the lifecycle failure
visible. Do not replace it with a new parser/monitor until the real command exits normally and an
independent post-repair review identifies a remaining user-facing problem.

## 8. Functional product contract

The repaired installed flow must prove all of the following through real processes:

1. `model use --model deepseek-v4-pro` exits 0, writes the existing valid model-config receipt and
   leaves stderr empty.
2. A fresh `model status` process exits 0 and reads back
   `deepseek-official/deepseek-v4-pro`.
3. `model use --model offline` exits 0.
4. A final fresh `model status` exits 0 and reads back
   `tianwen-offline/phase2-smoke`.
5. Every receipt keeps `modelRequestsDelta=0`; the flow creates no Agent, Session, Goal or Provider
   request.
6. No process reports an unsettled top-level await, hangs, requires a retry, or relies on a sleep.

The existing model receipt schema and selection semantics do not change. The current Tianwen model
runner, model patch, Profile composition and DSH settings authority remain in place unless the
owner-level RED disproves the current hypothesis.

## 9. Test strategy

Testing follows the product boundary rather than the prior evidence inventory.

### 9.1 Owner-level deterministic regression

Exercise `@deepseek-ai/cordis-plugin-hmr@1.0.16` through its public package surface with a controlled
watcher that is disposed before `ready`. The unpatched dependency must leave the registration
unsettled; the version-bound patch must settle it once and tolerate late events.

If importing the already-transitive package requires declaring it as a root test dependency, add the
same exact `1.0.16` version. This does not add a new runtime package; it makes the patched owner an
explicit test subject.

### 9.2 Real Profile process regression

Create one focused fixture from the existing Profile construction helpers and real installed DSH
packages. Link the built Tianwen Runtime Bundle into that isolated Profile and execute the four
zero-request commands from Section 8 as child processes. Do not use the current fake DSH bin that
simply sets exit code 0.

The fixture is a functional integration test, not a full official installer test. It must fail on
the unpatched dependency for the observed lifecycle family or be paired with the deterministic
owner-level RED; it must pass after the owner patch.

### 9.3 Automatic Windows ownership

Run the real Profile process regression in the existing `installer-windows` job after the Runtime
Bundle build. Keep the Linux mechanism tests unchanged. Do not enable the approximately ten-minute
startup E2E merely to cover this narrow lifecycle contract.

### 9.4 Post-integration installed proof

After the reviewed feature reaches exact main and automatic CI is green, use one fresh product root
under `D:\DevData` for exactly one official install and the four zero-request commands. This is a
product-readiness proof, not a formal Activity and not a Provider run. Preserve the result and stop;
do not proceed directly into a controlled lifecycle in the same authorization step.

## 10. Formal activity state transition

Future operation design must distinguish model activation from formal evaluation:

```text
fresh product
→ activation attempt: model use + model status
→ formal Activity begins: first controlled-lifecycle invocation
→ offline recovery + final status
```

`model use` changes product configuration but sends zero model requests and creates no formal Agent
work. It must not consume a formal evaluation Activity. A failed activation attempt keeps its own
product/evidence scene and is not retried in place, but it does not consume an Activity whose
`controlled-lifecycle` command never began.

The first direct `controlled-lifecycle` invocation consumes the future formal Activity. That is the
first command capable of starting the evaluated Agent/Provider/tool path.

This rule applies prospectively. Activity-01, Activity-02 and Activity-03 keep their already-recorded
historical classifications.

## 11. Security work after functional closure

No new transport schema, output-size framework, path inventory, receipt digest, credential layer or
generic evidence collector is part of the core repair.

After Sections 6–9 pass, perform one bounded review of the working command boundary. Add a security
change only for a reachable remaining problem and only if it preserves the working product flow. For
example, if a real post-repair failure still exposes untrusted child diagnostics, a later design may
bound and sanitize that output. Such a concern must not delay or redefine the lifecycle repair.

## 12. Scope and completion

The intended implementation surface is limited to:

- one version-bound pnpm dependency patch and its manifest/lockfile registration;
- the smallest deterministic HMR regression;
- one focused real Profile model lifecycle regression;
- the existing Windows CI command that owns installed/Profile behavior;
- the minimum public/operation documentation needed to move formal Activity consumption from model
  activation to `controlled-lifecycle`.

Do not modify the Tianwen Agent loop, model adapter, settings store, credential service, controlled
lifecycle runner, Evolution ledger, installer behavior or formal task material unless a required
RED demonstrates that the chosen owner boundary is wrong.

Completion requires the owner-level RED→GREEN, real Profile functional GREEN, normal build/typecheck
and regression gates, exact-main automatic CI success, and one fresh official zero-request installed
proof. Only after that proof may a separately designed formal real-provider Activity be considered.
