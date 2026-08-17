# Tianwen repeatable installer handoff

## Result

The first repeatable Tianwen-on-DSH installer is complete on
`codex/tianwen-installer`.

Run it from a Tianwen source checkout with the reviewed lockfile and offline
package store:

```powershell
node scripts/install-tianwen.mjs --data-dir D:\DevData\tianwen --json
```

The command installs exact `@deepseek-ai/dsh@0.1.0-rc.6`, the Tianwen Runtime
Bundle and the fixed `tianwen` Profile. It returns the installed `tianwen`
command directory in `binDir`; it does not edit the user's global `PATH`.

## Authority and owned paths

The caller chooses only one absolute safe data directory below
`D:\DevData`. Package names, versions, Profile name, archive name, subprocess
programs and argv are fixed.

The installer owns:

- `<data-dir>\dsh-host`;
- `<data-dir>\dsh-home\profiles\tianwen`;
- `<data-dir>\packs\tianwen-runtime-bundle-0.0.0.tgz`;
- `<data-dir>\receipts\tianwen-install.json`.

It does not rewrite or delete Session data under
`<data-dir>\dsh-home\sessions` or Evolution data under
`<data-dir>\state\evolution`.

Every Tianwen-owned child process uses `process.execPath`, fixed argv and
`shell:false`. Corepack networking and package-manager networking are disabled;
the installer reuses D-drive cache/store paths and requires pnpm `11.20.0`.

## Profile installation decision

The official path does not use `dsh plugin add`. A real fresh-profile probe
showed that rc.6 plugin installation re-resolves transitive semver ranges from
registry metadata and can select a tarball absent from an otherwise complete
offline store.

The repository instead contains the minimal private
`@tianwen/profile-host` workspace. `pnpm deploy` consumes the repository's
frozen lockfile, including required Windows native optional packages, with zero
downloads. The installer then removes deploy's generated lockfile and rewrites
the three installed dependency versions to stable values, so no source checkout
path remains Profile authority.

On Windows, pnpm junctions bind to their final directory. The installer
therefore retains the old Profile under a same-volume backup, deploys the new
Profile directly at its final path, validates manifest, bundle paths,
`--dump-config` and CLI while the new Runtime archive remains staged. It then
publishes the archive and receipt, and removes both backups. Any failure before
receipt commit removes the candidates and restores the previous archive and
Profile; a first-install failure leaves no archive, Profile or success receipt.

## Git checkpoints

- base: `992f71900f43a7b15c7381740c7cf03717619348`;
- plan: `2b4099d` (`docs: plan repeatable tianwen installer`);
- initial installer: `a14a2d8` (`feat: add repeatable tianwen installer`);
- lock-governed Profile and final product code: `08ef895`
  (`fix: deploy locked tianwen profile`).

## Final evidence

The following phase execution record was captured from serial final gates in
the installer worktree, with generated data,
caches, virtual stores, temp files and Python environment on `D:`.

- offline frozen pnpm install: 576 packages reused, 0 downloaded, exit 0;
- Runtime Bundle dependency build: exit 0;
- package typecheck: exit 0;
- DSH closure/private-import checks: 187 exact rc.6 packages, 15 public
  surfaces, 0 private-import violations;
- focused installer contract: 17 passed;
- default Node suite: 17 files passed, 2 skipped; 132 passed, 7 skipped;
- fresh installer/Profile/headless/list/status/resume E2E: 1 passed in
  510.28 seconds;
- post-fix exact replay/headless/list/status/resume E2E: 1 passed in
  18.48 seconds;
- Windows local sandbox gate: 3 passed; report SHA-256
  `ddcc714a9b30896f380cba20a29530cc633cfa874ec4dea890c4a7c3ef498ef1`;
- A1-A5 author proof: 10 passed;
- foreground Python suite: 424 passed, 4 planned skips in 171.46 seconds;
- Ruff: all checks passed;
- base-to-product-HEAD diff check: clean.

The fresh E2E install receipt file SHA-256 was
`823261ddcad69e60ca943dce5a7124fa8cb1d724612ae4b829ea1e39e139b735`;
its Runtime archive digest was
`sha256:3bb60d8ce8b36c71ee9a557a3efcd3a152c50ad658627aab1fd201dcc249f112`.
The E2E proved installed DSH and all three Profile bundles resolve inside the
managed data directory rather than the source worktree, and installer replay
preserves the exact receipt, Profile bytes and durable state.

No paid model/API key, live web/search, dependency download, real Docker or UI
was used.

## Review

Independent scoped review initially found one Important: the old Profile was
removed before post-deploy dump/receipt validation completed. The backup
lifetime and failure tests were corrected. Narrow re-review reported 0
Critical, 0 Important and Ready.

One non-blocking coverage Minor remains: Profile manifest tampering is enforced
by production validation but does not have a dedicated mutation test. Per the
project's ponytail/YAGNI rule, no generic installer transaction, repair daemon,
package-manager abstraction or migration framework was added.

## Remaining product boundary

This phase provides a repeatable headless installation and the existing
list/status/explicit-resume CLI. It does not add a desktop UI, daemon, automatic
resume, paid provider configuration, real Docker execution, database or Runtime
cutover. DSH remains pinned to Developer Preview `0.1.0-rc.6`; a future DSH
upgrade must be treated as a separately reviewed change.
