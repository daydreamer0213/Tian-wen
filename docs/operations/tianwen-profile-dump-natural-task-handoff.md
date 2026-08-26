# Tianwen Profile Dump Natural Task Handoff

## Result

The ordinary Tianwen task is classified as `task-passed` under the reviewed
profile-dump pilot plan. One natural Agent Turn produced a two-file DSH change:

- profile preparation is now boot-free and no longer creates the shared module fallback;
- real Profile boot still creates that fallback before loading and mounting plugins;
- a focused regression test proves the boot-free boundary.

The reviewed local DSH commit is
`f99852985cbf6e31603b82480fc11c3019714e15`, based on upstream commit
`b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`. It has not been pushed to the
external DSH repository and is not an official DSH release.

## Natural runtime evidence

- One ordinary Turn settled successfully.
- The run made 42 model requests and 65 tool calls.
- The generic parent Skill was recorded.
- The final exact read happened after the last mutation.
- The Agent changed only `apps/cli/src/profile-boot.ts` and
  `apps/cli/tests/profile-boot.spec.ts`.
- The installed ordinary Profile exposed Skill, read, write, edit, glob, and grep tools. It did not
  expose a PowerShell tool, so the controller—not the Agent—ran builds and tests after the Turn.
- The product was restored to the offline model after the natural run.

This evidence proves an ordinary Agent can inspect and edit a real project through the current
filesystem tool surface. It does not prove that the Agent independently executed the verification
commands.

## Independent validation

- The new regression test failed on the exact frozen parent because boot-free preparation created
  `profiles/node_modules`, then passed on the Agent tree.
- The focused source suites passed: 2 files and 15 tests.
- Type checking and the official DSH build passed.
- The built CLI config-dump cases passed: 3 tests.
- A fresh cold config dump completed in 229 ms and left `profiles/node_modules` absent.
- A real cold Profile boot created the fallback and then printed the application help. On the
  canonical Windows machine this diagnostic needed about 58 seconds and created 233 links.
- The full built-bin suite retains a pre-existing 25-second cold-boot timeout. The exact frozen parent
  reproduced the same first failing test and empty-output timeout, so this is not attributed to the
  Agent diff. The pilot did not change that timeout or the cold-boot implementation.
- Tianwen currently installs DSH `0.1.0-rc.7`, while the reviewed local DSH checkout is
  `0.1.1-rc.2`. Direct local substitution would mix incompatible package versions, so released-package
  compatibility is deferred rather than simulated with dependency or lockfile edits.

Correctness, architecture, and simplicity review found no reachable Critical or Important issue in
the two-file DSH diff. The change moves one existing side effect to the existing real-boot boundary;
it adds no cache, duplicate composer, timeout increase, dependency, retry, or framework.

## Learning facts

The natural run recorded `learningDecision=no-case`. This is the correct outcome: one successful task
does not establish reusable project-level learning. No Case, Candidate, policy, or general capability
claim is derived from this single run.

## External facts

- No DSH branch was pushed.
- No upstream pull request was opened.
- No external repository permission is assumed.
- No official DSH package contains this local commit.
- Tianwen's current installer and installed product do not yet consume the fix.

## Product-first next step

The next product task is a Tianwen-owned DSH integration path. Tianwen must be able to build and
install a reviewed DSH source revision or a Tianwen-carried patch without editing an already installed
product and without depending on permission to publish to the external DSH repository.

That integration should first prove the core path end to end:

1. Tianwen selects the reviewed DSH source and applies the minimal two-file change.
2. Tianwen builds one internally consistent DSH package set from that source.
3. The official Tianwen installer consumes that package set.
4. A fresh installed product dumps configuration without booting the Profile or creating the module
   fallback.
5. A real Profile invocation still creates the fallback and runs normally.

External upstream publication remains optional future work and requires separate explicit approval.
It is not a prerequisite for the Tianwen product path.
