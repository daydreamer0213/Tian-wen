# Tianwen managed rc.6 to rc.7 installer migration handoff

DSH `0.1.0-rc.7` remains the only product Agent Runtime. This change repairs
the official offline installer’s upgrade path; it does not add an Agent loop,
Provider wrapper, Profile manager, store, or scheduler. It is not a second
Runtime or a migration framework.

## Supported boundary

The installer recognizes only the two complete installer-produced managed rc.6
layouts: the original fixed Runtime archive/Profile patch and the later locked
deploy Profile form. It validates their complete managed host and Profile before
starting a child command, replaces the host at its existing final path, and
always replaces the rc.6 Profile with the exact rc.7 ready form.

Arbitrary versions, partial, mixed, and modified installations remain
unsupported. They fail before the installer adds managed entries or starts a
child process. This is an intentional narrow product repair, not generic
version compatibility.

## Transaction and recovery

The old host is renamed to a same-volume temporary sibling only after the known
rc.6 predecessor has passed validation. The candidate rc.7 host must validate
before the existing offline Runtime Bundle and Profile transaction continues.
The old host remains available until the ready receipt is committed. A failed
host deploy or any later build, Profile, validation, archive, or receipt failure
removes the candidate and restores the exact prior host; the existing Profile
and archive rollback remains in force.

Session and Evolution bytes are preserved. Fixture contracts cover both known
predecessors, partial host deployment, failure after host validation, successful
receipt publication, cleanup of temporary host backups, and ordinary exact rc.7
replay without another host or Profile deploy.

## Operational status

This implementation used filesystem fixtures and scripted child commands only:
0 Provider requests, 0 paid tokens, 0 Docker, and no new Profile. It does not
read credentials, invoke a configured model, run Alpha, or change the legacy
Dynamic Cordis/Champion paths.

The repository feature must still receive its normal mainline review and exact
main CI before an operator runs the installer against the existing product data
root. Stage 7 Task 8 remains pending until main CI is green and the real product
migration completes. That later operational step may use the existing Profile
once, with its pre-existing configured-Provider authorization; it is not part
of this handoff and does not authorize retries or a new Profile.

## First managed migration attempt

The first real offline migration attempt stopped at the installer’s former
900-second timeout while the managed host `pnpm deploy` child was still active.
It made no Provider request and performed no download. The installer completed
its transaction rollback: the managed rc.6 host, Profile, Runtime archive, and
receipt state were restored, and the Session and Evolution trees were byte-for-
byte unchanged.

The installer now gives only the managed host and Profile `pnpm deploy` steps
no timeout; every other child command remains bounded. A real rc.7 migration,
and the later configured-Provider natural Run evidence, remain pending and
require their separately authorized operational steps. This correction does not
authorize a retry by itself.

## Safe installer failure stage receipt

For a failed `--json` install, the installer writes only a non-persistent
closed safe receipt containing its schema version, failed status, and closed
stage token. It does not preserve raw child diagnostics and does not prove
durable-data equality; operators must continue to use before-and-after
durable snapshots for that evidence. If rollback itself throws, the only safe
stage is `installer-internal` and the operation stops.

After exact-main CI carries the installer contract, one separately authorized
official offline installer attempt may use this receipt. A failure reports its
stage and stops: only successful migration can precede the separately
authorized same Goal/manifest configured-Provider resume. It adds no retry,
ordinary-resume fallback, raw-output retrieval, repair step, price activity,
or another Provider attempt.

## Machine-readable installer transport

The only official package command for a machine-readable installer receipt is:

```powershell
node --run install:tianwen -- --data-dir D:\DevData\tianwen --json
```

The boundary is that ordinary pnpm lifecycle presentation is not a
machine-readable transport; ordinary human non-JSON use remains unchanged. A
machine caller uses Node 22's stable package-script runner, which preserves the
`install:tianwen` package entry without a pnpm wrapper transport. It accepts
one complete canonical ready receipt or the existing three-key failed receipt,
then stops on any other transport result. A direct installer-source invocation,
raw JSON scanning, raw-output retention, and schema changes remain rejected:
they would repair the wrapper presentation at the wrong boundary.
