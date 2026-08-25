# Tianwen Installer Stage Environment Repair Design

## 1. Purpose

Restore the official offline installer as a reliable functional entry point.
The repair must let the workspace dependency installation finish on a real
Windows machine while preserving the already-proven byte-stable Runtime Bundle
archives.

This is an installer lifecycle correction. It is not a controlled-lifecycle,
Provider, credential, receipt, or evidence-format change.

## 2. Observed failure and root cause

On `main@8dc47eb732e58dd33987a1b0bf4941707af4694e`, the single permitted fresh
official installer invocation stopped with the safe stage
`workspace-install`. It ran for about 301 seconds, matching the installer's
fixed `300_000` millisecond workspace-install timeout.

The stopped child had already materialized 576 packages in `node_modules/.pnpm`
but had not published the final pnpm workspace metadata. A single diagnostic
invocation of the exact internal offline command, using the same fixed child
environment and no parent timeout, completed successfully in 366.245 seconds:

- exit code `0`;
- 576 packages resolved and reused;
- 0 packages downloaded;
- stderr empty.

The command was therefore healthy but slower than the parent deadline.

### Safe diagnostic record

This subsection is the tracked review record for the one diagnostic child. The
invocation identity was exactly the workspace-install argv frozen below, from
the exact repository at `8dc47eb732e58dd33987a1b0bf4941707af4694e`, with
offline mode and the installer's fixed child environment, except that the
diagnostic parent supplied no kill timeout. It ran once. Its safe result was
exit `0`, elapsed `366.245` seconds, stdout `3,110` UTF-8 bytes, stderr `0`
bytes, `576` packages reused, and `0` downloaded. Raw stdout is deliberately
not copied into the repository. The original official failure transport and
the failed product root remain preserved in the frozen Task 6 evidence root;
the installer was not rerun.

The contributing architecture error is broader than the number `300_000`.
`UV_THREADPOOL_SIZE=1` was introduced to serialize pnpm's asynchronous
workspace-manifest conversion during the two archive pack operations. The
installer placed that setting in the common child environment, so it also
serialized workspace installation, host/Profile deployment, and bundle builds.
A pack-specific determinism measure became a global installer execution policy.

## 3. Alternatives

### A. Increase the workspace timeout

Rejected. A larger guessed number can fail again on a slower disk or larger
workspace and leaves unrelated pnpm stages single-threaded.

### B. Keep the common single-thread setting and remove only the timeout

Rejected. It would finish eventually, but the installer would remain needlessly
slow because an archive-only constraint still controls unrelated work.

### C. Scope determinism to pack and make workspace installation completion-owned

Selected. Ordinary pnpm stages use their normal libuv concurrency. Exactly the
two Runtime Bundle pack invocations receive `UV_THREADPOOL_SIZE=1`. The offline
workspace installation uses no parent kill deadline and completes or returns its
own pnpm failure. Existing frozen-lockfile, offline, ignore-scripts, shell-free,
and stage-labelled failure behavior remains unchanged.

### D. Normalize archives after packing

Rejected. It adds a new archive-rewriting mechanism to solve a stage-scoping
mistake and would duplicate pnpm packaging semantics.

## 4. Runtime design

`childEnvironment()` remains the single common environment constructor. It no
longer sets `UV_THREADPOOL_SIZE`; because the constructor returns an explicit
environment object, a caller-provided value is not inherited into ordinary
installer children.

`installTianwen()` creates one pack environment by copying the common
environment and adding `UV_THREADPOOL_SIZE: '1'`. `invokePnpm()` accepts an
optional selected environment, defaulting to the common environment. Only the
two existing `pack --skip-manifest-obfuscation` calls pass the pack environment.

The existing workspace install call changes its timeout from `300_000` to `0`,
the Node child-process value for no automatic kill deadline. This matches the
installer's existing completion-owned host and Profile deployment stages. It
does not add a retry, watchdog, background worker, progress protocol, or second
installer path.

The two Runtime Bundle builds and two pack operations retain their existing
`300_000` millisecond deadlines. Host and Profile deployments retain timeout
`0`.

## 5. Error and state behavior

The workspace install remains:

```text
pnpm install --offline --frozen-lockfile --ignore-scripts --trust-lockfile
```

It still runs from the exact repository root with `shell: false`, the fixed D:
store/cache/temp roots, disabled scripts, and no network. A genuine pnpm
non-zero exit remains `workspace-install`; the change only removes a false
parent timeout.

No product root, installed Profile, receipt schema, credential environment,
model selection, Agent, Session, Evolution fact, or controlled lifecycle is
changed by this repair.

The failed Task 6 product and evidence roots remain preserved and are never
reused. After integration and green exact-main CI, product proof uses new roots
and invokes the official installer once.

## 6. Test design

The existing installer scripted seam provides the smallest authoritative
regression test:

1. A RED test aligns `scripted.calls` with `scripted.spawnOptions`, identifies
   the workspace-install call, and expects timeout `0`; the current
   implementation reports `300_000`. The same mapping proves the two builds
   and two packs remain `300_000`, while host and Profile deploy remain `0`.
2. A RED test supplies caller `UV_THREADPOOL_SIZE=64`, identifies pnpm calls by
   argv, and expects exactly the two Runtime Bundle pack calls to receive `1`.
   Every other pnpm call must have the variable absent. The current common
   environment gives every call `1`.
3. Existing archive-stability, failure-stage, D-drive store, shell-free,
   deployment timeout, and rollback tests remain green.
4. The focused installer spec, Windows-owned installer/command/runtime-bundle
   group, build, typecheck, no-private-imports, and repository gates must pass.
5. Exact-main automatic CI must pass Python, TypeScript, and installer-windows
   on attempt 1 before a fresh official proof.

## 7. Scope and simplicity

Production changes are limited to `scripts/install-tianwen.mjs`; regression
tests are limited to `tests/dsh-migration/tianwen-installer.spec.ts`. No package,
lockfile, dependency, workflow, Runtime, Profile, CLI, controlled lifecycle, or
public receipt change is required.

The intended production diff is a stage-local environment selection plus one
timeout value. No new abstraction, dependency, configuration switch, retry,
budget, telemetry, or archive framework is permitted.
