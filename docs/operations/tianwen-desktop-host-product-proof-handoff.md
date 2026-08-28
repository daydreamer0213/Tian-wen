# Tianwen Desktop host product proof handoff

## Decision

The separate `-03` Windows product proof **passed**. Real Electron started the Desktop main process,
which started exact DSH Web through the external Node 22 executable. The window reached the loopback
page, then the owned DSH process exited and subsequent HTTP attempts to that loopback URL failed.

This result does not rewrite the earlier `-01` and `-02` incomplete records. It establishes the
Desktop lifecycle that those attempts never reached.

## Product attempt

The frozen attempt ran exactly once from clean commit
`d48e95ecfdbed698aa68cf1f8c8a5301d23af5f0` with E2E source SHA-256
`7A0F771520D72031B7978F1800BB0B357E8AB9E596704045758CE87F15630793`.

```text
Command: pnpm exec vitest run tests/dsh-migration/tianwen-desktop-host.e2e.spec.ts
Started UTC: 2026-08-28T06:58:16.5131248Z
Ended UTC: 2026-08-28T06:58:27.5314462Z
Exit: 0
Vitest: 1 file passed; 4/4 tests passed
Owned DSH PID: 10012
Ready URL: http://127.0.0.1:64050/
Log: D:\DevData\tw-desktop-proof-20260828-03\desktop-product-e2e.log
Log SHA-256: 818BDCAD37820245C66ECD48C49E09CE4EBEC2D84BD7173DF1301D2F9323B938
```

The E2E itself asserted Electron exit `0`, no surviving owned DSH PID, and three failed HTTP
connection attempts after shutdown. The controller independently repeated only the post-exit observations:
PID `10012` was absent, the `-03`/Desktop-main process query returned zero matching Electron or Node
processes, and all three HTTP connection attempts to the recorded URL failed. No product process was
started a second time.

## Prepared runtime identity

The proof used the fresh root `D:\DevData\tw-desktop-proof-20260828-03`. Runtime build and pack
completed locally, and the DSH-owned offline Profile add completed with the validated shared
`D:\DevData\pnpm-store`:

```text
Profile preparation UTC: 2026-08-28T06:56:49.3534709Z..2026-08-28T06:56:51.9089487Z
Profile preparation exit: 0
Profile preparation log SHA-256: C331890E26F0533966351C2F90DDC46CE98895F244C1863B8B43641BCE042EAC
Runtime tarball SHA-256: A7921D67D458274B136564DAC0CD2475D1056E313922596890B9AC3B1802DB16
Profile manifest SHA-256: 26A93124F584590FC74E959C5205F12985E98B9DC1E4653C360A8892C69F7A23
Installed Runtime manifest SHA-256: 37D463630D82FC69249940C09D8B560C924E9D880DBDE590279789F7E827C4D9
```

The `web` Profile declares `@tianwen/runtime-bundle` exactly once in `dependencies` and exactly once
in `dsh.profile.bundles`. DSH records the local tarball as a non-empty `file:` package spec. The
installed entity is exact `@tianwen/runtime-bundle@0.1.0`, and its real path is physically contained
inside the fresh Profile.

Exact host identities remained:

```text
Node: D:\hermes\node\node.exe, v22.23.1
Node SHA-256: F8D162C0641DCEE512132F3BCF8A68169C7ECB852EFD8E1A46C9FEC5A0F469ED
DSH: @deepseek-ai/dsh@0.1.1-rc.2, bin lib/bin.js
DSH bin SHA-256: C0226687BB20F45C603EC6FE50F3DE16D1C3510C3A803304EC575EF9BC366C62
DSH manifest SHA-256: DC930C0B18158F49AE3753CEAF6B1B7AE71DC6C8F45C85A2D679B142024ADDF7
Electron: 43.4.0
Electron executable SHA-256: BAB31519EE1BC5B490CAF7844E2B1DBCD4F7BB49A13039103952AB381C02ADE4
```

An initial setup-only logging wrapper used an unsupported `Tee-Object` parameter combination and
stopped before build, Profile preparation, or Electron. The setup was corrected before the frozen
product attempt. This is an operational setup fact, not a second product run.

## Learning and external facts

- This was infrastructure/product verification, not a Tianwen natural development task.
- No model Provider request was made. Provider credential variables were removed without recording
  their names or values.
- No controlled Activity or learning candidate was created.
- No GitHub workflow or exact-main CI was triggered.
- No product installer, updater, signing artifact, release, publication, or DSH upstream push was
  produced. The local Runtime tarball exists only as proof/Profile input.

## Integration recommendation

The Desktop host branch may now enter integration evaluation. The product proof does not by itself
authorize a blind merge: first review the full ancestry and diff against current `main`, confirm the
DSH rc.2 migration commits that the branch depends on, and rerun the relevant exact-commit gates for
the chosen integration commit. External DSH publication remains optional.
