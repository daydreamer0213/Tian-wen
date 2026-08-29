# Tianwen Learn Loop Web entry handoff

## Status

- **Web product path: PASS.** A fresh DSH `0.1.1-rc.2` Web Profile loaded the
  packed `@tianwen/runtime-bundle` client, served its `client.js`, and completed
  the real `/tianwen` Connection RPC scenario.
- **Desktop artifact path: PASS.** The existing unpacked Tianwen Desktop was
  built with the exact Runtime Bundle tarball proven by the Web test. The
  artifact audit found `package/dist/client.js`, matched the source digest, and
  found no embedded DSH, pnpm, Profile state, or second Runtime copy.
- **Desktop visual smoke: NOT OBSERVED.** This session had no trustworthy
  interactive GUI control. It did not claim that a human saw or clicked the
  Learn Loop sidebar action. No long-Goal semantic scenario was repeated through
  Desktop.

## Product result

The assembled-product test used a disposable root at
`D:\DevData\tianwen-learn-loop-web-product-tests\proof`, installed the exact
packed Runtime Bundle in a fresh DSH Web Profile, and booted the official Web
entry on loopback. The client graph contained `@tianwen/runtime-bundle`, and
`/plugins/@tianwen/runtime-bundle/client.js` returned successfully.

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
  `cef72497e6f75b6ead7c40f5e78fd478a6bfcbe6e6f495ec54e303981a80e2ac`
- Long Goal ID: `tianwen-long-goal-6b9d7975-81bc-430a-8a26-8e49cd925202`
- First Task binding:
  - Goal ID: `goal-64fa6504-6284-414c-8a70-1569d3ccb3c2`
  - Session ID: `session-a1a7d02d-bd14-4859-8af8-a40fc119911f`
- Second Task binding: `null`
- Creation facts: Session count `0 -> 0`; `turn/start` count `0 -> 0`;
  model requests `0`.
- Status-read facts: Session count `0 -> 0`; `turn/start` count `0 -> 0`;
  model requests `0`.
- Admission facts: Session count `1`; binding timestamp
  `1788001692840`; first `turn/start` timestamp `1788001692876`; therefore the
  binding preceded the first turn.
- Owned Web PID during proof: `10336`. The test stopped that exact process tree
  in `finally`; the loopback endpoint was confirmed closed.
- Desktop unpacked artifact:
  `D:\DevData\tianwen-worktrees\tianwen-architecture-overview-v2-merge\dist\tianwen-desktop\win-unpacked`
- The staged and Desktop-packaged tarballs both matched the Runtime SHA-256
  above. Electron and builder caches were kept under `D:\DevData`.

## TDD evidence

The first meaningful RED failed because the verifier's exact installed Runtime
file set did not allow the new client artifact. A second focused RED reproduced
the real DSH registry failure: `@tianwen/runtime-bundle/package.json` was not an
exported package subpath. After those minimal fixes, the first real
`run-current-task` attempt exposed a Koffi native-module version mismatch. The
Web Profile bootstrap was aligned with the installer's existing managed policy
by pinning Koffi `3.1.4`, while preserving `nodeLinker` and `allowBuilds`; no
CMake install or copied native binary was introduced.

The final flagged Web product run passed: `1` test passed in `73.31s`. The
focused Desktop artifact spec passed `8/8`, including rejection of an otherwise
valid Runtime tarball missing `package/dist/client.js`.

## Proportional gate

- Runtime Bundle build: PASS.
- Focused migration suite: `8` files passed, `1` file skipped by the intentional
  product-test environment gate; `152` tests passed, `1` skipped.
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

A human or interactive session still needs to launch the already built Desktop
artifact against the prepared Web Profile, click **Learn Loop**, confirm the
same overlay is visible, and close it while observing that its owned Web process
and endpoint stop. That smoke must not rerun the long-Goal semantic scenario.
