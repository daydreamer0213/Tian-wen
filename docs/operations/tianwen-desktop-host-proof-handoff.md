# Tianwen Desktop host Windows proof handoff

## Decision

The one frozen Windows opt-in attempt is **incomplete**. It is not evidence that the Desktop product
failed: the E2E harness stopped in its pre-launch build step before Electron, the Desktop main
process, or DSH Web started. It is also not a passed product proof, because no owned DSH PID, ready
URL, or closed port was produced.

Do not rerun this attempt or rewrite its result. A future proof must be a separate run boundary using
the corrected harness.

## Task result

The attempt ran from product commit
`e8a01e83cf03b826a5409ab6b8ad8dd608907a68`, which contains the reviewed Profile package-spec fix
`02fe416f6b33996eee18218c71b243293e9022c9`. The attempted E2E source had SHA-256
`07C4E4E09EDA81C2741BB8E29913420F49F4FAE30DDC4E0FE0A77B18E915E980`. Its exact bytes were
reconstructed after diagnosis, verified against that pre-run hash, and preserved at
`D:\DevData\tw-desktop-proof-20260828-01\attempted-e2e-source.ts` (5,513 bytes).

```text
Command: pnpm exec vitest run tests/dsh-migration/tianwen-desktop-host.e2e.spec.ts
Started UTC: 2026-08-28T05:39:31.2786269Z
Ended UTC: 2026-08-28T05:39:33.1591392Z
Exit: 1
Result: 1 test file failed; 1/1 test failed
Failure: Desktop build exited null
Log: D:\DevData\tw-desktop-proof-20260828-01\desktop-e2e.log
Log SHA-256: 7BFB0097ED2FDC9F3109915738EFFB74C95A4B53C8971678631050792DFB5ABA
```

The root cause was reproduced outside the E2E: Node 22 on this Windows host returned
`spawnSync pnpm.cmd EINVAL` for a direct `.cmd` launch with `shell:false`. The harness now invokes the
workspace TypeScript compiler through the current Node executable instead. That corrected E2E file
also records PID/port state before assertions and terminates a surviving owned PID in `finally`. It
had SHA-256 `D9B5D80738B7F905151BF264BDE5ACD2C0F2F7D7886875AC1072FAC8DAF65F13` at commit
`864851fe0da3078fb7f390dd101e3860783e2b40` and passed repository typecheck, but the real opt-in test
was intentionally not rerun.

At `2026-08-28T05:41:59.2606617Z`, post-attempt inspection ran this read-only query:

```powershell
Get-CimInstance Win32_Process |
  Where-Object {
    ($_.Name -ieq 'electron.exe' -or $_.Name -ieq 'node.exe') -and
    ($_.CommandLine -like '*tw-desktop-proof-20260828-01*' -or
      $_.CommandLine -like '*tianwen-desktop-host\dist\main.js*')
  } |
  Select-Object ProcessId, Name, CommandLine
```

Raw result: zero matching rows. This is an operation record rather than a separately persisted process
snapshot. No ready URL was produced, so there is no port-closure claim.

## Future harness cleanup boundary

Final branch review found one remaining future-run cleanup gap: if Electron had launched DSH but the
owned PID line was absent or malformed, the harness had no precise fallback candidate. The harness
now retains the spawned Electron main-process PID. A usable emitted DSH PID remains the preferred and
only candidate. When that line is unavailable after a normal Electron return, the harness invokes
the absolute Windows PowerShell executable with `shell:false` and queries only `node.exe` processes
whose `ParentProcessId` equals that specific Electron PID. It strictly accepts positive integer JSON
PIDs, checks each candidate still exists, and terminates each surviving process tree. It never scans
or kills global Node processes and does not infer ownership from `dshHome`, which is not present in
the DSH command line.

Three pure dependency-injected tests cover exact-PID preference, direct-child fallback selection,
and the absolute CIM command/strict PID parsing. Default execution runs those tests and keeps the one
real E2E as a planned skip, without starting Electron/DSH. The hardened E2E source has SHA-256
`7A0F771520D72031B7978F1800BB0B357E8AB9E596704045758CE87F15630793`. This hardening did not rerun or
change the frozen `incomplete` result.

## Product and runtime evidence

The fresh preparation root is `D:\DevData\tw-desktop-proof-20260828-01`. Large caches and temporary
files remained under `D:\DevData`.

The Runtime was built and packed from the same workspace. The DSH-owned Profile command ran exactly
once and exited `0`:

```powershell
node <exact-dsh-bin> plugin --profile web --allow-build=koffi add --offline <runtime-tarball>
```

```text
Profile preparation UTC: 2026-08-28T05:23:06.3857076Z..2026-08-28T05:23:09.1891899Z
Profile preparation log: D:\DevData\tw-desktop-proof-20260828-01\profile-prep.log
Profile preparation log SHA-256: 055FBE706DEBA86A3B332C702534CA8EDE0515F44C26D2810401BC6A04B78200
Runtime tarball SHA-256: F0FB4DBEC8776AAC3C18E5EFA95DDB5006DC503E30C5FA4FF1605AA6CF5DD440
Profile manifest SHA-256: 91DDEBB2DFB7997722ADDCA2AFBD4DE02EB3AF22926E6D3CF40AC3C7E432ADC7
Installed Runtime manifest SHA-256: 88DEB030FDB073B6689E230609FB0A7337A6791843BBA1BAD9DD53B643FAE685
```

The `web` Profile declares `@tianwen/runtime-bundle` exactly once in `dependencies` and exactly once
in `dsh.profile.bundles`. DSH records the local tarball with a `file:` package spec. The installed
entity is `@tianwen/runtime-bundle@0.1.0`, and its real path remains inside the Profile.

```text
Node: D:\hermes\node\node.exe, v22.23.1
Node SHA-256: F8D162C0641DCEE512132F3BCF8A68169C7ECB852EFD8E1A46C9FEC5A0F469ED
DSH: @deepseek-ai/dsh@0.1.1-rc.2, bin lib/bin.js
DSH bin SHA-256: C0226687BB20F45C603EC6FE50F3DE16D1C3510C3A803304EC575EF9BC366C62
DSH manifest SHA-256: DC930C0B18158F49AE3753CEAF6B1B7AE71DC6C8F45C85A2D679B142024ADDF7
Electron: 43.4.0
Electron executable SHA-256: BAB31519EE1BC5B490CAF7844E2B1DBCD4F7BB49A13039103952AB381C02ADE4
```

Before the opt-in attempt, the focused host suite passed `39/39`, the E2E default path reported one
planned skip, the Desktop package built, repository typecheck passed, and `git diff --check` passed.
These checks protect the implementation and default boundary; they do not substitute for the missing
real Desktop proof.

## Post-fix local gates

After the harness cleanup fix `3909ccca745feeb2a028a118f2d6c9ef6225d2dd`, the controller ran the
fresh local gates with the opt-in and Provider environment removed:

- frozen install, Runtime build, Desktop build, repository typecheck, DSH install check, and private
  import check: exit `0`;
- Desktop focused tests: `42 passed`, plus the one planned real E2E skip;
- canonical TypeScript Vitest partitions: `158/158` and `204/204` passed;
- all nine offline TypeScript CI demos: exit `0` with no Provider request;
- Windows installer gate: concurrent cold boot `8/8` (428 links), then `116/116` tests passed;
- Python gate on D-drive CPython `3.12.13`: Ruff and compileall exit `0`, then `608 passed` and
  `4 skipped` (the paid live probe and three documented Windows-specific skips);
- final `git diff --check`: exit `0`.

An initial `uv python install 3.12` attempt exhausted its network retries while fetching the standalone
archive. The already materialized D-drive CPython `3.12.13` was then verified and used with downloads
disabled for the successful code gate. This external download failure is not a project test failure.
None of these default/offline gates reran the frozen opt-in E2E or replace its incomplete result.

## Learning facts

- This was infrastructure verification, not a natural development task.
- No model Provider request was made, and Provider credentials were removed from the preparation and
  Electron child environments.
- The useful correction is narrow: Windows `.cmd` files are not direct executables for this
  `shell:false` Node spawn path. The harness now executes the installed TypeScript CLI with Node.
- The prepared Runtime and DSH paths were valid; the incomplete result came before they were consumed
  by the Desktop process.

## External facts

- No package, release, installer, updater, signing artifact, or public Desktop build was produced.
- No GitHub workflow was triggered.
- No DSH upstream repository was modified or pushed.
- No controlled Activity was created.

## Go/no-go and deferred work

No-go for declaring the Windows Desktop proof complete. This is not a no-go on the host architecture;
the actual Electron/DSH path remains untested by the frozen attempt. A separate fresh proof is needed
to establish ready-page behavior, owned PID shutdown, and port closure.

Installer, updater, signing, branding/name, renderer UI, Profile selection, and distribution remain
explicitly deferred.
