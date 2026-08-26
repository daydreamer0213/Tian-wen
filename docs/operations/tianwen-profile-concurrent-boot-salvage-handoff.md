# Tianwen Profile concurrent boot salvage handoff

## Result

The controller-owned salvage passed local source, package, repository, and
official installed-product gates. Tianwen now carries an exact
`@deepseek-ai/dsh-app-boot@0.1.0-rc.7` pnpm patch that atomically publishes both
initial Profile files and fallback junctions.

This result does **not** revise the second natural task. Its authoritative task
result remains `task-incomplete`, and its learning decision remains `no-case`.
No DeepSeek retry was used to replace that result.

## Historical natural-task result

- The configured-DeepSeek natural task ran once through the ordinary Tianwen
  path. The Agent identified a useful concurrent first-boot problem and changed
  DSH source.
- The Agent-authored regression still exceeded its frozen 60-second ceiling
  after the change, so the predeclared acceptance condition was not met.
- Later controller test invocations were diagnostics, not additional model
  turns and not retries that changed the task classification.
- A `.CMD` multiline argument transport failure occurred before Goal, Session,
  Run, or model creation. It consumed no natural model attempt and remains
  outside current Outcome-to-Skill intake.

## Controller engineering result

The controller preserved the Agent tree and created a new D:-hosted DSH salvage
worktree at frozen parent
`b180ce297766abdd6608e95b5c547ebe899d6e6f`. Two independent races were then
proved and repaired:

1. `healProfilesModuleFallback()` published Windows junctions directly at
   their final paths. An eight-process IPC-barrier regression failed 3/3 with
   the original publication error and passed 3/3 with private staged junctions
   plus atomic rename.
2. Concurrent `initProfile()` writers exposed a partially written
   `package.json` to a reader. An eight-writer/one-observer regression failed
   3/3 with truncated JSON and passed 3/3 after complete private files were
   atomically published with no-overwrite hard links.

The local DSH commits are:

```text
d86d5de4da964a5ac9904cca142b8b49052403c3 fix: publish Profile fallback links atomically
74070e06adbea2f8facbc858f261340dcc3c99fb fix: publish initial Profile files atomically
```

The DSH worktree is clean. Neither commit was pushed or published upstream.

## Runtime evidence

- DSH related source tests: 17/17 passed; typecheck, lint, and full build passed.
- Built DSH source tree: three fresh rounds, 24/24 `web --help` launches, 233
  complete fallback links per round, and no staged link left behind.
- Built DSH dump: exit 0 and no `profiles/node_modules` materialization.
- Final Tianwen workspace RED without the app-boot patch: 3/3 failed with the
  original `exists and is not a symlink` publication error.
- Final Tianwen workspace GREEN with the patch: 3/3 passed, each 8/8 with 505
  links, in 7835 ms, 7862 ms, and 7847 ms.
- Official install root:
  `D:\DevData\tianwen-profile-cold-boot-natural-02\official-install-controller-salvage-01`.
  The one official installer invocation returned `status=ready`, exact DSH
  `0.1.0-rc.7`, and Runtime archive digest
  `sha256:56001f3af96eb17a36c3688a212537ce70b4fdcbbee3d1e30b654b0b16264cb8`.
- Official managed host: three fresh rounds, 24/24 launches, 510 complete links
  per round, no staged links, in 8771 ms, 8502 ms, and 8468 ms.
- Installed `dsh --profile tianwen --dump-config`: exit 0 in 180 ms; the shared
  fallback was absent both before and after.

The source build's 233 links, Tianwen workspace's 505 links, and official
managed host's 510 links are three different deployment closures. The first
official-product check retained an expected-value failure after all 8 children
succeeded but the workspace-only 505 threshold encountered the managed host's
510 links. Making the deployment-specific expectation explicit was a test
correction, not a product retry.

## Tianwen integration facts

- Feature commit:
  `5091702c61ea44b7634b7c0d03301c7a60565e46`.
- New app-boot patch SHA-256:
  `712b5501c7657d9df49baedfec33c31c042a668c3501361c9766f92a12d553ad`.
- Existing CLI dump patch remained byte-identical, SHA-256:
  `5542c030bc6f1ad2dca8007d22de62cd330e29d553b09779985df9a24133c83f`.
- No DSH version or unrelated lock entry changed.
- Focused Tianwen Profile/installer tests: 50 passed, 3 skipped.
- Correctly configured full TypeScript gate: 52 files passed, 2 skipped; 668
  tests passed, 8 skipped.
- Python: Ruff and compileall passed; final suite 608 passed, 4 skipped.
- Exact Windows installer Vitest group: 4 files and 109 tests passed.

The first unconfigured full TypeScript invocation omitted the repository's
documented DSH probe environment and reported 87 shared fixture failures. That
invalid controller invocation is retained and was not treated as product
evidence. The first Python suite after the CI edit reported one exact-job
contract mismatch; the existing contract was updated to include the new direct
Node command, after which its focused 25/25 and full 608-test gates passed.

## Controller incident and cleanup

One built-CLI validation script accidentally used PowerShell's reserved
`$HOME` variable name. Its intended D:-hosted path assignment failed, so 24
invalid samples targeted `C:\Users\Administrator` and created one temporary
`profiles\web` directory plus 233 fallback links. The samples were discarded.
The controller verified every created link target, removed only those 233 links
and the new `web` directory, and restored the documented preflight state: ten
regular Profile directories, no `web`, and zero reparse points. No historical
Activity, evidence, Session, or evolution data was changed.

## Learning and external facts

- Learning remains `no-case`; controller salvage evidence is not a natural
  Outcome and cannot create a Skill retroactively.
- The early `.CMD` transport mistake can become learning input only if Tianwen
  first gains a narrow pre-Run failure signal and the problem recurs on an
  ordinary reachable product path. This change deliberately adds neither.
- Provider/model calls during salvage: zero.
- Provider billing cannot be inferred from process, Session, tool-event, or
  request counts and is not claimed here.
- External DSH push, pull request, release, or publication: zero.

## Remaining integration step

Merge the reviewed Tianwen branch into current `main`, push only Tianwen main,
and accept completion only from a CI run whose head SHA exactly equals the
resulting main SHA. Report Python, TypeScript, and `installer-windows`
separately. Do not push the local DSH branch.
