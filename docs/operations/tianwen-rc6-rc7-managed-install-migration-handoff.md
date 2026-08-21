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
