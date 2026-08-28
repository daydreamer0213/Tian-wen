# Tianwen DSH rc.2 integration-unlock handoff

Date: 2026-08-28
Status: historical result closed as incomplete; its original decision was do not merge this branch to `main`

## Subsequent authority

The historical Candidate 3 result below remains `5/6`, exit `1`. A later current-candidate acceptance corrected only the diagnosed controller path depth and passed `6/6`, exit `0`, once. Therefore this file remains the authority for the old execution, while its permanent integration no-go is superseded for the current branch by `docs/operations/tianwen-current-integration-acceptance-handoff.md`.

## Decision

Prior independently reviewed evidence covers the Tianwen portable Bundle, native existing-Profile
lifecycle, and Web path with exact DSH `0.1.1-rc.2`; this unlock additionally proves the managed
installer and formal fresh headless startup. The frozen integration unlock nevertheless did not
finish with a clean command-level pass, so this branch is not integrated.

No fourth acceptance candidate is authorized. The final controlled-fixture failure is now diagnosed
as a controller path-layout error rather than a Tianwen product deployment defect: Windows long-path
support was disabled and the frozen fixture root placed pnpm's patched dependency directory beyond
the supported path length. This diagnosis preserves, but does not rewrite, the frozen `5/6` and exit
`1` result.

## Exact branch and attempts

- Candidate 1 plan: `2e53c9d`.
- Upgrade verifier correction: `76828fa50b64db3c95be380dd0c2903938bdbc62`.
- Candidate 2 plan and exact upgrade candidate: `b54b5fc04a26c879dada398ef3c910ac0d9806d2`.
- Candidate 2 execution decision: `3b5d1faa83b1592b6f338b9a839a73820818db67`.
- Startup verifier correction: `c3f17771110a75d1edf3294cdbf95fb5dab19ee7`.
- Candidate 3 plan and exact startup candidate: `5e7435265fa633beea379e6ac04674f81f2b1371`.

The candidate commits remain on `codex/tianwen-portable-dsh-plugin`. `main`, `origin/main`, external
DSH repositories, npm, GitHub Releases, and CI were not changed by this unlock.

## Task result

### Candidate 1

The first real upgrade command stopped before running the current installer. The verifier incorrectly
expected the current Runtime archive version from the valid rc.7 predecessor receipt. This was a
verifier defect, not a product failure.

- Log: `D:\DevData\tianwen-rc2-integration-unlock-20260828\logs\upgrade-candidate-2e53c9d.log`
- SHA-256: `2EC14F779636A8FF4B44D0C18AEBCFB59C32FB2093BC3E12F89CA4D0EE632E83`
- Surviving product: unchanged rc.7 predecessor

The deterministic verifier regression was added before the minimal fix and independently reviewed.

### Candidate 2 upgrade

The first complete Vitest run passed `21/21` in `966.98s`. It proved the real rc.7-to-rc.2 product
upgrade, boot-free dump, real offline Profile boot, synthetic-state preservation, current-installer
replay, byte stability, and residue checks. The resulting receipt is `ready` for DSH `0.1.1-rc.2`,
Runtime `0.1.0`.

The captured command then received an unexplained second Vitest launch. Its fresh-root guard rejected
the already-used product root in `46ms`; it did not invoke either installer or change the accepted
product. The enclosing command therefore exited `1` and is not called a clean command pass.

- Log: `D:\DevData\tianwen-rc2-integration-unlock-20260828-candidate-2\logs\upgrade.log`
- SHA-256: `4B1EDD919748B40F1FB5F10C29A6DC0DD73E782B78336EE143D03053F927CB18`

Per the frozen decision, the real upgrade was not rerun.

### Candidate 2 startup

The startup command ended `3/5`, exit `1`:

- the controlled fresh installer stopped at `managed-host-deploy` without retaining pnpm's internal
  error;
- the formal installer and replay succeeded, then a stale test assertion expected Runtime `0.0.0`
  although the correct current archive and manifest are `0.1.0`.

- Log: `D:\DevData\tianwen-rc2-integration-unlock-20260828-candidate-2\logs\startup.log`
- SHA-256: `099A70E36D82F9118A87E7240D6D5475C191A71CFA937E480B160786928C4ABF`

The Runtime assertion was corrected with a deterministic red/green regression and independently
reviewed. Installer and Runtime product bytes did not change.

### Candidate 3 startup

The one authorized startup-only execution ended `5/6`, exit `1`, in `373.78s`. The formal path
passed in full. The only failure was the controlled fresh installer at the same
`managed-host-deploy` stage.

- Log: `D:\DevData\tianwen-rc2-integration-unlock-20260828-candidate-3\logs\startup.log`
- SHA-256: `1945659884042A5D78F723702352054C75A5ED2A0359B8A8A01C46165454450F`

The frozen decision rule required one clean `6/6` and exit `0`. Therefore Candidate 3 failed and the
branch remains non-integrable even though the product-bearing formal test passed.

## Controlled-fixture root cause

A later controller-only diagnostic invoked the exact pnpm host-deploy subcommand once against the
failed Candidate 3 data directory. It made no Provider call and is not an acceptance rerun. The
command resolved all `452` packages from the offline D-drive store, then failed with:

```text
ENAMETOOLONG: name too long, chdir ...\dsh-host\node_modules\.pnpm\...
```

The failing product root was `143` characters before the deployed dependency suffix. The same
dependency path under the successful formal product root was `209` characters in total, while the
controlled path crossed the legacy Windows path boundary. The machine registry reported
`LongPathsEnabled=0`.

- Diagnostic log:
  `D:\DevData\tianwen-rc2-integration-unlock-20260828-candidate-3\logs\managed-host-deploy-diagnostic.log`
- SHA-256: `DBD8D754C8A82A3F0F2E519856159BFBD210163E7615288F57333C8C7B74C0FB`

This proves the repeated stage failure came from the frozen controller fixture's excessive path
depth, not from a timeout or a random failure. It does not convert Candidate 3 into a pass. Any future
independent test should keep `TIANWEN_DSH_PROBE_ROOT` short under `D:\DevData`; it should not change
the machine-wide long-path setting merely to satisfy this test.

## Product/runtime evidence

Candidate 3's formal installed-product path completed:

- fresh official managed installation and receipt validation;
- exact DSH `0.1.1-rc.2` and Runtime `0.1.0`;
- replay without product drift;
- real headless command with `TIANWEN_PHASE2_OK` and exit `0`;
- one Session with four model steps using the offline deterministic adapter;
- Goal create, smoke action, `update_goal`, complete/disarmed state, evidence projection, list/status,
  and read-only checks;
- dump/config and model-preflight boundaries;
- no real Provider credential and no real external-network, paid-Provider, live-Web, or Docker
  request. The test passed only a random credential sentinel to paths intercepted by local
  `fake-fetch`.

The authoritative runtime receipt is:

`D:\DevData\tianwen-rc2-integration-unlock-20260828-candidate-3\fresh-product\receipts\phase2-startup-receipt.json`

These are product/runtime facts. They do not override the frozen command result.

## Learning facts

- No ordinary Tianwen natural task was launched in this stage.
- No real DeepSeek or other live Provider request was made.
- No new Goal/task result from a natural task, learning decision, Lesson, Skill candidate, or Skill
  promotion was produced.
- Controller tests and deterministic adapters are runtime evidence, not learning-efficacy evidence.
- Earlier natural tasks already cover the model-driven problem-discovery and code-change loop; adding
  another natural task would not address this controller path-layout failure.

## Desktop research facts

The separate read-only reassessment is recorded in
`docs/research/2026-08-28-tianwen-dsh-desktop-reassessment.md`.

- Directly reusing or forking `anywhere-labs/dsh-desktop` as Tianwen's product is No-Go because it
  bundles another complete DSH closure, pnpm, native modules, rc.2 patches, updater, and brand.
- Reusing its architecture ideas is conditionally useful: Tianwen should own a minimal Electron shell
  that launches the already-installed Tianwen Runtime/Profile, waits for a loopback Web URL, and owns
  only the child/window lifecycle.
- The approved architecture design was corrected accordingly. The core portable Bundle remains
  independent of both Electron and any particular Desktop application.

No Desktop code, installer, release, signature, updater, telemetry, or public rename was created.

## External facts and next boundary

- No external DSH upstream push was attempted.
- No package or desktop artifact was published.
- No branch was merged to `main`; no exact-main CI belongs to this candidate.
- The rc.2 unlock stage is now closed honestly as incomplete. It should not consume more natural tasks
  or acceptance retries.
- The next product stage, when resumed, is the minimal Tianwen-owned Desktop host proof described by
  the corrected architecture design. It must reuse the existing Runtime rather than introduce a
  second DSH installation.
