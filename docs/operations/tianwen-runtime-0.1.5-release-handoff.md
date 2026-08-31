# Tianwen Runtime 0.1.5 release handoff

**Date:** 2026-08-31
**Result:** local product path passed with a retained Desktop evidence-capture
gap; no external release action was taken

## Main integration closure

- Final merged `main` SHA: `5ac340a06729d861c9db2a1b321199694628382d`.
- `origin/main` was pushed to the same exact SHA.
- GitHub Actions run
  [`33357950429`](https://github.com/daydreamer0213/Tian-wen/actions/runs/33357950429)
  completed with conclusion `success` for exact head SHA `5ac340a06729d861c9db2a1b321199694628382d`.
- Exact-main jobs `python`, `typescript`, `installer-windows`, and `desktop-windows` all completed
  with conclusion `success`.
- This closes the local Runtime `0.1.5` implementation and release-integration stage. It does not
  claim an npm publish, Git tag, GitHub Release, installer upload, external DSH change, or a second
  natural Provider run.

## Product result

- Candidate source SHA: `8d5536b32fd427e6385165eb200089ee3a989106`.
- Accepted predecessor source SHA:
  `c39c7c6d9e755aff31ee0e5358b3b5d02557837b`.
- The built Runtime is exact `@tianwen/runtime-bundle@0.1.5`; the built Desktop
  is exact `0.1.0-preview.6`; the installed DSH remains exact `0.1.1-rc.2`.
- One real fresh predecessor install established Runtime `0.1.4`, one candidate
  install upgraded it to `0.1.5`, and one candidate replay returned `ready`
  without changing the current installed product bytes.
- Under the explicit product-priority boundary, the provider-free Desktop result
  is accepted as a local product pass: the durable transcript records the
  enabled exact target command and exit `0`, and the inspected exact test makes
  that exit conditional on its ready/PID/closed-connection assertions. The
  transcript does not retain the native `1 passed`, URL, or PID stdout, so the
  Desktop evidence package is partial rather than complete.

The isolated roots are:

- artifact root: `D:\DevData\tw015-artifacts-20260831-114224`;
- installed proof root: `D:\DevData\tw015-proof-20260831-114224`;
- detached predecessor worktree:
  `D:\DevData\tianwen-worktrees\tw014-predecessor`.

## Artifact identities and hashes

- Standalone Runtime archive:
  `D:\DevData\tw015-artifacts-20260831-114224\packs\tianwen-runtime-bundle-0.1.5.tgz`,
  334,365 bytes, SHA-256
  `825edf3bef20388c31db8e7f86032930928a94667aa7f0b93975999c4f66c126`.
- The staged Desktop Runtime archive and installed `0.1.5` archive have the
  same byte length and SHA-256 as the standalone archive.
- Accepted installed predecessor archive:
  `D:\DevData\tw015-proof-20260831-114224\packs\tianwen-runtime-bundle-0.1.4.tgz`,
  333,787 bytes, SHA-256
  `46d7641ed7e086d5091c47a4ad97ad767629b4542d456d3f92ec9782a8dd71ed`.
- Unpacked Desktop executable:
  `D:\DevData\tianwen-worktrees\tianwen-runtime-015-release\dist\tianwen-desktop\win-unpacked\Tianwen Desktop.exe`,
  225,533,440 bytes, SHA-256
  `9effc2fa5b90a5280f94c22004ba27b5a736c02a4deb0507ae3ca75573d6627d`.
- `dist\tianwen-desktop` contains exactly one matching NSIS installer:
  `Tianwen Desktop Setup 0.1.0-preview.6.exe`, 99,863,012 bytes, SHA-256
  `4703ee3e4715f0d9cfcf40c3f3e7203c2cf4a0e5774df1689f4b7047b1f4c0de`.
- Its blockmap is 105,075 bytes with SHA-256
  `b0975fa9e78462213d47debb4d29e57ea8822acb4d5206e8e84cb9293408a280`.
- Full machine-readable identities are retained at
  `D:\DevData\tw015-artifacts-20260831-114224\final-identities.json`.

## Actual commands and exit results

The cache variables used by build and install commands were:

```powershell
$env:COREPACK_HOME = 'D:\DevData\corepack-home'
$env:PNPM_CONFIG_STORE_DIR = 'D:\DevData\pnpm-store'
$env:NPM_CONFIG_CACHE = 'D:\DevData\npm-cache'
$env:ELECTRON_CACHE = 'D:\DevData\electron-cache'
$env:ELECTRON_BUILDER_CACHE = 'D:\DevData\electron-builder-cache'
```

The literal wrapper command below was attempted first and was blocked before
native product startup by local PowerShell policy:

```powershell
pnpm --filter '@tianwen/runtime-bundle...' build
```

With the explicitly authorized resolved command entrypoint, the actual artifact
commands were:

```powershell
$pnpmCmd = 'D:\hermes\node\pnpm.CMD'
& $pnpmCmd --filter '@tianwen/runtime-bundle...' build
& $pnpmCmd --filter '@tianwen/runtime-bundle' pack `
  --skip-manifest-obfuscation `
  --pack-destination 'D:\DevData\tw015-artifacts-20260831-114224\packs'
$runtimeArchive = 'D:\DevData\tw015-artifacts-20260831-114224\packs\tianwen-runtime-bundle-0.1.5.tgz'
node scripts/stage-desktop-runtime.mjs $runtimeArchive
& $pnpmCmd --filter '@tianwen/desktop-host' build
& $pnpmCmd --filter '@tianwen/desktop-host' pack:dir
# The same pack:dir command was the one explicitly authorized transfer recovery.
& $pnpmCmd --filter '@tianwen/desktop-host' pack:dir
& $pnpmCmd --filter '@tianwen/desktop-host' pack:win
node scripts/audit-desktop-artifact.mjs 'dist\tianwen-desktop\win-unpacked' $runtimeArchive
```

The corresponding exits were Runtime build `0`, Runtime pack `0`, Runtime
stage `0`, Desktop build `0`, first `pack:dir` `1` (external download timeout),
the single targeted `pack:dir` recovery `0`, the only `pack:win` `0`, and audit
`0`.

The actual predecessor and installed candidate commands were:

```powershell
$proofRoot = 'D:\DevData\tw015-proof-20260831-114224'
git worktree add --detach 'D:\DevData\tianwen-worktrees\tw014-predecessor' `
  c39c7c6d9e755aff31ee0e5358b3b5d02557837b
node 'D:\DevData\tianwen-worktrees\tw014-predecessor\scripts\install-tianwen.mjs' `
  --data-dir $proofRoot --json
node scripts/install-tianwen.mjs --data-dir $proofRoot --json # one upgrade
node scripts/install-tianwen.mjs --data-dir $proofRoot --json # one replay
```

All four exits were `0`. The actual archive identity comparison was:

```powershell
$installedArchive = "$proofRoot\packs\tianwen-runtime-bundle-0.1.5.tgz"
$artifactHash = (Get-FileHash $runtimeArchive -Algorithm SHA256).Hash.ToLowerInvariant()
$installedHash = (Get-FileHash $installedArchive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($artifactHash -ne $installedHash) {
  throw 'Standalone and installed Runtime archives differ'
}
```

After matched Provider credential variables were removed from each command
environment without recording their values, the actual Desktop commands were:

```powershell
$nodeExe = (Get-Command node.exe).Source
$dshHome = "$proofRoot\dsh-home"
$dshRoot = "$proofRoot\dsh-host\node_modules\@deepseek-ai\dsh"
$desktopExe = (Resolve-Path 'dist\tianwen-desktop\win-unpacked\Tianwen Desktop.exe').Path
$env:DSH_HOME = $dshHome
$env:DSH_TELEMETRY_DISABLED = '1'
& $nodeExe "$dshRoot\lib\bin.js" `
  plugin --profile web --allow-build=koffi add $runtimeArchive
$env:TIANWEN_DESKTOP_HOST_E2E = '1'
$env:TIANWEN_DESKTOP_HOST_NODE = $nodeExe
$env:TIANWEN_DESKTOP_HOST_DSH_ROOT = (Resolve-Path $dshRoot).Path
$env:TIANWEN_DESKTOP_HOST_DSH_HOME = (Resolve-Path $dshHome).Path
$env:TIANWEN_DESKTOP_EXECUTABLE = $desktopExe
node node_modules/vitest/vitest.mjs run `
  tests/dsh-migration/tianwen-desktop-host.e2e.spec.ts `
  -t 'opens the prepared Web Profile and closes its owned DSH process'
```

The Profile command and exact E2E target command each returned exit `0`.

## Installed upgrade and replay

The predecessor installer ran once and returned exit `0`, `status=ready`, DSH
`0.1.1-rc.2`, and the exact historical Runtime `0.1.4` archive digest above.

Before upgrade, sorted SHA-256 manifests recorded:

- DSH host: 29,236 files;
- managed `tianwen` Profile: 27,513 files;
- receipt: 1 file;
- Runtime archives: 1 file;
- naturally existing Session files: 0;
- naturally existing evolution files: 0.

No synthetic Session, evolution file, or marker was created under `DSH_HOME`.

The candidate installer ran once and returned exit `0`, `status=ready`. The
installed `tianwen` Profile reports Runtime `0.1.5`. The receipt records
`archiveDigest=sha256:825edf3bef20388c31db8e7f86032930928a94667aa7f0b93975999c4f66c126`,
which equals the independently hashed installed and standalone archive bytes.
Both the `0.1.4` and `0.1.5` archives remain in `proofRoot\packs`.

The DSH host manifest was identical before upgrade and after upgrade. Its
manifest SHA-256 at all three boundaries (before upgrade, after upgrade, and
after replay) is
`350beda33eb6af082c4cde8924bcb02db16194ce26ffa498ec3874a829a2910b`.
Naturally existing Session and evolution sets remained empty; this is an
absence fact, not a preservation claim about invented data.

The candidate replay ran once and returned exit `0`, `status=ready`. The
after-upgrade and after-replay sorted manifests are byte-identical for:

- receipt: `466cf85db1d3f2b61c76ed7161b366f6297ee360a115ebc75d9201f7a919bd04`;
- managed Profile:
  `4420525fc23f75a756445e3afc50e5a8c1839807b4ac0d46ca8b6302952b0fc4`;
- Runtime archives:
  `3a91f9e58b5e3c37a73dd15c1616cfa8bc99f6e6b4bfc1fe7c4802d23c9c55fe`;
- DSH host, as recorded above;
- empty Session and evolution manifests:
  `a5338d955b09046ec0b16f3a9625b7955c763aae07dc722e474e6078745f932f`.

No `.install-*` or `.tianwen-backup-*` directory remains.

## Provider-free startup

The formal installed DSH plugin command prepared existing Desktop Profile
`web` from the candidate archive and exited `0`. Before this command,
`DEEPSEEK_API_KEY` was removed from the command environment and the remaining
matched Provider credential variable count was `0`.

Durable evidence for the installed Desktop boundary is limited to these facts:

- `desktop-provider-free-e2e.txt` records
  `TIANWEN_DESKTOP_HOST_E2E='1'`, the exact test file and `-t` target, matched
  Provider credential count `0`, and explicit native exit `0`;
- the inspected test source places that exact test under
  `describe.skipIf(!enabled)`, where `enabled` requires Windows and the same E2E
  flag;
- the exact test requires Desktop exit `0`, no signal, a parsed loopback ready
  URL and owned PID, the owned PID absent after Desktop exit, and three failed
  post-stop HTTP connection attempts.

The controller observed the native `1 passed` summary, owned DSH PID `8856`, and
`http://127.0.0.1:60172/` during that command. Windows transcript capture did not
retain those three streamed stdout observations, so they are controller
observations rather than independently durable log evidence. A later read-only
filtered process check observed zero proof-root product processes and PID `8856`
absent, but it cannot reconstruct the missing in-run stdout.

The secondary `final-verification.txt` gate searched the transcript for
`Tests 1 passed` and therefore ended with
`FAIL=Desktop E2E pass evidence missing`. It did not run Vitest or report a
product assertion failure; it failed because the searched native summary was
not captured. There is no `FINAL_GATE=PASS` claim. Under the product-priority
boundary, exact-target exit `0` plus the inspected assertion-bearing source is
accepted as the local product result, while the missing durable URL/PID/test-
count output remains an evidence-completeness uncertainty.

The installed `web` Profile reports Runtime `0.1.5`. The interactive outdated-
Profile confirmation path was not automated or repeated.

## Deterministic verification

- Runtime dependency build: exit `0`.
- Runtime pack: exit `0`.
- Desktop Runtime stage: exit `0`.
- Desktop TypeScript build: exit `0`.
- Targeted Desktop `pack:dir` recovery boundary: exit `0`.
- The only planned `pack:win`: exit `0`.
- `audit-desktop-artifact.mjs`: exit `0`, reported `Desktop artifact audit
  passed`.
- Exact predecessor worktree creation and install: exits `0`, `0`.
- Candidate upgrade and replay: exits `0`, `0`.
- Formal `web` Profile plugin preparation: exit `0`.
- Provider-free installed Desktop exact target: durable exit `0`; the controller
  observed `1 passed`, but that native summary is absent from the transcript.
- Secondary transcript regex gate: `FAIL=Desktop E2E pass evidence missing`;
  no `FINAL_GATE=PASS` is claimed.

Command transcripts and sorted manifests are retained below the artifact root
in `logs` and `manifests` respectively.

## Failures retained honestly

Two pre-result controller/transport failures are retained rather than hidden:

1. The literal first `pnpm` invocation was blocked before product build by the
   local PowerShell policy selecting `D:\hermes\node\pnpm.ps1`. It produced no
   native exit code and did not start the Runtime build. The original transcript
   is `logs\artifact-build.txt`. Under the explicit recovery boundary, later
   `pnpm` commands used resolved `D:\hermes\node\pnpm.CMD`; system and user
   execution policy were not changed.
2. The first real Desktop `pack:dir` returned exit `1` after Electron Builder
   reported `connect ETIMEDOUT 20.205.243.166:443`. The successful Runtime
   build/pack/stage and Desktop build were not repeated. Under the explicit
   external-download recovery boundary, exactly one targeted `pack:dir` retry
   used `D:\DevData\electron-cache` and
   `D:\DevData\electron-builder-cache`; it downloaded and extracted Electron
   and exited `0`. The first exit remains in `logs\artifact-build-product.txt`;
   the bounded recovery is in `logs\desktop-pack-dir-transport-retry.txt`.

The initial controller serialization of empty Session/evolution arrays emitted
no files because an empty PowerShell pipeline has no output. Product state was
not changed. The evidence writer was corrected to serialize an explicit empty
array (`[]`), after which before/after comparisons were rerun. This is why the
handoff reports zero naturally existing files rather than inventing fixtures.

Windows PowerShell transcripts did not capture every native child's streamed
stdout. In particular, the Desktop E2E transcript retains credential clearing
and explicit exit `0`, while the same command's controller output contains the
`1 passed` Vitest summary, PID, and loopback ready line. Those facts are not
silently upgraded into transcript content.

The retained `logs\final-verification.txt` ends in
`FAIL=Desktop E2E pass evidence missing` because it required the absent native
summary. This secondary evidence check did not execute the product or its test;
its failure is not a product assertion result. It does leave the documented
uncertainty that the URL/PID/test-count observations are not independently
recoverable from the transcript.

No internal event, dependency download, test event, or process event is treated
as evidence of Provider usage or cost.

## External actions not taken

- No Provider request was made.
- No package publish, Git push, tag, GitHub/GitLab Release, installer upload, or
  external distribution was performed.
- No DSH upstream repository, package, or release was changed.
- The NSIS installer is a retained local artifact only.

## Cleanup and retained evidence

- `D:\DevData\tw015-artifacts-20260831-114224` is retained with artifacts,
  logs, manifests, and `final-identities.json`.
- `D:\DevData\tw015-proof-20260831-114224` is retained as the installed-product
  proof. It contains the DSH host, `tianwen` and `web` Profiles, receipt, and
  both Runtime archives.
- `D:\DevData\tianwen-worktrees\tw014-predecessor` is retained as the detached
  accepted predecessor source for audit. It was not force-removed.
- Generated Desktop output under `dist\tianwen-desktop` is retained.
- No installer temp/backup directory or proof-root product process remains.
