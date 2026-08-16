# Tianwen repeatable installer implementation plan

**Goal:** Replace the formal E2E's private installation setup with one official,
repeatable installer command that prepares the exact DSH host, Runtime Bundle
and Tianwen Profile under a user-selected absolute data directory, while never
touching durable Session or Evolution state.

**Base:** `992f71900f43a7b15c7381740c7cf03717619348`
(`codex/tianwen-explicit-goal-resume`).

**Target branch:** `codex/tianwen-installer`

## Design decision

The entry point is:

```text
node scripts/install-tianwen.mjs --data-dir ABSOLUTE_PATH [--json]
```

Do not add `tianwen install`: a first installation cannot depend on the command
that it is supposed to install. The script uses only Node standard-library APIs
and the repository's exact pnpm/Corepack runtime. It does not become a generic
package manager or accept a package spec, Profile name, executable, registry,
plugin list or shell fragment.

The installer owns only:

- `<data-dir>/dsh-host`;
- `<data-dir>/dsh-home/profiles/tianwen`;
- `<data-dir>/packs/tianwen-runtime-bundle-0.0.0.tgz`;
- `<data-dir>/receipts/tianwen-install.json`.

It never deletes or rewrites `<data-dir>/dsh-home/sessions` or
`<data-dir>/state/evolution`. Existing exact host/profile configuration is an
idempotent replay. A partial/incompatible host or a hand-edited managed Profile
fails before replacement; v1 does not invent a migration or repair framework.

On Windows the data directory must be an absolute safe path under `D:\DevData`.
Package names, Profile name and archive basename are fixed. Tianwen-owned child
processes use `process.execPath` + fixed argv and `shell:false`. The known rc.6
Windows `dsh plugin` internal `shell:true` remains limited to this fixed,
offline Profile install; shell metacharacters and caller-selected package specs
are not accepted.

The installed command already lives in the Profile's package-manager bin
directory. The installer reports that directory instead of mutating the user's
global PATH.

## Task 1: Freeze the pure installer contract

**Files:**

- Create `scripts/install-tianwen.mjs`.
- Create `tests/dsh-migration/tianwen-installer.spec.ts`.
- Modify `package.json` only to add the convenience script.

### Step 1: Write failing contract tests

Cover:

- exact CLI grammar and absolute data-dir validation;
- Windows D-drive/shell-metacharacter rejection;
- fixed path derivation for host, Profile, archive, receipt and installed bin;
- deterministic path-specific Profile patch rendering;
- exact host manifest/bin validation;
- canonical receipt JSON shape;
- no package spec, executable or Profile override input.

The valid RED must be the missing installer exports/file, not dependency setup.

### Step 2: Add the minimum pure helpers

Export only the helpers required by the script and tests. Use Node
`parseArgs`, filesystem/path primitives, JSON and crypto. Do not add a CLI
framework, schema dependency, installer class hierarchy or abstraction layer.

## Task 2: Implement fixed offline installation

**Files:**

- Modify `scripts/install-tianwen.mjs`.
- Extend `tests/dsh-migration/tianwen-installer.spec.ts`.

### Step 1: Resolve the exact package-manager seam

Use the current pnpm invocation (`npm_execpath`) when present, otherwise the
Corepack `pnpm.js` beside `process.execPath`. Require pnpm `11.20.0`. Spawn only
`process.execPath` with argv and `shell:false`; set Corepack/pnpm network off and
reuse the caller's configured store/cache.

### Step 2: Implement the fixed sequence

1. offline frozen workspace install;
2. deploy `@tianwen/dsh-host` to `<data-dir>/dsh-host` if absent;
3. validate exact `@deepseek-ai/dsh@0.1.0-rc.6` host/bin;
4. build the Runtime Bundle dependency closure;
5. pack the fixed Runtime Bundle archive;
6. initialize or validate the managed `tianwen` Profile policy/patch;
7. invoke the fixed offline DSH Profile add for exact base, headless and archive;
8. validate manifest bundle order and run `--dump-config`;
9. validate the installed `tianwen` bin;
10. atomically write the canonical install receipt and print human or JSON
    output.

Do not run a model, start the app, modify Goal/Champion state or test user data.

### Step 3: Prove replay and failure behavior

Unit/integration tests must show exact replay succeeds; incompatible host,
modified Profile policy/patch, failed child process and malformed installed
manifest fail without touching Session/Evolution fixtures or publishing a new
success receipt.

## Task 3: Make the formal E2E consume the installer

**Files:**

- Modify `tests/dsh-migration/tianwen-startup.e2e.spec.ts`.
- Optionally create one narrowly gated installer E2E only if the existing
  formal E2E cannot express both fresh install and replay without duplication.

### Step 1: Remove private installation setup from the test

The E2E must invoke the official script with fixed argv. Keep product fixtures,
Session/Evolution snapshots and list/status/resume assertions in the test; move
only production installation behavior into the installer.

### Step 2: Prove installed use and replay

Verify:

- first install produces the exact host/Profile/bin/receipt;
- installed `list`, `status` and explicit `resume` still work;
- a second installer invocation succeeds without changing Session/Evolution
  bytes;
- the installed DSH/tianwen realpaths do not point into the source worktree;
- no model request occurs during either installer invocation.

## Task 4: Review, low-load gates and handoff

1. focused installer tests;
2. Runtime Bundle build;
3. closure/private-import/typecheck;
4. default Node suite;
5. one official installer/Profile E2E;
6. one Windows local sandbox gate;
7. Python A1-A5 author proof;
8. foreground full pytest;
9. Ruff and base-to-HEAD diff check;
10. independent scoped and whole-phase reviews with no open Critical/Important;
11. canonical handoff, ordinary branch push and docs-only master-memory update.

Run expensive gates serially. No paid model, live web, network dependency
download, real Docker, UI, daemon, auto-resume, database, automatic promotion
or Runtime cutover belongs in this phase.
