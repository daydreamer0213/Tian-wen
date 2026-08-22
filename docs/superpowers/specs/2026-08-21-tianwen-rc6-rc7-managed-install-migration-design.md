# Tianwen managed rc.6 to rc.7 install migration design

## 1. Decision

The official installer must support one narrow product upgrade:

```text
managed Tianwen DSH 0.1.0-rc.6 installation -> exact 0.1.0-rc.7 installation
```

This closes a real product gap exposed by the Stage 7 configured-Provider
trial. Repository dependencies and the fresh-install path already require
DSH `0.1.0-rc.7`, but the existing product data root still contains the
installer-produced rc.6 host and Profile. The current installer validates an
existing host as rc.7 before it reaches its own offline deploy path, so it
cannot perform the upgrade it now requires.

This is an installer transaction, not a learning feature, Runtime migration,
Profile replacement strategy, or generic package migration framework.

## 2. Architectural boundary

- DSH `0.1.0-rc.7` remains the only product Agent Runtime.
- Tianwen does not add an Agent loop, Provider wrapper, Profile manager,
  migration database, version graph, repair daemon, queue, worker or scheduler.
- The existing fixed installer entry point and owned paths remain unchanged.
- Session bytes under `dsh-home/sessions` and Evolution bytes under
  `state/evolution` are never rewritten or removed.
- The old Artifact/Dynamic Cordis, Python Alpha and RepoTaskRuntime paths are
  unrelated and remain untouched.
- Provider/model execution is forbidden during installer migration.

## 3. Supported predecessor

The installer recognizes only a complete, installer-owned rc.6 predecessor.
All other existing layouts continue to fail before a child process or managed
path mutation.

The predecessor must have:

1. an `@tianwen/dsh-host` managed host whose installed
   `@deepseek-ai/dsh` manifest is exactly `0.1.0-rc.6`, exposes a contained
   `bin.dsh`, and resolves inside the managed host root;
2. a `tianwen` Profile with exact rc.6 `dsh-base` and `dsh-headless`, the
   fixed three-bundle order, the managed workspace policy, and the fixed
   Session/Evolution paths;
3. one of the two Profile encodings produced by this repository's installer:
   the original fixed archive form and patch, or the later locked-deploy form
   with normalized Runtime version and current managed patch.

The original form is included because it is the exact format present at
`D:\DevData\tianwen`; it is not a speculative compatibility mode.

The following remain hard failures:

- rc.5, rc.8 or any version other than exact rc.6/rc.7;
- a partial host or Profile;
- a changed managed workspace policy, bundle order, Session/Evolution root,
  Runtime archive target, or unknown Profile patch;
- mixed rc.6/rc.7 host and Profile state;
- a source-worktree Runtime resolution, except for the single proved exact
  rc.7 `current` shape whose installed Runtime Bundle files share native file
  identity with the invoking workspace. That shape is handled only by
  `2026-08-22-tianwen-installer-build-output-isolation-design.md`; every other
  source-worktree, partial, mixed or modified shape remains incompatible.

## 4. Minimal transaction

Fresh install and exact rc.7 replay keep their existing behavior. For the
recognized rc.6 pair, the installer performs this sequence:

1. validate the whole predecessor before any child process;
2. run the existing frozen, offline workspace install check;
3. rename the old host to a unique same-volume backup;
4. deploy the existing `@tianwen/dsh-host` package to the original final host
   path and validate exact rc.7;
5. use the existing deterministic double-build/double-pack Runtime archive
   proof;
6. use the existing Profile backup/deploy/normalize/validation path to install
   exact rc.7 base/headless plus the current Runtime Bundle; a recognized rc.6
   predecessor always forces this Profile replacement even if a stale receipt
   happens to name the same archive digest;
7. run the existing dump-config and installed-CLI validation;
8. publish the archive and canonical v1 ready receipt;
9. only after receipt commit, remove the old host/Profile/archive backups.

The host is deployed at its final path because pnpm's Windows deploy output can
contain path-bound links. The backup is the old managed directory itself; no
second Profile or durable product root is created.

For an already-existing data root, path containment and predecessor
classification happen before creating the receipt directory or any other
managed entry. A new/fresh data root may still be created by the existing
fresh-install path. This keeps an incompatible partial root byte-for-byte and
entry-for-entry unchanged.

If host deploy, Runtime build/pack, Profile deploy, dump validation, CLI
validation, archive publication or receipt publication fails, the installer
removes the incomplete rc.7 host and restores the exact rc.6 host. The existing
Profile/archive restoration path remains authoritative. A failure never falls
back to ordinary resume or Provider execution.

The receipt remains `tianwen.install.v1`. It describes the installed ready
state, not migration history, so no receipt migration schema is needed.

## 5. Identity, replay and recovery

- Successful migration produces the same rc.7 ready state as a fresh install.
- A second invocation is the existing exact rc.7 idempotent replay and does
  not redeploy host/Profile when the Runtime archive digest is unchanged and
  the installed Runtime Bundle is not source-linked. The proved source-linked
  rc.7 current shape forces one detached Profile replacement under
  `2026-08-22-tianwen-installer-build-output-isolation-design.md`.
- An exact retry after a pre-commit failure starts from the restored rc.6
  predecessor; there is no partial migration marker or repair state machine.
- Stale backup directories left only after a committed receipt are harmless
  cleanup residue and must not become product authority.

## 6. Evidence required before the real product root

The implementation must first prove, with filesystem fixtures and the existing
scripted child runner:

- the actual original rc.6 installer shape migrates to exact rc.7;
- the later locked rc.6 shape migrates to exact rc.7;
- unknown or modified predecessors still fail before child effects;
- a failure after rc.7 host deployment restores host, Profile, archive,
  receipt, Session and Evolution bytes;
- success preserves Session/Evolution bytes and leaves no migration backup;
- a detached, non-source-linked current replay performs no host/Profile
  deploy;
- the single proved source-linked rc.7 current fixture forces one detached
  Profile replacement, never a host deploy, even when its archive digest is
  unchanged;
- all package activity remains offline and uses the existing D-drive store.

Only after feature review, main integration and exact-main green CI may the
same installer run once against `D:\DevData\tianwen`. The real migration must
record before/after digests for Session and Evolution files without printing
their contents. Stage 7 Task 8 may then resume from the configured-Provider
preflight; it must not create a replacement Profile or retry a failed model
request.

## 7. Deliberate non-goals

- arbitrary version-to-version migration;
- online dependency recovery;
- automatic backup retention policy;
- cross-process locking or live-process orchestration;
- price snapshots, budget reservation or billing logic;
- a UI, wizard or new CLI grammar;
- changing any learning, Candidate, Evaluation, Shadow or Promotion semantics.

These are not required to migrate the one real managed predecessor. Add them
only when an observed product need exists.
