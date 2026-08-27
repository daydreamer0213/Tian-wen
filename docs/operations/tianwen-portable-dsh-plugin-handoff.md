# Tianwen Portable DSH Plugin Handoff

Date: 2026-08-28

## Result

The portable-plugin implementation and controller-owned local acceptance are complete on the
isolated `codex/tianwen-portable-dsh-plugin` branch. The Task 5/6 real-process lanes were also
independently reviewed. The current work proves that one
`@tianwen/runtime-bundle@0.1.0` tarball can be installed into a user-selected exact
`@deepseek-ai/dsh@0.1.1-rc.2` Profile, used by stock headless and Web hosts, and also consumed by
the existing Tianwen-managed installer.

This is a **reviewed branch result**, not a release or a `main` integration result. The branch is
stacked on the DSH `0.1.1-rc.2` managed-migration handoff, whose frozen one-shot acceptance remains
incomplete. Therefore this branch must not be described as eligible for `main`, and no exact-main CI
claim exists for it.

The integrated code candidate covered by the final controller gates is
`99629870c91c01d631d95a7bd57780ac3acb827c`.

## Authority

- Approved design:
  `docs/superpowers/specs/2026-08-27-tianwen-portable-dsh-plugin-and-optional-desktop-design.md`.
- Implementation plan:
  `docs/superpowers/plans/2026-08-27-tianwen-portable-dsh-plugin.md`.
- Inherited migration handoff:
  `docs/operations/tianwen-dsh-0.1.1-rc.2-managed-product-migration-handoff.md`.
- Integration branch: `codex/tianwen-portable-dsh-plugin`.
- Stacked migration base: `dd3c848a83fe50cdcacbc50569ab16491779c4b0`.

Key integrated commits include:

- `4181ba6` and focused follow-ups: resolve and contain exact portable DSH Profile targets;
- `e1c5f22`: allow ordinary Tianwen Runtime use without a dynamic runner;
- `a365c38`: package the single publishable `0.1.0` Runtime Bundle;
- `a82d872` and focused follow-ups: target existing Profiles from the Tianwen goal CLI;
- `6c30c6c`: keep the managed installer on the same portable Runtime version;
- `f049c98`: accept stock Profile Runtime defaults when Cordis supplies no config object;
- `8d46bad`: verify native DSH add/remove lifecycle;
- `4845466`: verify stock headless and Web composition.

## Product result

### One Runtime Bundle, multiple hosts

- `@tianwen/runtime-bundle` is version `0.1.0`, is locally packable, and is no longer a private-only
  workspace package.
- The same Bundle is used by existing DSH Profiles, stock headless, stock `dsh web`, the
  Tianwen-managed installer, and any later desktop distribution. No desktop-specific Tianwen
  Runtime was created.
- The default portable Runtime derives Evolution state from the selected Profile:
  `<profileRoot>/state/evolution`. It no longer hard-codes a development or managed-product path.
- `dynamicCordisRunner` is required only when an artifact is actually activated. Ordinary Runtime,
  Evidence, Evolution, and learning-intake composition can mount without it.
- The Bundle does not depend on Electron, DSH Desktop, the test probe package, or a Tianwen-specific
  Web page.

### Existing DSH Profile targeting

Portable commands accept one complete explicit target:

```text
--dsh-root <installed @deepseek-ai/dsh package root>
--dsh-home <DSH_HOME>
--profile <profile name>
--state-root <Tianwen state root>
```

The resolver validates the exact package name/version and JavaScript bin, requires an initialized
selected Profile, and derives Profile, Session, state, and Evolution roots without creating them.
Portable `status` and `list` remain read-only. Portable `create` and ordinary `resume` launch the
validated DSH bin with the selected home/Profile. Managed-only model, controlled-lifecycle, trial,
and live-smoke paths are rejected in portable mode rather than silently retargeted.

The native install contract verified in this stage is:

```powershell
$env:DSH_HOME = 'D:\DevData\dsh-home'
dsh plugin --profile work --allow-build=koffi add --offline D:\DevData\packs\tianwen-runtime-bundle-0.1.0.tgz
```

`--offline` is appropriate only after the selected pnpm store contains the complete exact dependency
closure. `--allow-build=koffi` records the Profile-local pnpm approval; it does not change global
pnpm policy.

Removal uses the DSH-owned path:

```powershell
dsh plugin --profile work remove @tianwen/runtime-bundle
```

Removal drops package/Bundle wiring but deliberately preserves Tianwen state. Persistent state
cleanup remains a separate explicit user action.

### Optional managed installer

The repository-managed installer remains an optional convenience path. It installs exact DSH
`0.1.1-rc.2` and the same `@tianwen/runtime-bundle@0.1.0` artifact, while keeping the explicit
managed locations:

- DSH home: `<dataDir>/dsh-home`;
- Profile: `<dataDir>/dsh-home/profiles/tianwen`;
- Sessions: `<dataDir>/dsh-home/sessions`;
- Evolution: `<dataDir>/state/evolution`;
- Runtime archive: `<dataDir>/packs/tianwen-runtime-bundle-0.1.0.tgz`.

This path does not replace or become a prerequisite for the native existing-Profile flow.

### Deliberate deferrals

- No Tianwen-specific Web page or UI was added. Web users continue to use the DSH Web UI.
- DSH Desktop integration remains a later host/distribution task and must consume this same Bundle.
- `Tianwen` and `@tianwen/*` remain temporary internal names. No public rename or permanent alias
  layer was introduced.

## Real runtime evidence

### Native add/remove lifecycle

Task 5 completed 3/3 real native DSH lifecycle scenarios against disposable exact-rc.2 Profiles on
`D:\DevData`:

1. Adding the Runtime changed only the selected existing Profile. The untouched Profile and the
   selected Profile's pre-existing state remained byte-stable. Removing the Runtime removed its
   package/Bundle wiring and preserved the Tianwen state sentinel byte-for-byte.
2. Adding to a missing Profile produced exactly one DSH-owned initialization message and then
   installed exactly one Runtime Bundle. This is DSH behavior, not a Tianwen Profile creator.
3. An invalid tarball produced one failed DSH spawn and one failure report, with no Tianwen retry.
   Package/Bundle/state and the other Profile were not changed. pnpm retained only the user's
   explicit `koffi: true` approval, which is recorded as pnpm behavior rather than a successful
   Tianwen install.

The isolated D-drive store initially lacked the Windows optional closure for `koffi@3.1.6`. The
controller performed one dependency-only online seed in a disposable D-drive project. The actual
native lifecycle commands then ran offline. This was dependency preparation, not a Provider call or
a rerun used to select a better product answer.

### Stock headless and Web composition

Task 6 completed a final 2/2 opt-in real-process run in 363.18 seconds using one local Runtime
tarball, an independent stock exact-rc.2 DSH host, two fresh D-drive homes, and a separately installed
test-only probe:

- Headless mounted exactly one Tianwen Runtime entry and all four expected Tianwen services. Its
  Profile-relative state was created, `dynamicCordisRunner` was absent, and the process exited with
  code 0.
- `dsh web --host 127.0.0.1 --port 0 --no-open` returned a real loopback HTTP 200 response, mounted
  exactly one Tianwen Runtime entry, created Profile-relative state, and exited with code 0 after the
  probe stop signal.
- Stock Web supplied `dynamicCordisRunner`; stock headless did not. The successful headless run with
  the same Runtime artifact proves that Tianwen does not require that service before activation.
- The composition probe exists only in `@tianwen/dsh-probe-bundle`, is disabled by default, and owns
  only test receipt/exit behavior. No exit or readiness protocol was added to the product Runtime.

### Managed installer fresh run

The first fresh managed-installer attempt stopped before the product Profile was created because the
selected D-drive offline pnpm store did not contain the exact DSH tarball required by the installer.
This was an environment/dependency-preparation failure, not a passed product install, and it is not
hidden or rewritten as success.

The only corrective preparation was to populate the missing exact dependency closure in the D-drive
store. No global toolchain, C-drive cache, product code, or historical product directory was changed.
The official installer was then run against a different fresh D-drive product root with
`node scripts/install-tianwen.mjs --data-dir
D:\DevData\tianwen-portable-managed-final-20260828-002 --json`. It completed successfully and
published
`D:\DevData\tianwen-portable-managed-final-20260828-002\receipts\tianwen-install.json` with
`status=ready`, exact DSH `0.1.1-rc.2`, pnpm `11.20.0`, Runtime Bundle `0.1.0`, and archive digest
`sha256:7f0065f3692ce7b15bb55bd6d12905f71cc48e15f8ad04f7facc5a5ef2527126`.

## Verification status

The following Task-specific facts are already reviewed:

- Task 5 native lifecycle: 3/3 passed; independent review approved.
- Task 6 stock headless/Web composition: 2/2 passed; independent review approved.
- Task 6 default gate: 2 real tests skipped unless explicitly enabled.
- Task 6 repository typecheck and diff check: passed.

Controller-owned final integrated-branch gates at
`99629870c91c01d631d95a7bd57780ac3acb827c` were run serially with isolated caches, temporary
files, probe state, and Python environment on `D:\DevData`:

- exact DSH closure, private-import check, and TypeScript typecheck: passed;
- complete Node/Vitest suite: 56 files passed, 3 planned file skips; 742 tests passed, 14 planned
  skips;
- Python Ruff and compileall: passed;
- complete Python suite: 608 passed, 4 planned skips in 332.13 seconds;
- Windows concurrent cold boot: 8/8 passed, 428 links, 21.470 seconds;
- exact `installer-windows` Vitest file set: 4 files and 116 tests passed;
- final diff check: passed.

The paid Python live probe, two unsupported Windows symlink cases, and the separately covered
Windows ACL case account for the four Python skips. The high-cost native portable lifecycle and
headless/Web tests remain explicit opt-in lanes; their separately reviewed results above were not
silently rerun inside the default gate.

## Learning facts

- No ordinary Tianwen natural task was launched in this portable-plugin stage.
- No real DeepSeek or other live Provider request was made.
- No Goal/task result, natural runtime evidence, learning decision, Lesson, Skill candidate, or
  promotion outcome was produced by this stage.
- Scripted adapters, deterministic probes, native plugin E2E tests, and installer receipts are
  product/runtime evidence. They are not natural-task or learning-efficacy evidence.

An additional ordinary real-model smoke was deliberately **not run**: earlier natural tasks already
cover Tianwen's model-driven development loop, while this stage changed host packaging and Profile
composition. It is not a failed or pending portable-plugin acceptance item.

## External facts

- No npm package was published.
- No GitHub Release, signed installer, or desktop build was published.
- No Tianwen change or patch was pushed to the DSH upstream repository.
- No Desktop implementation was created; the reviewed DSH Desktop reuse direction remains a later
  distribution stage.
- No Provider billing fact exists. Tool/process counts are not presented as Provider usage.
- The branch has not been merged to `main`.
- No exact-main CI run or result exists for this candidate.

## Inherited blocker and integration decision

The underlying managed DSH `0.1.1-rc.2` migration remains classified as **incomplete** under its
frozen one-shot acceptance. Its real old-product upgrade and combined formal-startup/
installed-controlled acceptance did not finish green. Later fixes were independently verified, but
the frozen real results were not rerun and therefore were not replaced by passing claims.

The portable work above demonstrates that the new Bundle and existing-Profile product path are
technically viable. It does not close that inherited migration acceptance and does not authorize
`main` integration. This branch must remain a reviewed branch artifact unless the migration base is
separately accepted or closed under a new explicit decision.

Consequently:

1. do not run another ordinary Provider task merely to bypass the inherited blocker;
2. do not claim `main`, exact-main CI, npm publication, or Desktop readiness from this handoff;
3. carry this reviewed branch result forward only after the migration-base decision is explicit.
