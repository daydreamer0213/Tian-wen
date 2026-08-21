# Tianwen managed deploy timeout correction design

## 1. Observed failure

The first real managed rc.6 to rc.7 product migration reached the existing
offline host deployment and was terminated by Tianwen after exactly 900,000
milliseconds:

```text
spawnSync D:\hermes\node\node.exe ETIMEDOUT
```

At the cutoff, the only child was the expected local
`pnpm deploy --prod D:\DevData\tianwen\dsh-host` process and its CPU time was
still increasing. pnpm had not reported a deployment, package, network or
integrity error. The installer then restored the exact rc.6 host, Profile,
archive and absent receipt; all Session and Evolution files remained
byte-identical. No Provider request was made.

This is sufficient evidence that the installer wall-clock cap, rather than a
reported package failure, caused this stop. It does not prove how long this
particular machine will need to finish the deployment.

## 2. Decision

Remove the wall-clock timeout only from the two local package-materialization
steps:

- `@tianwen/dsh-host` deployment;
- `@tianwen/profile-host` deployment.

In Node's synchronous child-process API, `timeout: 0` means no automatic
timeout. Tianwen will pass that existing native value for those two commands.
The installer still waits synchronously and the operating system or operator
can still interrupt it.

All other child commands retain their existing finite timeouts. In particular,
the frozen offline install check, Runtime build, Runtime pack, dump-config and
installed-CLI validation are unchanged.

## 3. Why not another number or a watchdog

Raising 15 minutes to 30 or 45 minutes would repeat the same unsupported guess.
The deployment materializes tens of thousands of small files, so elapsed time
depends heavily on the local disk and real-time scanning. It performs no
Provider call, paid action or external product mutation.

A progress watchdog would add polling, process classification and another
failure policy without a stable pnpm progress contract. There is no observed
need for that machinery. If pnpm or the operating system returns a real error,
the existing transaction already rolls back.

## 4. Preserved architecture and safety

- DSH `0.1.0-rc.7` remains the only product Agent Runtime.
- The existing installer entry point, child runner and transactional rollback
  remain authoritative.
- The strict managed rc.6/rc.7 classifiers are unchanged.
- Host/Profile backup, validation, receipt publication and restoration order
  are unchanged.
- Session and Evolution contents are never rewritten.
- Offline and D-drive package-store requirements are unchanged.
- No retry, worker, queue, scheduler, service, progress monitor, generic
  process manager, second Profile or second Runtime is added.
- No price lookup, price snapshot, budget reservation, billing store or paid
  request gate is added.

## 5. Verification

The existing installer contract must first fail after its expected host and
Profile deploy options are changed from `900_000` to `0`. The minimal product
change then makes that contract green while preserving:

- `shell: false` for every child;
- finite existing timeouts for non-deploy commands;
- partial host-deploy rollback;
- later-failure rollback;
- exact rc.7 replay without redeploy;
- unknown/modified predecessor rejection before child effects.

After focused and repository gates, the change may merge once into main and
must receive exact-main green CI. Only then may the installer be invoked once
more against `D:\DevData\tianwen`. A second real migration failure remains a
stop line and must not fall back to ordinary resume or Provider execution.

If migration succeeds, the already-approved single configured-Provider natural
task may continue. The user's 60 CNY total authorization remains an external
supervisor boundary; it does not justify price polling or new budget code.

## 6. Non-goals

- changing pnpm's deploy algorithm or using `--legacy`;
- copying the host manually or bypassing the official installer;
- detecting every possible hung child process;
- changing timeouts for build, pack, install check or validation;
- adding online recovery or automatic retries;
- changing learning, Candidate, Evaluation, Shadow or Promotion semantics.
