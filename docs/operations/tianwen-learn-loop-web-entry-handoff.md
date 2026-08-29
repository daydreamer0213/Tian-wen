# Tianwen Learn Loop Web entry handoff

## Status

- **Web host and package wiring: PASS.** A fresh DSH `0.1.1-rc.2` Web Profile
  discovered the packed `@tianwen/runtime-bundle` client, served its
  `client.js`, and completed the real `/tianwen` Connection RPC scenario.
- **Compiled Web client component smoke: PASS.** The built browser module was
  evaluated through the DSH module-loader contract. Its real sidebar component
  registered, opened the overlay, created a plan, distinguished cold Continue
  from running Open Session using the public Session/Goal projection, waited
  for Session projection before navigation, and disabled blocked or
  workspace-less actions.
- **Standalone browser GUI visual smoke: NOT OBSERVED.** The earlier component
  smoke remains executable UI behavior evidence, but no separate browser-plugin
  window was controlled in that session.
- **Localized Desktop artifact: PASS.** The unpacked Desktop was rebuilt with
  the exact freshly packed localized Runtime. The fixed artifact audit passed,
  including an exact SHA-256 comparison between the source tarball and the
  Runtime embedded in Desktop.
- **Packaged localized Desktop visual smoke: OBSERVED WITH TOOLING LIMITATION.**
  One real packaged Desktop window displayed the DSH shell in Chinese, the
  Tianwen sidebar entry as `长期任务`, and a Chinese-only create form. The
  observation contained no simultaneous English Tianwen labels. Windows
  Computer Use returned an uncertain input/refresh result before the three-step
  empty-state instructions could be observed. Those three instructions are
  covered by the passed compiled-client test, but this handoff does not claim
  they were seen in the real window. This is an external GUI-control limitation,
  not a Tianwen product failure.

## Product result

The assembled host/product-wiring test used a disposable root at
`D:\DevData\tianwen-learn-loop-web-product-tests\proof`, installed the exact
packed Runtime Bundle in a fresh DSH Web Profile, and booted the official Web
entry on loopback. The client graph contained `@tianwen/runtime-bundle`, and
`/plugins/@tianwen/runtime-bundle/client.js` returned successfully.
The product Profile's exact bundle order was `@deepseek-ai/dsh-base`,
`@deepseek-ai/dsh-web-app`, then `@tianwen/runtime-bundle`; it did not install
the probe bundle.

Separately, the always-run compiled-client smoke evaluated the exact built
`dist/client.js`, invoked its registered sidebar action through the DSH client
slot contract, opened the overlay, submitted the create form, and exercised
cold Continue and Session navigation. This is component/runtime evidence, not
a visual browser observation.

The localized product integration then reused one freshly built Runtime
tarball in one audited unpacked Desktop. On a `zh-CN` Windows system with no
saved locale preference, one packaged Desktop launch showed the real DSH shell
in Chinese, the `长期任务` entry, and the Chinese create form. No Goal was
created and no Task was started. The three-step Chinese empty-state copy was
not claimed as visually observed because the Windows GUI controller returned
an uncertain click/refresh outcome; the already passed compiled-client test
covers those exact three lines without making a visual claim.

Using the real `/tianwen` Connection RPC, the test created and read a two-Task
plan without starting a Session or model turn. It then invoked
`run-current-task` exactly once with the offline deterministic model. The first
Task received one bound Session before the first `turn/start`; the second Task
remained unbound.

## Runtime evidence

- Proof receipt:
  `D:\DevData\tianwen-learn-loop-web-product-tests\proof\product-proof.json`
- DSH version: `0.1.1-rc.2`
- Web Profile root:
  `D:\DevData\tianwen-learn-loop-web-product-tests\proof\home\profiles\web`
- Runtime tarball:
  `D:\DevData\tianwen-learn-loop-web-product-tests\proof\packs\tianwen-runtime-bundle-0.1.0.tgz`
- Runtime SHA-256:
  `d7ca241e9bc4e535feea5b26f7b339070ae0de1851f2cf46f7fe742a1d9a6ab9`
- Long Goal ID: `tianwen-long-goal-4254b950-bc09-47cf-8d9a-8b7339515b49`
- First Task binding:
  - Goal ID: `goal-b802fd38-bac9-413f-b8bc-3d0429a38a55`
  - Session ID: `session-514fcb8c-9388-4832-bc60-6fe2add8fb4d`
- Second Task binding: `null`
- Creation facts: Session count `0 -> 0`; `turn/start` count `0 -> 0`;
  actual RPC runtime status was `activation: not-loaded`, `modelRequests: 0`,
  `readOnly: true`.
- Status-read facts: Session count `0 -> 0`; `turn/start` count `0 -> 0`;
  actual RPC runtime status was `activation: not-loaded`, `modelRequests: 0`,
  `readOnly: true`.
- Admission facts: Session count `1`; binding timestamp
  `1788006439841`; first `turn/start` timestamp `1788006439927`; therefore the
  binding was strictly earlier than the first turn.
- Owned Web PID during proof: `10820`. The test stopped that exact process tree
  in `finally`; the loopback endpoint was confirmed closed.
- The existing unpacked Desktop artifact was not rebuilt for this digest.

### Localized packaged Desktop integration

- Source Runtime tarball:
  `D:\DevData\tianwen-chinese-product-ux\pack\tianwen-runtime-bundle-0.1.0.tgz`
- Runtime SHA-256:
  `f71b6c910dc6cce52031ec8cb98d2cae282a9625c0a69f37ed0f6fd149aca6fa`
- Audited unpacked Desktop:
  `D:\DevData\tianwen-worktrees\tianwen-architecture-overview-v2-merge\dist\tianwen-desktop\win-unpacked`
- Artifact audit: PASS. The embedded Runtime digest was exactly the source
  digest above.
- Disposable Web Profile:
  `D:\DevData\tianwen-chinese-product-ux\gui-smoke\dsh-home\profiles\web`
- Node: `v22.23.1` at `D:\hermes\node\node.exe`.
- DSH: exact `@deepseek-ai/dsh@0.1.1-rc.2`.
- The packaged Desktop accepted all three explicit `--node`, `--dsh-root`, and
  `--dsh-home` targets and reached the ready loopback page.
- Desktop root PID during the one observation: `8840`.
- Desktop-owned DSH PID: `15684`; observed parent PID: `8840`.
- Loopback endpoint: `http://127.0.0.1:61172/`; initial response status: `200`.
- After closing the sole Desktop window, PID `8840`, PID `15684`, and the
  loopback endpoint were all absent.
- The child environment contained no Provider credential variable, and the
  disposable DSH home contained no Provider credential file. No Goal, Task,
  Session, Activity, or Provider action was created or started. No model request
  was initiated.
- DSH created only its upstream onboarding setting during the observation; it
  did not save a locale preference.

## TDD evidence

The first meaningful RED failed because the verifier's exact installed Runtime
file set did not allow the new client artifact. A second focused RED reproduced
the real DSH registry failure: `@tianwen/runtime-bundle/package.json` was not an
exported package subpath. After those minimal fixes, the first real
`run-current-task` attempt exposed a Koffi native-module version mismatch. The
Web Profile bootstrap was aligned with the installer's existing managed policy
by pinning Koffi `3.1.4`, while preserving `nodeLinker` and `allowBuilds`; no
CMake install or copied native binary was introduced.

The final review-fix RED had `12` focused failures across client parsing, host
blocked admission, and literal predecessor fixtures. The compiled-client RED
then had `4/4` failures for unstable Task-row identity, cold/running action
selection, immediate Session navigation, and missing disabled states. The
minimal GREEN retained the existing DSH Session projection and Agent loop; it
added no retry framework, UI framework, or dependency. The refreshed flagged
Web host/product proof passed `1/1` in `79.17s`.

## Proportional gate

- Runtime Bundle build: PASS.
- Focused migration suite: `9` files passed, `1` file skipped by the intentional
  product-test environment gate; `163` tests passed, `1` skipped.
- Private DSH import check: PASS with no violations.
- TypeScript typecheck: PASS.
- `git diff --check`: PASS.

## Learning and external facts

No natural task, controlled Activity, learning-efficacy measurement, or new
learning fact was produced in this stage. The offline deterministic product run
is runtime acceptance evidence only.

No paid Provider was called. The localized packaged observation initiated zero
model requests and no Provider action. This handoff makes no Provider billing
claim and records no npm publication, GitHub Release, or DSH upstream push.

## Remaining boundary

The localized packaged Desktop product handoff is locally closed with one
external tooling limitation: the real window observation covered Chinese DSH,
the `长期任务` entry, and the Chinese-only create form, while the three-step
empty-state instructions remain compiled-client test evidence rather than a
real-window observation. No repeat launch was used to select a better outcome.

This stage does not add a controlled Activity, learning-efficacy claim, paid
Provider call, or repeated long-Goal semantic scenario. Push and exact-main CI
remain controller-owned follow-up actions.
