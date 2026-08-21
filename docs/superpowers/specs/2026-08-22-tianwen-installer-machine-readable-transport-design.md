# Tianwen installer machine-readable transport design

## 1. Observed boundary and decision

The official installer already owns the safe failure-receipt contract. A
zero-side-effect parser probe established the remaining boundary precisely:

- ordinary `pnpm run install:tianwen -- --json --invalid-safe-probe` adds pnpm
  lifecycle presentation, so stdout is not one JSON value;
- `pnpm --silent run install:tianwen -- --json --invalid-safe-probe` can make
  the wrapper quiet, but remains a package-manager presentation layer; and
- Node 22's stable `node --run install:tianwen -- --json --invalid-safe-probe`
  exits 1 with one exact three-key `tianwen.install-failure.v1` receipt and
  empty stderr while running the package script itself.

The root cause is therefore known: normal pnpm presentation, not the installer
transaction, DSH, or the receipt schema, contaminates the machine-readable
transport. The single canonical machine invocation is:

```powershell
node --run install:tianwen -- --data-dir D:\DevData\tianwen --json
```

This is an operational calling convention. It does not change the ordinary
human-oriented non-JSON command, the installer success receipt, the stage-only
failure receipt, or any installer transaction behavior.

## 2. Contract

For the canonical command, the caller accepts exactly one JSON value from
stdout:

- success is the existing `tianwen.install.v1` ready receipt; or
- failure is exactly `{ schemaVersion, status, stage }`, with
  `tianwen.install-failure.v1`, `failed`, and the existing closed stage enum.

The canonical failure probe must exit 1, have empty stderr, and expose no
path-like or credential-like sentinel. It uses Node 22's stable `--run`
package-script runner through `process.execPath` with a fixed argument array;
it runs the `package.json` script and must not call the installer source
directly. The command's root comes only from the existing fixed-D-drive/UUID
test helper and its sentinel is a fixed literal, never caller input. The test
uses no shell, pnpm launcher, `npm_execpath`, launcher parsing, or package
manager fallback. The deliberately invalid parser argument prevents
data-directory creation, package installation, managed deployment, Provider
activity, or product mutation. Its designated fixture root must be absent
before and after the process.

The controlled test may temporarily capture only its own deterministic child
stdout/stderr to parse the complete JSON value and assert that its own sentinel
is absent. It neither prints, persists, redirects, fragment-searches, nor
reuses those bytes. Production and operational paths never capture, scan,
retain, log, redirect, or extract a receipt from raw pnpm wrapper output.

The native Windows installer job is the bearing CI location because the
installer itself is a Windows product contract. The repository already requires
Node `>=22.19.0 <23` and CI runs Node 22.20.0, so its stable package-script
runner is a supported contract. A direct source invocation, shell/launcher
seam, or package-manager fallback is not a substitute.

## 3. Rejected alternatives

- Scanning for a final JSON fragment would consume wrapper text and make an
  ambiguous wrapper stream look trustworthy.
- Retaining, logging, redirecting, or searching raw wrapper output in a
  production or operational path would break the established safe-output
  boundary.
- A generic transport/parser/logger module is unnecessary: Node already has
  the stable package-script runner required here.
- `pnpm --silent run` is usable but remains a wrapper-level repair; it is not
  the primary machine transport. Directly invoking
  `node scripts/install-tianwen.mjs` would bypass the package entry users
  actually run.
- Changing installer success or failure schemas would repair the wrong layer
  and break an already-correct contract.

## 4. Scope and non-goals

Implementation may modify only the native Windows installer contract,
the current managed-installer operational handoff, and its permanent public
repository contract. It adds no package, lockfile, workflow, installer,
Runtime, DSH, Provider, ledger, logger, retry, telemetry, price, budget, or
transport framework change.

DSH `0.1.0-rc.7` remains the sole product Agent Runtime. This correction makes
no configured-Provider request, creates no Goal/manifest/Profile, and does not
enter Candidate, Evaluation, Shadow, Promotion, rollback, or any Alpha/Dynamic
path. The user's 60 CNY authorization remains an external cap only; it does
not require a price query, snapshot, reservation, or product request gate.

## 5. Operational stop line

Only after this correction reaches exact main and Python, TypeScript, and
`installer-windows` CI are green may a separately authorized operation run the
canonical silent command once against the existing product root. It must parse
one canonical ready or stage-only failed receipt without raw scanning. Any
other transport result stops at zero Provider; there is no retry, ordinary
fallback, manual deploy, or repair.

Only a canonical ready receipt plus the existing product-state and durable-data
equality checks may allow the already-authorized same Goal/manifest natural
resume once. That subsequent attempt remains one configured-Provider action,
does not create new inputs, and does not authorize Evaluation, Shadow, or
Promotion.
