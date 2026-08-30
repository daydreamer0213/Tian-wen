# Tianwen Runtime 0.1.2 release handoff

**Date:** 2026-08-30
**Result:** passed

## Product result

- The distributable Runtime is now exact `@tianwen/runtime-bundle@0.1.2`.
- The optional Desktop that embeds it is `0.1.0-preview.3`.
- DSH remains exact `0.1.1-rc.2`; this was not another DSH migration.
- The managed installer recognizes exact Runtime `0.1.1` on the same DSH host as
  its one Runtime predecessor. It updates the managed Profile without redeploying
  DSH and retains older Runtime archives for other Profiles.
- Desktop recognizes only exact Runtime `0.1.1` as its update predecessor. One
  confirmation invokes one existing DSH plugin update; reopening an exact `0.1.2`
  Profile performs no second update.

The release implementation was frozen at
`58bb54dabea32b693892ce6535bd5245a1f80e0c`. A real startup then exposed a
Desktop readiness-parser defect. The fix at
`c09ecdc165e1cfe6b562e72d4e0448a66fc9906c` ignores unrelated external URLs in
DSH startup text while still accepting only loopback HTTP readiness URLs. The
fix changes Desktop host code, not the Runtime `0.1.2` archive bytes.

## Real installed-product proof

The isolated proof root is:

`D:\DevData\tianwen-runtime-0.1.2-upgrade-proof-20260830-130516`

The official installer from exact `0.1.1` source
`55c90faf108f773bd88f95d3dc14c3a9b66095b2` first established the predecessor:

- DSH `0.1.1-rc.2`;
- Runtime archive SHA-256
  `ff0540ee90d19eef8e193977ee2b53d2c4a9bdb0a3fac3b05b267be905a16665`.

The official candidate installer then returned canonical `ready` with Runtime
`0.1.2`:

- archive SHA-256
  `f792abf15215166504da1d5280ae2a6c73e79a70b9940f0ff5bee2d0f2bb8f8f`;
- DSH host before, after, and after current replay: `29,236` files, `36,436`
  entries, `200,152,449` bytes, whole-tree SHA-256
  `28dbad692ab8068d152fb6be80fc4965b7d1bd1a30a8657d2a625ad1940cbab1`;
- the `0.1.1` archive remained present;
- current replay did not change the receipt, managed Profile, current archive,
  DSH host, or Tianwen evolution-state fixture.

A real Web Profile was created from the local `0.1.1` archive. Desktop preparation
then observed `outdated-runtime -> ready -> ready`, with one confirmation, one
update, no create, and no second update. The final Web Profile contains Runtime
`0.1.2`.

After the parser repair and controller-boundary corrections, the real Desktop host
became ready at a loopback URL. The root document returned HTTP 200 as
`text/html`; all eight referenced same-origin assets also returned HTTP 200.
`host.stop()` ended the owned process, the URL became unreachable, and no proof-root
DSH process remained.

The installed Runtime `client.js` and `runtime.js` both contain the shipped
`learning-clues`, `analyze-learning-clue`, and `review-learning-clue` surfaces.
The public HTML does not spell out those RPC names, so this proof does not claim
that an RPC was invoked merely because the page loaded.

## Failures retained honestly

The first real Desktop start found a product defect: the readiness parser rejected
the first non-loopback URL in ordinary DSH startup text instead of waiting for the
loopback readiness URL. A regression test failed before the implementation changed;
the repaired Desktop host contract passed `46/46`, TypeScript passed, and an
independent review found no P1/P2 issue.

The controller had also placed a 102-byte preservation marker inside DSH's live
Session root. It was neither a valid DSH Session layout nor valid Session content,
and DSH correctly refused to load it. The marker was moved outside `DSH_HOME`
without changing its bytes or SHA-256; the controller-created empty directories
were removed. No synthetic Session is presented as a real Session preservation
claim. Other startup-wrapper quoting and non-interactive `pnpm exec` failures
occurred before product startup and did not create additional product samples.

One old detached `0.1.1` source worktree could not be removed normally because
Windows reported `Filename too long`; it was not force-removed and remains a
cleanup item. The proof product itself is retained as the release record.

## Deterministic verification

- Managed installer contract: `53/53` passed.
- Focused Runtime/Desktop release contracts: `166/166` passed.
- Repaired Desktop host contract: `46/46` passed.
- Runtime and Desktop TypeScript checks passed.
- Client build and `git diff --check` passed.
- Two independent reviews closed the historical-archive upgrade issue and the
  readiness-parser issue with no remaining P1/P2 finding.

## Evidence boundaries

- No model or Provider request was made for this release proof.
- No Provider billing or usage claim is inferred from local events.
- This proves exact `0.1.1 -> 0.1.2` delivery, Desktop Profile update, and one real
  Web boot. Learning behavior remains governed by the separate Learning Clue
  handoffs; it was not re-evaluated here.
