# Tianwen Desktop recovery proof handoff

## Decision

The separate recovery proof is **incomplete**. The only DSH-owned offline Profile preparation command
exited `1` because the selected proof-local pnpm store was empty and lacked
`@deepseek-ai/dsh-llm@0.1.1-rc.2`. Per the frozen no-retry rule, the run stopped before Electron.

This is not evidence that the Desktop product failed: Electron, DSH Web, and the lifecycle assertions
never ran. It is also not a passed proof. Preserve this result and do not rewrite or rerun it under
the same root.

## Task result

Preflight passed from clean branch HEAD
`2fdda020ef5e369014327d1ac0e3a39818517b85`. That commit differs from the reviewed harness commit
`2523a7402333a1f67035e64000c634f80b8be1a1` only by the Task 4 plan document. The E2E source SHA-256
remained `7A0F771520D72031B7978F1800BB0B357E8AB9E596704045758CE87F15630793`.

The new root `D:\DevData\tw-desktop-proof-20260828-02` did not exist at preflight. The original
`D:\DevData\tw-desktop-proof-20260828-01` remained present and was not modified.

Runtime build and pack succeeded:

```text
UTC: 2026-08-28T06:38:42.0026989Z..2026-08-28T06:38:45.8755521Z
Runtime tarball: D:\DevData\tw-desktop-proof-20260828-02\packs\tianwen-runtime-bundle-0.1.0.tgz
Runtime tarball SHA-256: A7921D67D458274B136564DAC0CD2475D1056E313922596890B9AC3B1802DB16
Build/pack log SHA-256: B87DA560DB799BD317C8940A81C1D6EE0C9983AB024644D9AF4F85B0C0314631
```

The DSH-owned Profile add then ran exactly once:

```text
UTC: 2026-08-28T06:39:36.4410858Z..2026-08-28T06:39:37.9052359Z
Exit: 1
Log: D:\DevData\tw-desktop-proof-20260828-02\profile-prep.log
Log SHA-256: 0A3D94ECA647573071105CB45D23E6AF89F127CAA026C6D0AA778A7D2C1944A2
Failure: ERR_PNPM_NO_OFFLINE_TARBALL for @deepseek-ai/dsh-llm@0.1.1-rc.2
Selected store: D:\DevData\tw-desktop-proof-20260828-02\pnpm-store\v11
```

An initial PowerShell wrapper attempt had stopped before entering DSH because it used a reserved
variable name. It created no DSH home and did not consume the one DSH invocation. The corrected
wrapper made the single command above.

The failed install left zero Runtime dependency declarations and zero Runtime bundle declarations.
Although a partial `@tianwen/runtime-bundle@0.1.0` entity exists physically inside the Profile, it
does not satisfy the frozen preparation gate. The opt-in Electron E2E was therefore not invoked.

## Product and runtime evidence

Exact preflight identities matched:

```text
Node: D:\hermes\node\node.exe, v22.23.1
Node SHA-256: F8D162C0641DCEE512132F3BCF8A68169C7ECB852EFD8E1A46C9FEC5A0F469ED
DSH: @deepseek-ai/dsh@0.1.1-rc.2, bin lib/bin.js
DSH bin SHA-256: C0226687BB20F45C603EC6FE50F3DE16D1C3510C3A803304EC575EF9BC366C62
DSH manifest SHA-256: DC930C0B18158F49AE3753CEAF6B1B7AE71DC6C8F45C85A2D679B142024ADDF7
Electron: electron@43.4.0, executable reports v43.4.0
Electron executable SHA-256: BAB31519EE1BC5B490CAF7844E2B1DBCD4F7BB49A13039103952AB381C02ADE4
Workspace Runtime: @tianwen/runtime-bundle@0.1.0
```

There is no Electron exit, owned DSH PID, ready URL, or PID/port closure evidence. A read-only
post-failure process query found zero matching Electron/Node processes; that confirms no matching
process residue, not the absence of the recorded partial Profile and not the Desktop lifecycle.

## Learning facts

- This was infrastructure verification, not a natural task.
- No Provider request was made; one detected credential environment variable was removed without
  recording its name or value.
- A fresh DSH home and a fresh pnpm store are different boundaries. The new home was required; the
  empty store was not. The selected offline store lacked the exact dependency closure.
- The reviewed E2E harness was not reached and is not implicated by this incomplete result.

## External facts

- No GitHub workflow or exact-main CI was triggered.
- No controlled Activity was created.
- No product installer, updater, signing artifact, release, or publication was produced. A local
  Runtime proof tarball was generated only for Profile preparation and was not published.
- No DSH upstream repository was modified or pushed.
- Product code, tests, the previous handoff, and the previous proof root were not changed.

## Integration recommendation

No-go for merging this Desktop proof into `main` or declaring the Windows Desktop path complete.
Keep the `-02` evidence unchanged.

Before authorizing any later proof, validate the chosen D-drive pnpm store's complete offline DSH
dependency closure without consuming the frozen Profile-add invocation. A later proof should use a
new root and the already validated shared D-drive store, or a separately pre-populated equivalent.
This preparation failure does not justify a Desktop product-code change.
