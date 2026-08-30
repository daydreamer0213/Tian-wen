# Tianwen Runtime release identity handoff

**Date:** 2026-08-30  
**Result:** passed

## Product result

- Tianwen Runtime now has the distinct release identity `0.1.1`; Tianwen Desktop is
  `0.1.0-preview.2`, and its embedded archive is
  `tianwen-runtime-bundle-0.1.1.tgz`.
- Desktop accepts an exact current Web Profile without mutation. An exact known
  Runtime `0.1.0` Profile is offered one local update; refusal has no child effect,
  acceptance invokes DSH plugin add once, and startup requires a strict `0.1.1`
  validation. Unknown, future, missing-Runtime, or malformed Profiles are not
  overwritten.
- The managed installer recognizes the independent same-DSH predecessor
  `DSH 0.1.1-rc.2 + Runtime 0.1.0`. It replaces only the managed Profile,
  Runtime archive, and receipt. The DSH host is not deployed again.
- The old `0.1.0` archive remains after a successful managed update because another
  Profile in the same DSH home may still declare that exact file while performing
  its own Desktop update.

No online updater, scheduler, retry system, second Goal engine, or new controlled
Activity was added.

## Real installed-product proof

The accepted proof used a fresh isolated product root:

`D:\DevData\tianwen-runtime-release-proof-20260830-1055-v2`

The predecessor was installed by the official installer from exact main
`656c7d59109e564283d542627aea94e14abba5b3`:

- DSH: `0.1.1-rc.2`
- managed Runtime: `0.1.0`
- old archive digest:
  `sha256:b61709a3875f461ad1565a42a634f8a24f65703a178407d38ae6c2b98e3bc04a`
- a real `web` Profile was then created with that same old archive.

The candidate official installer returned canonical `ready` with Runtime `0.1.1`:

- new archive digest:
  `sha256:ff0540ee90d19eef8e193977ee2b53d2c4a9bdb0a3fac3b05b267be905a16665`
- DSH host file count before and after: `29,236`
- DSH host whole-tree digest before and after:
  `e0c347eb2c86fac113d87c2da20e1a9fcbac1355ee22e4aad694c520699ab555`
- both `0.1.0` and `0.1.1` archives remained present.

The Desktop preparation path then reported:

- before: `outdated-runtime`
- update confirmations: `1`
- after: `ready`
- installed Web Runtime: `0.1.1`
- second resolution: ready without another update

Finally, the updated real Web Profile booted through the Desktop host boundary,
returned HTTP 200 with HTML, and shut down normally. Observed readiness was about
4.5 seconds; this is an execution fact, not a performance guarantee.

## Failures retained honestly

The first proof exposed a real integration defect: the candidate managed installer
deleted the old archive even though another Web Profile still referenced it. With
the original pnpm store restored, plugin add failed with `ENOENT` for the old
archive. The installer was changed to retain the predecessor archive, and its
regression test was observed failing before the implementation changed.

One subsequent Desktop attempt used a different pnpm store from the one used to
create the Web Profile and failed with `ERR_PNPM_UNEXPECTED_STORE`. That was a
controller environment mismatch, not a Tianwen result. Reusing the Profile's
original configured store completed the accepted proof. Tianwen does not parse
pnpm internal metadata or introduce a second package-store manager.

## Verification facts

- Desktop host/profile/locale focused tests: `72/72` passed.
- Managed installer contract: `53/53` passed after the archive-retention repair.
- Aggregated focused release/version/archive contracts: `213` passed, `3` skipped.
- Direct TypeScript project build check passed.
- `git diff --check` passed.
- Independent review approved with no P1/P2 findings.

The test runner's first wrapper invocation attempted a non-interactive
`node_modules` purge and was rejected by pnpm before tests started. The same tests
were run through the already installed Vitest/TypeScript executables. A latent test
fixture assumption that every package manifest has `dependencies` was corrected to
treat the field as optional; product behavior was unchanged.

## Evidence boundaries

- No Provider or model request was required for this packaging/Profile transition.
- No Provider billing, request count, natural-user improvement, or external-user
  improvement is claimed.
- This handoff proves the exact predecessor update paths and one real installed
  product boot. It does not promise arbitrary-version upgrades.
