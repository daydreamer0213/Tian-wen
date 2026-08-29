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
The product Profile's exact bundle order was `@deepseek-ai/dsh-base`,
`@deepseek-ai/dsh-web-app`, then `@tianwen/runtime-bundle`; it did not install
the probe bundle.

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
  `ca377faf6427d0a14c515fa303644eba2b25d389afd333a1bc93cfd47adc590f`
- Long Goal ID: `tianwen-long-goal-71c6f7ee-56d6-4fb0-a5b7-146b7b436db0`
- First Task binding:
  - Goal ID: `goal-7601c4e1-3aca-4a89-845e-caf51a286fa4`
  - Session ID: `session-75dee7ff-4914-4070-ad89-bf31f1d3697b`
- Second Task binding: `null`
- Creation facts: Session count `0 -> 0`; `turn/start` count `0 -> 0`;
  actual RPC runtime status was `activation: not-loaded`, `modelRequests: 0`,
  `readOnly: true`.
- Status-read facts: Session count `0 -> 0`; `turn/start` count `0 -> 0`;
  actual RPC runtime status was `activation: not-loaded`, `modelRequests: 0`,
  `readOnly: true`.
- Admission facts: Session count `1`; binding timestamp
  `1788003217758`; first `turn/start` timestamp `1788003217821`; therefore the
  binding was strictly earlier than the first turn.
- Owned Web PID during proof: `10916`. The test stopped that exact process tree
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

The review-fix RED proved that the original Profile still contained the probe
bundle. The minimal product-only branch removed that install while leaving the
ordinary verifier modes unchanged. The final flagged Web product run passed:
`1` test passed in `69.70s`. The
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
