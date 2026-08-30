# Tianwen Learning Clue Analysis Handoff

**Date:** 2026-08-30
**Result:** passed

## Product result

The ordinary Learn Loop can now turn one visible explicit-feedback clue into one
ordinary DSH Agent Session when the user chooses **Analyze once**. The Host
revalidates the Goal-first source, reads the private feedback and its anchored
final assistant reply locally, and submits them as untrusted evidence for a
read-only analysis. The existing DSH Session is the progress, result, and
failure surface.

One Ticket maps to one deterministic preallocated Session ID. Concurrent calls
share one admission in the Host, the binding is created exclusively, and a
restart or later click returns the same Session without another automatic
follow-up. A missing initial message, missing Session, or failed Turn is shown as
failed rather than remaining permanently in progress. The browser receives only
the safe clue projection and navigation key; it does not receive or render the
private feedback, final reply, workspace, fingerprint, Signal IDs, or Evidence.

This action does not create a Case, Lesson, Candidate, Champion transition,
Skill, code change, retry loop, scheduler, or Tianwen-side usage budget.

## Deterministic verification and review

- Combined Evolution, binding, Host, RPC client, and compiled-client checks:
  116/116 passed before review fixes.
- Final affected Host/binding/client checks after the review fixes: 74/74
  passed.
- Runtime Bundle TypeScript build, production client bundle, and
  `git diff --check`: passed.
- Independent review first found an admission race/permanent-running lifecycle
  problem and overly permissive client timestamps. Both were repaired with
  focused failing tests. Re-review approved the implementation with no remaining
  P1/P2 finding.

## Real installed-product proof

One fresh isolated product root was used:

`D:\DevData\tianwen-learning-clue-analysis-proof-20260830-1215`

The official managed installer returned `ready` with DSH `0.1.1-rc.2`, Runtime
archive digest
`sha256:c8cc2cea506924471c6a2ce7a1818182a626dab4111356d7889889293da30e95`.
The same installed DSH host then created an ordinary sibling Web Profile and
installed that exact Runtime archive through `dsh plugin add`.

The source was explicitly marked as a controller-seeded fixture, not a natural
development task or real user judgment. Its accepted closed Task was:

- Long Goal: `tianwen-long-goal-24ff3d85-d3b9-403b-9aee-782833bc2a36`
- Task: `de85e50e-d883-48e1-bc3d-675aab2f8402`
- source Session: `controller-source-c01fb138-11b5-4dac-b84f-8745354df8b9`
- source Goal: `goal-29a8e609-aa49-44e3-8cef-7e6c810d50cb`

The installed product recorded one explicit negative-feedback Ticket and then
started exactly one analysis admission. The resulting ordinary Session was
`learning-clue-analysis-e40ae5e32163967820e3c3919e1a8e1d05d31fc13d7bf8cd0013f3bc65ac933e`.
It completed with a Chinese analysis that identified the missing completion
criteria, observed evidence, and evidence-to-conclusion link, and proposed a
small verification format. It did not edit the workspace.

The Session contains one completed Agent Turn, three tool calls with three tool
results, and two persisted request headers. Persisted assistant sources identify
`deepseek-official / deepseek-v4-pro`. These are Session runtime facts, not
Provider billing or invoice facts.

After the owned Web process was closed and restarted, the clue projected the
same completed Session. A second admission call returned `created=false` with
the same Session ID; its persisted request-header count remained exactly two.
No better-answer rerun occurred.

## State and privacy facts

- The private feedback was present in the private analysis Session, but absent
  from feedback, clue-status, and analysis-start RPC responses.
- Source workspace digest before and after analysis was identical:
  `6df4155df6aa06e28931f1a56d98da66e299b9a7c4f4845ee90859119be45f7a`.
- Evolution state digest immediately before and after analysis was identical:
  `99624de6c4f6710f1fd2e9adca57d018e695e4c1e2dd8660e006542a38953569`.
- No Case, Candidate, or Skill was created automatically.
- No controlled Activity was created and no external DSH repository was
  changed or pushed.

## Retained controller facts

Two earlier offline fixture-seeding attempts did not reach a Provider. The
first used the wrong DSH Session metadata layer and was rejected by Tianwen's
header check. The second omitted the Goal tool plugin, so its scripted
`update_goal` call was rejected and the Task remained active. The third fixture
fixed the controller composition and became the sole accepted source above.
These are controller setup failures, not Tianwen analysis results, and they were
not relabeled as passing runs.

## Closed boundary and next step

The product now reaches the first useful post-feedback step: a user can inspect
one durable model analysis without exposing the note in the inbox or silently
changing future behavior. A later slice may offer an explicit action from that
analysis, but it must keep model opinion separate from governed evidence and
must not automatically promote the clue to a Skill or code change.
