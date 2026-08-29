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
- **Web GUI visual smoke: NOT OBSERVED.** The component smoke is executable UI
  behavior evidence, but this session did not control a real browser window or
  observe painted DOM. It therefore does not claim Web GUI PASS.
- **Desktop artifact path for this fix digest: NOT REVALIDATED.** The previous
  unpacked Desktop artifact passed its archive audit, but it contains the
  pre-fix Runtime tarball. This focused fix did not rebuild Desktop and does not
  claim that the old artifact matches the refreshed Web proof digest.
- **Desktop visual smoke: NOT OBSERVED.** This session had no trustworthy
  interactive GUI control. It did not claim that a human saw or clicked the
  Learn Loop sidebar action. No long-Goal semantic scenario was repeated through
  Desktop.

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

No paid Provider was called. This handoff makes no Provider billing claim and
records no npm publication, GitHub Release, or DSH upstream push.

## Remaining boundary

A human or interactive session still needs to open the prepared Web Profile in
a real browser and launch the already built Desktop artifact, click **Learn
Loop**, confirm the overlay is visibly painted in both surfaces, and close it
while observing that Desktop's owned Web process and endpoint stop. That smoke
must not rerun the long-Goal semantic scenario.
