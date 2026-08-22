# Tianwen installer build-output inode isolation design

## 1. Decision

The official installer must stop a normal workspace build from mutating the
currently installed Tianwen Profile through pnpm-created hardlinks.

This is a proven transaction defect. During the first exact-main installation
attempt at `9fee61bd43a7c41ada774bdd4c3761b3d0308cd1`, all fourteen paths named by
`packages/tianwen-runtime-bundle/package.json#files` in the main worktree and
the installed Profile were two names for the same files. The installer then
ran its dependency build before `profileChanged` and the Profile backup were
established. The build changed the installed Runtime, status bundle and CLI in
place. When the later raw archive comparison stopped at `archive-stability`,
the catch block had no Profile backup to restore.

The version/layout classifier still reports the product as `current`, and the
old ready receipt still matches the old published archive, but the installed
Runtime payload no longer has that archive identity. That is a degraded,
source-linked current installation, not a completed ready transaction.

The narrow repair is:

1. sever the finite generated-output names used by the existing Runtime Bundle
   dependency build before that build starts;
2. keep the existing Profile deployment at its canonical final path, but make
   the uncommitted candidate Runtime Bundle package an independent byte copy
   before validation and receipt publication; and
3. force Profile replacement whenever the preflight observes that an installed
   Runtime Bundle published file shares file identity with its workspace source.

No second Runtime, generic filesystem transaction, package manager, repair
daemon or migration framework is needed.

## 2. Archive-stability diagnosis

The archive algorithm is not changed by this design.

The separately authorized non-product diagnosis used the clean retained
feature worktree whose tree exactly equalled main and first proved that none of
its fourteen Runtime Bundle source files shared file identity with the product
Profile. It then ran the installer sequence exactly once:

```text
build -> pack-1 -> build -> pack-2
```

Both archives were `117389` bytes and had the same raw digest:

```text
sha256:8333aa0b8de907a34ca73104b21ce9b86ce1db540287275d57696ce132a77b52
```

Their gzip headers, decompressed tar digest, sixteen entry paths, entry
type/mode/size/mtime metadata and every regular-entry payload digest were also
equal. The exact classification is `raw-equal`, with zero payload differences
and zero metadata differences.

Therefore there is no reproduced defect in the existing raw-tar stability
comparison. The earlier product attempt proved only that its two staged raw
archives differed; those staged files were cleaned, so their particular cause
remains unavailable. Replacing raw digest equality with a content digest would
be an evidence-free change and is rejected. The existing two-build/two-pack
order, raw SHA-256 equality requirement, failure stage and cleanup remain.

## 3. Exact product boundary

DSH `0.1.0-rc.7` remains the only product Agent Runtime. This change is owned
only by the existing Windows installer.

It does not change:

- the `tianwen.install.v1` ready receipt or the three-key
  `tianwen.install-failure.v1` failure receipt;
- the sixteen closed failure-stage tokens;
- the rc.6 predecessor classifier, host transaction, Session/Evolution roots,
  dump-config validation or installed CLI validation;
- Runtime, Agent, Goal, Provider, Skill, ledger or status behavior;
- the Node 22 `node --run install:tianwen -- ... --json` machine transport; or
- any price, budget, Candidate, Evaluation, Shadow or Promotion behavior.

The implementation adds no package, external dependency, lockfile, workflow,
store, logger, telemetry, retry or online recovery path.

## 4. Preflight identity and the existing drift

The ready receipt's `archiveDigest` remains authority only for the published
archive. It must not be described as a digest of the installed Profile.

Before any generated output is removed, the installer performs one bounded,
read-only identity check for the fourteen paths listed by the Runtime Bundle
manifest. For every path that exists in both the workspace package and the
installed package, the check compares native file identity. On Windows that
means the same volume/device plus inode/file identifier, not equal path,
length, timestamp or payload digest.

The result is a transient boolean, `sourceLinkedProfile`; it is not written to
the receipt or product state. It changes only the replacement decision:

```text
profileChanged = migratingRc6
  || !profileExists
  || installedArchiveDigest !== archiveDigest
  || sourceLinkedProfile
```

This handles the observed product honestly:

- a source-linked Profile is never allowed to take the unchanged-archive replay
  short circuit;
- a successful run replaces it with the detached candidate and publishes one
  mutually consistent Profile/archive/receipt state; and
- a failed run restores or preserves its exact pre-invocation bytes, including
  the already-drifted installed CLI.

The last fact is an operational stop line, not a new product state. After the
installer process exits, the existing layout classifier still says `current`
and the old receipt still says `ready`; this design adds no durable degraded
marker and no status/Provider consumer that could reject it. The supervisor's
record of the failed operation must therefore describe the source-linked
pre-state honestly and end that authorization chain before status or Provider
work. A later operation requires separate authorization after a successful
corrected install; the product itself does not claim to enforce this stop.

This is not a generic tamper detector. A modified, non-source-linked package is
outside the proved defect and is not assigned a speculative repair policy.
Existing partial/mixed/unknown-layout rejection remains unchanged.

## 5. Bounded build-output inode isolation

The existing build command selects a finite five-package closure:

1. `packages/tianwen-dsh-compat/dist`
2. `packages/tianwen-evolution/dist`
3. `packages/tianwen-evidence/dist`
4. `packages/tianwen-runtime/dist`
5. `packages/tianwen-runtime-bundle/dist`

Every directory is generated, ignored by Git and contains its own
`.tsbuildinfo`. Immediately before `runtime-bundle-build-1`, while still inside
that existing failure stage, the installer removes exactly these five `dist`
directories beneath the validated `repoRoot`. Removing a workspace hardlink
name does not change the installed Profile's remaining link or bytes. The
existing build then recreates complete outputs and new file identities.

This is deliberately a fixed list matching the current command, not recursive
workspace discovery, a VFS adapter or a reusable transaction API. A future
change to the dependency-build closure must update the list and its contract in
the same change. No source file, `node_modules`, package store or product file
is removed. If isolation or the first build fails, the existing
`runtime-bundle-build-1` safe stage is used; no new failure token is added.

Generated workspace outputs are not product rollback authority and need no
backup. Product host/Profile/archive/receipt and installed CLI bytes remain the
rollback contract. A later build may leave new or partial ignored `dist`
outputs, as builds already can; it may not alter the managed product.

## 6. Candidate Profile copy publication

The existing Windows rule remains: after archive stability passes, rename the
old Profile to its same-volume backup and deploy the candidate at the canonical
final Profile path. The candidate is not moved from another directory because
pnpm's Windows output can contain path-bound links.

Before `normalizeDeployedProfile()` and Profile validation, the installer
materializes only the Runtime Bundle package's exact published surface in that
uncommitted candidate:

- the fourteen paths from `package.json#files`;
- `package.json`; and
- `LICENSE`, which npm/pnpm includes in the sixteen-entry archive.

For each regular file, copy its bytes to a unique sibling and replace the
candidate path, producing an independent inode while leaving the canonical
path unchanged. Symlinks, package dependencies and unrelated Profile files are
not traversed or copied. The helper then requires every materialized file to
be a regular file with no file identity shared with the corresponding
workspace publication where one exists.

This is a bounded copy step inside `managed-profile-deploy`, not a general copy
framework. Any copy, replacement or identity-validation failure removes the
candidate and restores the existing Profile backup through the current catch
path. The ready receipt is published only after the detached candidate passes
the existing Profile, dump-config and installed-CLI validations.

## 7. Transaction and failure semantics

The corrected order is:

1. classify the managed layout and capture `sourceLinkedProfile` read-only;
2. run the existing pnpm/version/workspace-install preconditions;
3. perform the existing host migration when required;
4. remove the five generated workspace `dist` directories;
5. run the unchanged build/pack/build/pack/raw-stability sequence;
6. decide Profile replacement, including `sourceLinkedProfile`;
7. back up the current Profile, deploy at the final path, materialize the
   sixteen Runtime Bundle package files and validate;
8. run dump-config and installed-CLI validation;
9. publish archive, then ready receipt; and
10. only after commit, remove existing backups and staged archives.

For a normal consistent predecessor, every failure from output isolation
through receipt publication leaves host/Profile/archive/receipt and installed
CLI at the exact consistent pre-state. For the one observed degraded
source-linked predecessor, every failure preserves or restores its exact
observed pre-state. The transient source-link observation is available in the
current installer invocation and its supervised result only; existing
classifier and receipt semantics remain unchanged and may still render
`current`/`ready`. Session and Evolution remain outside mutation paths and
continue to require operational before/after byte snapshots.

Rollback itself is not instrumented and no cleanup/repair state is persisted.
The existing safe receipt reports only its closed stage. Raw child output,
paths, file identifiers, digests, source-link facts and exception messages are
not added to either receipt or ordinary output.

## 8. TDD evidence

The principal Windows contract must use real `node:fs` hardlinks, not two
equal byte arrays or a mocked identity function.

### 8.1 RED: build crosses the current transaction boundary

Use a fixture `repoRoot` and managed Profile under the approved D-drive test
root. Link at least the fixture source `dist/cli.js` and installed `dist/cli.js`
to the same inode. Make the existing scripted build write the source path and
make the two pack calls fail archive stability. The old installer must change
the installed CLI before Profile backup; assert zero Profile deploy and show
the product tree differs from its pre-snapshot.

### 8.2 GREEN: isolated build and full failure recovery

After the five bounded output directories are removed before build, repeat the
same real-hardlink fixture. Assert the installed CLI/file identity and the full
host/Profile/archive/receipt/Session/Evolution tree remain exactly at their
pre-state for:

- isolation/build-1, pack-1, build-2, pack-2 and archive-stability failures;
- partial Profile deploy and Profile validation failures; and
- dump-config, archive-publication and receipt-publication failures.

Existing rc.6 host rollback tests remain authoritative and must stay green.
Tests must not claim a degraded predecessor became ready on failure.

### 8.3 GREEN: successful detached publication and replay

Make the scripted Profile deploy create real hardlinks from the new fixture
workspace package into the candidate. A successful install must prove:

- every one of the sixteen Runtime Bundle package publication files has the
  expected bytes and an independent file identity after materialization;
- source writes after commit cannot change installed bytes;
- archive, ready receipt and installed CLI identify the new build;
- no Profile/build/archive backup or staging residue remains; and
- replay with an unchanged detached Profile performs no Profile deploy.

Also prove a source-linked current Profile forces replacement even when the
old and newly built raw archive digests are equal. The safe failure schema,
success receipt schema, archive raw-equality check and native-Windows CI job
remain byte-for-byte or structurally unchanged as appropriate.

### 8.4 Privacy and resource evidence

Tests inspect only fixture paths, file identities and digests. Public handoff
text may state the hardlink defect and recovery boundary but must not publish
local user paths, file identifiers, child output or product content. Fixture
roots end at zero files/zero bytes. No test invokes Provider, Goal, model,
Docker, Alpha or the real product installer.

## 9. Alternatives

### 9.1 Chosen: unlink generated outputs, then materialize the candidate package

This uses only Node filesystem primitives and existing transaction points. It
protects the current Profile before build, keeps the Windows final-path deploy
contract and leaves the installed Runtime Bundle detached after success.

### 9.2 Rejected: rename the current Profile earlier

A hardlink follows the inode, not its pathname. Renaming the Profile merely
moves the installed link into the backup; the workspace build would still
mutate the supposed rollback copy.

### 9.3 Rejected: trust package-import configuration alone

The observed deploy used injected workspace packages whose local file mapping
is hardlink-based. A configuration string is not sufficient evidence of copy
semantics. The candidate must prove independent file identity after it is
deployed.

### 9.4 Deferred: isolated workspace clone or generic filesystem transaction

A second worktree/clone, copied dependency tree, VFS adapter or generic
transaction framework is much larger than deleting five generated output
directories and materializing one package. Add none of them unless a future
proved package shape cannot use this boundary.

### 9.5 Rejected: receipt/classifier-only repair or automatic retry

Changing labels would leave the installed CLI altered. Retrying could further
mutate shared files and would hide the first failure. Neither repairs the
transaction boundary.

## 10. Planned file and release boundary

Implementation should remain within:

- `scripts/install-tianwen.mjs`;
- `tests/dsh-migration/tianwen-installer.spec.ts`;
- `docs/superpowers/specs/2026-08-21-tianwen-rc6-rc7-managed-install-migration-design.md`
  for the minimal canonical supersession recorded below;
- `docs/operations/tianwen-rc6-rc7-managed-install-migration-handoff.md`; and
- `tests/contracts/test_public_repository_surface.py` only for permanent,
  cautious hardlink/recovery wording.

No workflow change is required because the existing native
`installer-windows` job already runs the installer contract. No package,
lockfile or product Runtime file changes are permitted.

Implementation requires TDD, native-Windows CI, correctness/rollback review,
architecture/privacy/DSH review and Ponytail/YAGNI review. Only an approved
exact feature SHA may be merged with one no-fast-forward main integration.
Only exact-main Python, TypeScript and `installer-windows` success may authorize
one separately approved official offline installation.

That operation must snapshot host/Profile/archive/receipt, installed Runtime
Bundle files, Session and Evolution before and after. A failed receipt stops
without status or Provider work. A successful ready receipt must additionally
prove that the installed Runtime Bundle publication no longer shares file
identity with the exact-main workspace before the separately authorized one
read-only status check. No Goal is run again.

## 11. Minimal canonical supersession

This design narrowly supersedes two statements in the earlier managed
rc.6-to-rc.7 design:

- the single proved exact-rc.7 `current` shape whose installed Runtime Bundle
  files are hardlinked to the invoking workspace is permitted to enter this
  bounded remediation and must force Profile replacement; and
- an exact-rc.7 replay skips Profile deployment only when its installed
  Runtime Bundle is not source-linked and the existing archive digest remains
  unchanged.

All rc.6 predecessor limits and all other source-worktree, partial, mixed,
unknown or modified layout rejection remain in force. This is not general
source-worktree Runtime support.
