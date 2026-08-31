# Tianwen Runtime 0.1.2 release implementation plan

**Status:** completed historical release plan; superseded by Runtime `0.1.5`.

**Goal:** Give the post-`0.1.1` Learning Clue features one unique distributable
identity and one supported upgrade path from exact Runtime `0.1.1`.

**Architecture:** Change only Runtime/Desktop release identities and their
existing strict predecessor checks. Keep exact DSH `0.1.1-rc.2`, existing
installer transactions, native DSH plugin add, user state, and product
architecture unchanged.

## Task 1: Runtime and managed installer identity

- Move Runtime manifest, portable profile, controlled lifecycle, archive names,
  official installer, and verifier to exact `0.1.2`.
- Make same-DSH Runtime `0.1.1` the one Runtime predecessor.
- Preserve the historical managed DSH predecessor and all old archives.
- Update only focused Runtime/installer tests that assert current identity or
  predecessor behavior.

## Task 2: Desktop preview.3 delivery

- Move Desktop package identity to `0.1.0-preview.3` and embed exact Runtime
  `0.1.2`.
- Recognize only exact Runtime `0.1.1` as the Desktop Runtime predecessor.
- Update staging, artifact audit, workflow archive input, localized copy, and
  focused Desktop tests without changing the existing profile state machine.

## Task 3: Documentation and deterministic integration

- Update current README and architecture claims; preserve historical handoffs.
- Build the Runtime tarball and Desktop staged resource once.
- Run focused Runtime/archive, installer, Desktop, TypeScript, packaging, public
  docs, and diff checks.
- Perform an independent identity/migration review.

## Task 4: One installed upgrade proof

- Reuse the accepted `0.1.1` predecessor artifact and create a new isolated
  proof root on `D:\DevData`.
- Prove managed and Web Profile upgrades to exact `0.1.2`, preserved host/state,
  retained predecessor archive, idempotent current detection, real Web HTTP 200,
  and loaded Learning Clue RPC/client surface.
- Do not call a model; this is a distribution proof.
- Record the exact candidate SHA and proof facts, then integrate and take one
  exact-main CI snapshot.
