# Tianwen existing-DSH Desktop distribution design

Date: 2026-08-28

Status: approved for implementation

## 1. Goal

Turn the proven Windows Electron host into an installable Desktop entry for people who already use compatible DSH. A user installs Tianwen Desktop, selects or discovers the DSH they already have, and later opens Tianwen from a normal shortcut without a Tianwen source checkout or three command-line paths.

The Desktop remains optional. Existing DSH CLI users continue using their original DSH commands and Profiles, and the Tianwen managed installer remains a separate convenience path for users who want a fully isolated product.

## 2. Product boundary

The Desktop package contains only:

- the Electron shell and its compiled Tianwen Desktop code;
- product metadata and required license/notices files;
- in the second slice, the exact `@tianwen/runtime-bundle@0.1.0` tarball.

It does not contain or install another `@deepseek-ai/dsh`, pnpm runtime, DSH lockfile/patch closure, market, terminal service, updater or background daemon. The selected user's exact DSH `0.1.1-rc.2` remains the only Agent Runtime. The bundled Tianwen tarball, when used, is installed by that DSH into its standard `web` Profile.

The existing `@tianwen/desktop-host` lifecycle remains the authority for target validation, loopback Web readiness, secure navigation, single-instance behavior and owned child-process shutdown. This stage adds a user bootstrap and distribution boundary around it; it does not rewrite the host or Tianwen Runtime.

## 3. Alternatives

### 3.1 Chosen: standalone thin Desktop for an existing DSH

Package the current Electron shell, discover or let the user select an existing Node/DSH/DSH home, persist only those paths, and launch the existing DSH Web Profile. This serves DSH CLI users without creating a second Runtime and has the smallest new failure surface.

### 3.2 Retained only for development: repository command

`pnpm desktop -- --node ... --dsh-root ... --dsh-home ...` remains a diagnostic entry. It is not a product because it requires the source checkout, workspace dependencies and manual paths.

### 3.3 Rejected for this stage: Tianwen all-in-one Desktop

Embedding the managed installer or a full DSH closure would duplicate DSH, enlarge the installer, introduce another migration/update surface and make existing DSH users adopt Tianwen's deployment. The managed installer already covers the isolated-product use case and stays separate.

## 4. Delivery slices

### 4.1 Slice B1: installable shell for a prepared Web Profile

B1 produces an unsigned Windows x64 internal preview with both an unpacked application directory and an NSIS installer. It supports an existing `web` Profile that already contains exact Tianwen Runtime `0.1.0`.

On first launch, the bootstrap resolves the target in this order:

1. a complete diagnostic command line (`--node`, `--dsh-root`, `--dsh-home`);
2. a previously saved Desktop target;
3. a Node `22.x` executable found through `where.exe node`, DSH package roots returned by the user's available `npm root -g` or `pnpm root -g`, and `DSH_HOME` or an existing `%USERPROFILE%\.dsh`;
4. Electron native file/directory dialogs for any unresolved path.

Every candidate passes the exact Node/DSH/home portion of the existing target validator before it can be saved. The existing full target validator then remains the final authority before launch. Failed automatic candidates are skipped; a failed user-selected candidate receives a concrete error and returns to selection. The bootstrap does not silently switch to another DSH after a saved target becomes invalid.

The saved file is `desktop-target.json` under Electron `userData`. It contains only the three canonical absolute paths and a schema version; it contains no credential, model setting, Session content or Profile data. This small settings file may live under the Windows user profile. DSH homes, Profiles, dependencies, stores and other large data remain in the user's selected location.

B1 uses native dialogs and message boxes. It adds no preload, IPC bridge or custom renderer.

### 4.2 Slice B2: safe preparation of the selected Web Profile

B2 adds the exact Runtime tarball as an allowlisted application resource. It never downloads a different Runtime and never installs DSH.

After target discovery:

- if `profiles/web` already contains exact Runtime `0.1.0`, preparation is a no-op;
- if the exact `web` Profile exists without Tianwen, automatic preparation stays disabled and the app displays the exact selected-DSH command for the user to run;
- if `profiles/web` does not exist, the app asks for one explicit confirmation, then the selected DSH's native `plugin --profile web --allow-build=koffi add <bundled-tarball>` command creates the standard `web` template and adds the tarball;
- if the Profile contains another Tianwen Runtime version or an incompatible declaration, the app stops with an upgrade/incompatibility message. It does not guess a migration.

A disposable-Profile test against exact DSH `0.1.1-rc.2` proved that an induced package/store failure preserves the manifest and patch but rewrites `pnpm-workspace.yaml` with the requested native-build policy. Therefore the required all-bytes-unchanged boundary is not available for an existing Profile, and automatic preparation of existing Profiles is disabled. B1 remains usable and the error presents the exact native DSH command for the user to run. This stage does not build a generic Profile backup, transaction or repair framework.

For a Profile created by the B2 attempt, a failure is reported as an incomplete DSH Profile with its exact path. The Desktop does not recursively delete it automatically because native dependencies and Windows long paths make blind cleanup unsafe.

Successful preparation is immediately revalidated by the existing Desktop target validator before DSH Web starts.

## 5. Packaging contract

Use exact `electron-builder@26.15.3` with a package-local configuration:

- app id: `io.github.daydreamer0213.tianwen.desktop`;
- product name: `Tianwen Desktop` for this internal preview;
- version: the Desktop package's pinned preview version;
- Windows target: x64 NSIS plus the unpacked directory used by tests;
- application files: an explicit allowlist containing only the Desktop package manifest, compiled Desktop JavaScript and required assets;
- B2 resource: one exact Runtime tarball under `resources/runtime/`;
- output and Electron download cache: D-drive paths during local development and CI runner temporary storage in GitHub Actions.

The package audit rejects included `@deepseek-ai/*` packages, pnpm executable/store data, DSH patches/lockfiles, repository sources, test fixtures and unrelated workspace packages. The embedded Runtime tarball is separately checked against the same archive digest produced by the Runtime Bundle build.

The first installer is an unsigned internal preview. Code signing, public release and automatic update remain later external-distribution decisions.
It uses Electron's default application icon; a Tianwen/LearnLoop icon is part of the later public-branding decision, not this engineering preview.

## 6. User and data flow

```text
Desktop shortcut
  -> load saved target or discover/select paths
  -> validate Node 22 + exact DSH + DSH home
  -> B1: require exact prepared web Profile
     B2: optionally prepare it through that same DSH
  -> validate exact Tianwen Runtime in the Profile
  -> launch external Node + external DSH web on loopback
  -> load the ready URL in the existing secure Electron window
  -> close window
  -> stop only the DSH process tree owned by this Desktop instance
```

Uninstalling Tianwen Desktop removes the shell and its small target settings only when the installer/user explicitly elects to remove application data. It never removes the selected DSH, DSH home, Profile, Session, Goal, Evidence, Evolution state or package store.

## 7. Failure behavior

- Missing Node/DSH/home: return to native selection with the rejected path and reason.
- Unsupported Node, DSH or Runtime version: stop before starting or modifying a Profile.
- Invalid saved target: do not fall through to an unrelated automatically discovered target; require confirmation of a replacement.
- Profile preparation failure: show the exact DSH stage, exit code and Profile path; do not retry automatically.
- DSH Web early exit, timeout or invalid URL: retain the existing host error and owned-process cleanup.
- Window close or app quit: retain the existing idempotent shutdown and Windows process-tree fallback.

No Provider call, live Tianwen task, telemetry request or update check is part of bootstrap, preparation, packaging or validation.

## 8. Verification

### 8.1 Deterministic tests

- discovery order, saved-target schema and invalid-target replacement;
- Node/DSH/home candidate validation and native-dialog cancellation;
- exact B2 command, confirmation requirement for a missing Profile, no-op and incompatible-version stops;
- induced existing-Profile preparation failure with before/after byte comparison that records the DSH workspace-policy mutation and keeps that path disabled;
- package file allowlist, Runtime archive digest and forbidden-closure scan;
- installer/uninstaller boundaries and settings behavior.

### 8.2 Real Windows product tests

- build the unpacked application and unsigned NSIS installer;
- run the unpacked app against a fresh existing-DSH Web Profile without a source checkout;
- prove ready URL, real DSH Web response, window load, clean exit, no residual owned PID and closed HTTP endpoint;
- in B2, prepare a fresh standard Web Profile with the bundled tarball, then launch the same packaged app;
- prove the selected DSH/Profile is the same physical Runtime used by CLI, Web and Desktop;
- prove an unrelated Profile and its state are unchanged;
- inspect the actual artifact rather than trusting build configuration.

The real product test executes without Provider credentials and is runtime/distribution evidence, not a natural task or learning-efficacy test.

### 8.3 Repository and CI gates

Desktop unit tests become an explicit TypeScript CI step. A Windows Desktop distribution job builds and audits the unpacked/NSIS artifacts; the real packaged lifecycle test runs only where its prepared exact DSH fixture is available. Existing Python, TypeScript and managed-installer jobs remain unchanged.

## 9. Explicit deferrals

- public branding or the `LearnLoop` rename;
- public npm/GitHub Release publication, code signing and reputation setup;
- automatic updater, installation id, outbound telemetry or crash upload;
- custom Tianwen Web pages, preload/IPC, Profile manager, terminal, tray and notifications;
- macOS/Linux packages;
- multiple DSH versions, multiple Runtime versions or automatic Runtime migration;
- embedding Node 22, DSH, pnpm or a second package store;
- modifying or deleting unrelated Profiles or historical product/evidence data.

## 10. Completion criteria

The stage is complete when:

1. an ordinary Windows user with compatible existing DSH can install the unsigned preview and launch it from a shortcut without a Tianwen source checkout;
2. after one discovery/selection, later launches require no path arguments;
3. a prepared exact Web Profile works through the packaged app and shuts down cleanly;
4. B2 either safely prepares the exact Profile through the user's DSH and passes the induced-failure boundary, or remains explicitly disabled without blocking B1;
5. the artifact audit proves no second DSH or package-manager closure is shipped;
6. CLI and managed-install paths continue using the same Runtime Bundle and remain green;
7. full local gates and exact-main CI pass before any public release decision.
