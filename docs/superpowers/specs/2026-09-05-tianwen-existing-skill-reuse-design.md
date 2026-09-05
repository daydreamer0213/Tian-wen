# Existing Skill discovery and narrow adaptation

Date: 2026-09-05. Status: implemented and independently reviewed; 20 affected
test files / 364 tests and a fresh disposable installation passed. This remains
an unmerged working-tree increment, not a user-product upgrade or a measured
natural improvement. Exact acceptance: `docs/operations/tianwen-learning-route-20260905-handoff.md`.

## Scope and upstream seam

DSH 0.1.1-rc.2 already owns `skills.snapshot/get`, provider precedence and scoped
loading. Tianwen must not create another catalog, downloader, market or loader.
This bounded slice lets the existing read-only analyst inspect those existing
Skills as untrusted reference data and cite one source in a narrow Candidate.
Ordinary task routing remains native DSH; discovery itself is not learning.

External sources require admission before execution. The host supplies an
optional `learningSkillSources` list containing exact loaded-definition digest,
provider, origin/revision, license, review time, target scope and product tool.
Only explicitly reviewed self-contained text, without installation, scripts,
dependencies or extra permissions, is eligible in this first slice. This record
is host configuration, never read from a Skill's own asserted metadata. No
admissions means no extra tool and no background discovery/model call.

The initial supported trial contract is the existing research-summary scope and
tool. Script-bearing or resource-dependent Skills, unclear licenses, unknown
providers, different task contracts and incomplete catalogs are not eligible.
No license or safety certainty is inferred from a name, a model rating or a
successful test. The person preparing the host record must inspect the exact
source and its license; the implementation checks that those reviewed bytes
and conditions still match. No sources are automatically admitted by this work.

## Model and host responsibilities

An optional `inspect_tianwen_skills` tool lists only eligible native summaries;
an optional exact name loads one body and its admission reference. It never
executes instructions or follows links. Native tool results are the durable
source observation; source bodies and their digest stay traceable in that
Session. Permission guards continue to permit only analysis submission,
bounded exploration and this read-only inspection.

The analyst first checks task fit, relevant evidence and simplicity; an
irrelevant catalog, no qualified source or an adequate current Skill is a valid
no-reuse result. Sources cannot change acceptance, tools, scope or privileges.
If it adapts a source, it copies the returned reference and gives a rationale
in optional `reuseSource`. The host re-resolves and checks the exact digest and
admission before accepting that submission. A source changed since inspection
is rejected; no mutable cache substitutes for the native registry.

`reuseSource` is valid only with `skill-change`, and is saved in the existing
immutable analysis submission. Candidate materialization retains the original
parent Skill and scope, records source provenance in the existing attribution,
and only replaces the already-permitted description/whenToUse/content fields.
The upstream source is never edited or registered as active. The existing
governed evaluation, isolated trial, promotion and rollback remain mandatory;
there is no additional mandatory experiment and no direct activation.

## Completion and evidence

First fix Stage 2 withdrawal and prove interrupted native-arm recovery. Then
prove native catalog inspection, rejected drift/foreign contract, exact source
submission provenance, narrow Candidate materialization, and the unchanged
no-source route. Run affected tests and package/install checks in disposable
D: state. Do not alter the user's installed profile or publish externally.

Real-task learning evidence is a separate question. A suitable genuine task
must have criteria frozen before one real attempt; success/no-case is valid.
Synthetic fixtures prove mechanisms, not a measured improvement. If the user's
backlog supplies no suitable task, report that remaining evidence need rather
than manufacture a failure, improvement, approval or release.
