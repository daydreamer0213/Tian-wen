# Tianwen installer safe failure stage receipt design

## 1. Observed gap and decision

The one real, offline managed installation attempt at exact main
`acd1feff8da1db0786430ecc84615ab6a9a35212` returned nonzero and the existing
transaction restored its managed state. No Provider request was made. The
installer currently combines child output into an `Error`; the operational
safe boundary deliberately does not retain or relay that raw output. After
rollback, no durable fact identifies which installer stage failed.

The child root cause is therefore **UNRESOLVED**. This design does not infer or
repair it. The demonstrated, normal-path deficiency is narrower: an operator
cannot safely learn the failed installer stage from `--json` output.

For a failed `--json` invocation, add one non-persistent, canonical safe
failure receipt. It reports a closed installer stage and, when the existing
transaction had to recover, the truthful recovery result. It exits nonzero.
The existing successful receipt, its ready-file schema, deployment transaction,
and ordinary textual-success behavior remain unchanged.

This is a small diagnostic repair under the project's personal-supervision
principle: repair a proved operational gap, but do not promote theoretical
corner cases into a logging or recovery platform.

## 2. Safe failure contract

The only JSON failure value is a newly constructed object with exact keys:

```ts
type InstallerFailureReceipt = Readonly<{
  schemaVersion: 'tianwen.install-failure.v1'
  status: 'failed'
  stage: InstallFailureStage
  recovery: InstallRecovery
}>
```

`InstallFailureStage` is the following closed union, in the actual installer
order:

```ts
type InstallFailureStage =
  | 'managed-layout-preflight'
  | 'pnpm-entry-preflight'
  | 'pnpm-version'
  | 'workspace-install'
  | 'managed-host-deploy'
  | 'runtime-bundle-build-1'
  | 'runtime-bundle-pack-1'
  | 'runtime-bundle-build-2'
  | 'runtime-bundle-pack-2'
  | 'archive-stability'
  | 'managed-profile-deploy'
  | 'managed-profile-validation'
  | 'dsh-config-validation'
  | 'archive-publication'
  | 'receipt-publication'
  | 'installer-internal'

type InstallRecovery = 'not-required' | 'completed' | 'failed'
```

The receipt contains no raw child output, error message, stack, argument,
filesystem path, credential, prompt, Session content, Skill content, or
provider data. In JSON mode, stdout is exactly one canonical receipt line and
stderr is empty. The non-JSON failure form is likewise fixed and short on
stderr:

```text
Tianwen installer failed at <stage>.
```

It may use only the same closed stage token. Neither form forwards an error's
string representation.

`recovery: 'not-required'` applies only to failures before the transaction's
managed mutation/rollback boundary. `recovery: 'completed'` means every
required existing host/Profile/archive/receipt restoration operation completed;
it does **not** claim that Session or Evolution files are byte-identical.
`recovery: 'failed'` means the existing recovery boundary itself could not
finish. Operators continue to use before/after durable-data summaries as the
proof for Session/Evolution equality. The receipt is not persisted, logged, or
added to the ready receipt.

## 3. Stage mapping

Each normal installer operation carries its stage locally before it can fail.
The mapping is intentionally tied to existing operations rather than error-text
matching.

| Stage | Existing operation boundary |
| --- | --- |
| `managed-layout-preflight` | arguments, managed layout classification, current data-layout validation and managed host/Profile prechecks |
| `pnpm-entry-preflight` | offline pnpm entrypoint/regular-file validation and fixed child-environment setup |
| `pnpm-version` | fixed `pnpm --version` validation |
| `workspace-install` | frozen offline workspace install |
| `managed-host-deploy` | managed DSH host deploy and installed-host validation |
| `runtime-bundle-build-1` | first Runtime Bundle build |
| `runtime-bundle-pack-1` | first Runtime Bundle pack |
| `runtime-bundle-build-2` | second Runtime Bundle build |
| `runtime-bundle-pack-2` | second Runtime Bundle pack |
| `archive-stability` | regular-archive/digest comparison between the two packs |
| `managed-profile-deploy` | managed Profile deployment and normalization |
| `managed-profile-validation` | installed CLI resolution and Profile validation |
| `dsh-config-validation` | installed DSH `--dump-config` and output validation |
| `archive-publication` | archive staging/rename publication |
| `receipt-publication` | temporary ready-receipt write/rename publication |
| `installer-internal` | an unwrapped or unknown internal failure |

This mapping does not introduce a generic error classifier. A small local
`InstallStageError` or equivalent wrapper may carry the closed token and
recovery state across the existing function boundaries. Unknown exceptions map
to `installer-internal` instead of exposing their text.

## 4. Preserved transaction and product boundary

- DSH `0.1.0-rc.7` remains the sole product Agent Runtime.
- The existing `runFixed()` child runner, shell-free commands, offline setup,
  deploy order, validation, rollback order, rc.6 predecessor support and rc.7
  replay behavior stay authoritative.
- Failure receipts are process output only. There is no event, database,
  ledger, file, logger, telemetry stream, retry, repair routine, worker,
  queue, scheduler, Runtime, Profile manager, or diagnostic service.
- The design changes no Provider/model/Goal/Session execution, learning,
  Candidate, Evaluation, Shadow, Promotion, Python Alpha, Dynamic Cordis,
  price lookup, price snapshot, budget reservation or billing state.
- The user's 60 CNY authorization remains only an external cumulative
  operational limit. This design calls no Provider and performs no pricing
  activity.

## 5. Test and replay contract

The implementation starts RED and proves each ordinary stage by a representative
existing installer failure seam. The tests must show the exact schema keys and
closed enums, an unknown exception mapping to `installer-internal`, fixed
non-JSON failure text, nonzero exit, and the absence of raw sentinel values
(including a path-like value and credential-like sentinel) from serialized
failure output.

The same tests retain the current success receipt/replay contract, the two
accepted rc.6 predecessor layouts, current managed rc.7 upgrade behavior,
partial deployment rollback and current transaction invariants. A failure
receipt must never change the ready receipt or leave a durable failure record.

## 6. Operational boundary after exact-main CI

Only after the implementation merges to exact main and its automatic CI is
green may operations make one official offline installer attempt against the
existing product root. A failed attempt reports its safe stage and stops; it is
not retried and no child root cause is repaired merely from that receipt.

Only a successful installation may proceed to the separately authorized,
single existing fresh Goal/manifest configured-Provider natural resume. No
ordinary-resume fallback, second Provider attempt, Ticket manufacture,
Candidate, Evaluation, Shadow, or Promotion follows from a failure receipt.

## 7. Non-goals

- retaining child `stdout`, `stderr`, `Error.message`, stack traces or raw
  diagnostics;
- solving the still-unproved child failure root cause;
- changing success receipt/ready-file schema or storing failed receipts;
- adding a generic error framework, logging/telemetry system, watchdog, retry
  or repair capability;
- changing timeout policy, package/dependency layout, workflow, Runtime,
  Provider or learning governance behavior;
- using price queries, price polling, a price snapshot or a product budget
  state machine.
