# Tianwen Runtime release identity and Desktop Profile update design

**Status:** completed historical release-identity stage; current Runtime is `0.1.5`

## Product problem

The ordinary Goal-first product is already implemented, but all Runtime bundles
published so far still identify themselves as `@tianwen/runtime-bundle@0.1.0`.
An older Web Profile can therefore satisfy the Desktop's package/version check
while still serving the earlier authored-Task interface. Rebuilding the Planner
or Goal model would not fix that installed-product problem.

## Decision

Publish the current Runtime as `0.1.1` and Tianwen Desktop as
`0.1.0-preview.2`. The package version is the one release identity; no second
digest marker or Desktop-only schema is added.

Desktop keeps using the user's selected exact DSH `0.1.1-rc.2`. It does not
install another DSH and Tianwen remains usable as a normal plugin from DSH CLI
or Web without Desktop.

## Desktop transition

The selected `web` Profile has four relevant states:

1. exact Runtime `0.1.1`: validate and start;
2. exact known predecessor Runtime `0.1.0`: ask once whether to replace it with
   the local archive embedded in Desktop;
3. missing Profile: retain the existing explicit create flow;
4. missing Runtime, unknown version, future version, or structurally invalid
   Profile: retain the current manual/incompatible result.

An accepted update invokes the existing DSH command exactly once:

```text
plugin --profile web --allow-build=koffi add <embedded-0.1.1-archive>
```

The child receives the selected `DSH_HOME`, uses no shell, and is followed by
the same strict target validation used before Web startup. Declining causes no
child process or Profile write. Failure is returned with the exact plugin-add
stage and is not retried or hidden.

## Managed installer transition

The repository installer separately recognizes the complete installed state
`DSH 0.1.1-rc.2 + Runtime 0.1.0`. Recognition requires the exact host,
Profile dependencies and patch, old regular archive, receipt paths, archive
digest, and CLI identity. It is not folded into the older DSH
`0.1.0-rc.7 + Runtime 0.0.0` migration.

This same-DSH transition replaces only the managed Profile, Runtime archive,
and receipt. It does not redeploy the DSH host. A failed transition restores
the previous Profile/archive/receipt. The old `0.1.0` archive remains because
another Profile in the same DSH home may still declare that exact file while
Desktop performs its own update.

## Explicit non-goals

- no online version lookup, updater daemon, background download, scheduler, or
  retry policy;
- no automatic downgrade of an unknown or future Runtime;
- no change to Goal planning, per-Task Sessions, guidance, learning intake, or
  DSH upstream;
- no Provider call or controlled Activity is needed to verify this packaging
  and Profile transition.

## Acceptance

- a current Profile starts without an install child;
- a known-old Profile updates once only after confirmation and then passes
  strict validation;
- refusal has zero mutation, and plugin failure remains visible;
- unknown/future versions are not overwritten;
- the managed installer upgrades the complete same-DSH predecessor without a
  host deploy and rejects incomplete or tampered states before child effects;
- the Runtime archive, Desktop artifact, installer, and public instructions all
  agree on `0.1.1`.
