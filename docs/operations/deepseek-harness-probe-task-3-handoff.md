# DeepSeek Harness probe Task 3 handoff

**Date:** 2026-08-14

**Status:** complete for Task 3 only

**Branch target:** `codex/deepseek-harness-probe`

**Starting local and remote SHA:**
`435ccad9e84809b417ca435f89450d7e6df98d8b`

This result proves an installable Tianwen Bundle and an isolated, disposable
DeepSeek Harness Profile. It does not approve full migration, production
runtime selection, Task 4, or Alpha Task 10.

The controlling handoff carries the exact final commit and remote SHA because
this document cannot identify the commit that contains itself.

## Authority and decision history

The session read the authoritative documents from shared Git objects without
merging or rebasing `main`.

Initial authority:

```text
35c4aa0a1172dc182fa74cdd7a251f1ade2330fc
```

The first independent review found that the public
`@deepseek-ai/dsh@0.1.0-rc.6` Windows plugin CLI internally uses
`shell: true` for its package-manager spawn. Task 3 was correctly handed off
as blocked because that contradicted the original all-processes
`shell: false` rule.

The user then approved strict Option A. The updated architecture and plan were
read from:

```text
447506354bf328a0a87901e9c63b0d2d747653e6
```

That decision permits only the exact rc.6 public plugin CLI's internal
Windows `shell: true` for this one-time, fixed, offline Profile installation.
Every Tianwen-owned outer process remains `shell: false`. The exception does
not apply to Agent runtime, dynamic plugins, learning assets, user-supplied
package specifications, or later tasks.

## Implemented scope

Task 3 adds only:

- `packages/tianwen-dsh-probe-bundle/package.json`
- `packages/tianwen-dsh-probe-bundle/tsconfig.json`
- `packages/tianwen-dsh-probe-bundle/cordis.patch.yml`
- `packages/tianwen-dsh-probe-bundle/src/index.ts`
- `packages/tianwen-dsh-probe-bundle/src/adapter.ts`
- `scripts/verify-dsh-profile.mjs`
- `tests/dsh-probe/profile.spec.ts`
- one mechanical `pnpm-lock.yaml` workspace importer that reuses existing
  exact snapshots
- this handoff

Tasks 0–2, the Python Alpha runtime, dependency versions, Goal, Champion,
Session, Sandbox, Tools, UI, `main`, Task 4, and Alpha Task 10 were not
modified.

The Bundle declares `dsh.bundle`, exposes only package-root public exports,
and packs its patch, compiled JavaScript, and declarations. Its patch contains
exactly two operations:

1. set only `agent-default-model` to provider `tianwen-probe` and model
   `scripted`;
2. insert `tianwen-probe-adapter` from
   `@tianwen/dsh-probe-bundle/adapter`.

No other base row is replaced.

## TDD evidence

The initial RED was obtained before implementation files existed:

```text
tests/dsh-probe/profile.spec.ts
4 failed

ENOENT:
packages/tianwen-dsh-probe-bundle/package.json
packages/tianwen-dsh-probe-bundle/cordis.patch.yml

MODULE_NOT_FOUND:
scripts/verify-dsh-profile.mjs
```

The first minimal GREEN was:

```text
tests/dsh-probe/profile.spec.ts
4 passed
```

Review-fix round 1 added executable tests for the approved exception,
bounded patch/dump parsing, and real public-export imports. The second RED was:

```text
tests/dsh-probe/profile.spec.ts
4 failed, 4 passed

validateFixedInstallBoundary is undefined
parseAuthoredPatch is undefined
parseDumpedDefaultModel is undefined
resolveAndImportBundleExports is undefined
```

The final focused GREEN was:

```text
tests/dsh-probe/profile.spec.ts
8 passed
```

## Pack, Profile, and report evidence

The verifier rebuilt and packed the Bundle during the successful run:

```text
D:\DevData\tianwen-dsh-probe\packs\
  tianwen-dsh-probe-bundle-0.0.0.tgz
```

Tarball SHA-256:

```text
29018a0f57b4b8dc529162f35f0c5d79a092ab2f92b36588505a0c99b7936012
```

The archive contains the package manifest, `cordis.patch.yml`, both public
JavaScript exports, and both declaration files. The offline public plugin CLI
installed it into:

```text
D:\DevData\tianwen-dsh-probe\home\profiles\tianwen-probe
```

The generated Profile has this exact Bundle order:

```json
[
  "@deepseek-ai/dsh-base",
  "@tianwen/dsh-probe-bundle"
]
```

The base resolves through the public `@deepseek-ai/dsh` dependency closure to
exactly `0.1.0-rc.6`.

The four Tianwen-owned outer commands all exited 0:

1. Bundle build;
2. `pnpm pack`;
3. offline `dsh plugin --profile tianwen-probe add`;
4. `dsh --profile tianwen-probe --dump-config`.

No interactive app was started and no model request was sent.

Machine-readable evidence:

```text
D:\DevData\tianwen-dsh-probe\profile-report.json
```

Report SHA-256:

```text
5f82a56b86dde86761cac596114757968953186d945be89de9932428d973356e
```

The report records each outer argv array, exit code, and `shell: false`;
tarball path and SHA-256; normalized composition assertions; public export
resolution; and D-drive cache, store, virtual-store, and temp paths.

The verifier parses the authored and installed patches with an exact,
seven-line grammar. It parses the dump into bounded `- id:` rows and binds the
provider and model to the unique `agent-default-model` row. Matching text in
another row cannot satisfy the assertion.

Using the generated Profile `package.json` as the module-resolution anchor,
the verifier actually resolves and imports:

```text
@tianwen/dsh-probe-bundle
@tianwen/dsh-probe-bundle/adapter
```

It verifies the root identity and `apply` export, plus the adapter's name,
`inject: ["llm"]`, and `apply` export. No private
`@deepseek-ai/*/src/*` path, fork, or copied upstream source is used.

## Executable Windows boundary

On Windows, `TIANWEN_DSH_PROBE_ROOT` must resolve and realpath to exactly:

```text
D:\DevData\tianwen-dsh-probe
```

The Profile is exactly `tianwen-probe`. The tarball basename, absolute path,
and upstream plugin argv are fixed. The tarball must have been generated by
the current verifier run. Every forwarded value is rejected if it contains
shell metacharacters, whitespace, or user/model/external input.

The report states the two process layers honestly:

```json
{
  "tianwenOuterShell": false,
  "upstreamDshWindowsPluginInstallShell": true,
  "scope": "fixed-offline-profile-install-only",
  "userOrModelControlledArguments": false
}
```

This is a known rc.6 Windows compatibility debt, not a general relaxation of
the process boundary.

The actual Profile run used pnpm 11.20.0 through the previously verified
Corepack `pnpm.mjs` path. Corepack networking and dependency replay were
disabled. Credential variables were not passed.

The workspace frozen replay also passed with:

```text
pnpm 11.20.0
--offline
--frozen-lockfile
--trust-lockfile
registry=http://127.0.0.1:9/
```

The unreachable registry makes hidden dependency acquisition fail closed.

## Verification

Final pre-commit results:

```text
Task 3 focused
1 file, 8 tests passed

Tasks 0–3 Node regression
3 files, 16 tests passed

TypeScript workspace typecheck
exit 0

DSH dependency closure
187 installed rc.6 packages; 15 public surfaces

Private DSH source import scan
0 violations

Offline frozen pnpm install
exit 0; already up to date

Python A1
1 passed, 9 deselected

Full Python pytest
424 passed, 4 skipped

Ruff
All checks passed

git diff --check
exit 0
```

The four skipped Python tests are the paid live-model probe, two unavailable
Windows symlink cases, and a Windows ACL case covered separately. No paid test
or API key was used.

## Independent review

Initial reviewer:

```text
019ffeb3-8d2e-77e0-b717-8796466636f5
Critical: 1
Important: 2
Minor: 0
Ready: no
```

After the approved architecture decision and TDD review-fix round 1, the fresh
narrow reviewer was:

```text
019ffed1-595e-7a41-b7dd-f5d5382fc1f3
Critical: 0
Important: 0
Minor: 1
Ready: yes
```

The sole Minor was that this handoff still described the historical blocked
state and old report hash. This revision closes that documentation item while
preserving the historical block and its cause.

## Incidents and residual risk

An early, non-passing verifier attempt let Corepack try to acquire pnpm
11.21.0 because the generated Profile had no `packageManager`. The corrected
verifier copies only the already available exact pnpm 11.20.0 runtime into a
dedicated D-drive Corepack home, writes an exact Last Known Good pointer, and
sets `COREPACK_ENABLE_NETWORK=0`. The shared D-drive Corepack cache may retain
the unused 11.21.0 artifact from that failed attempt; it was not used as Task 3
authority.

The remaining product risk is the explicitly accepted rc.6 Windows internal
`shell: true` debt. The fixed values and offline, no-credential scope make the
Task 3 control-plane probe acceptable, but this exception must not propagate
to runtime code or user-controlled installation.

## Forbidden effects

Task 3 did not use:

- a paid model, model API key, or model request;
- live web/search/fetch business traffic;
- Docker or a real sandbox;
- an interactive DSH app;
- a private DSH source import;
- a DSH fork or copied upstream source;
- Goal, Session, Sandbox, Tools, or UI overrides;
- force-push, merge, rebase, or `main` mutation;
- Task 4 or Alpha Task 10.
