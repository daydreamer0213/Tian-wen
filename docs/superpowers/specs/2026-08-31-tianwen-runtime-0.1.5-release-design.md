# Tianwen Runtime 0.1.5 release design

**Date:** 2026-08-31  
**Status:** approved implementation boundary

## Product problem

The accepted Runtime `0.1.4` installed-product proof used source `c39c7c6`.
The final DSH-native continuous-Goal fixes were committed later and merged at
`main@e9da252`. Building that final source again as `0.1.4` would make one
version identify different product bytes, while a strict existing `0.1.4`
installation would be treated as current and never receive the fixes.

This is a release-identity and exact upgrade task. It is not another Goal,
Desktop, or DSH redesign.

## Alternatives considered

1. **Runtime `0.1.5` and Desktop `0.1.0-preview.6`, with exact `0.1.4`
   predecessor support — selected.** This preserves immutable release identity
   and gives existing managed and Desktop Profiles one narrow upgrade path.
2. Rebuild the final source as `0.1.4` / `preview.5` — rejected because it
   repeats the same-version/different-bytes defect.
3. Publish `0.1.5` for fresh installs only — rejected because known managed
   `0.1.4` installations would be stranded even though the existing one-step
   upgrade machinery already covers the transition.

## Version boundary

- DSH remains exact `0.1.1-rc.2`.
- Tianwen Runtime becomes exact `0.1.5`.
- Tianwen Desktop becomes exact `0.1.0-preview.6` and embeds the exact Runtime
  `0.1.5` archive.
- Runtime `0.1.4` on DSH `0.1.1-rc.2` is the sole same-host Runtime
  predecessor for both the managed installer and Desktop Profile preparation.
- The older managed DSH `0.1.0-rc.7` predecessor path remains supported, with
  Runtime `0.1.5` as its destination.
- Older Runtime archives remain in the shared pack directory because another
  Profile may still reference them.
- Internal private Tianwen packages, DSH dependencies, lock files, and data
  schemas receive no cosmetic change.

Version changes follow the existing explicit release pattern used for
`0.1.2`, `0.1.3`, and `0.1.4`. No release framework or generic version
registry is added.

## Product and artifact flow

The existing official scripts remain authoritative:

1. build and pack `@tianwen/runtime-bundle@0.1.5`;
2. stage that exact archive into Desktop `preview.6`;
3. build unpacked and NSIS Desktop artifacts;
4. audit that the Desktop resource archive is byte-identical to the packed
   Runtime archive and that exactly one installer is produced;
5. run the official installer against a fresh isolated `D:\DevData` product
   root first as accepted Runtime `0.1.4`, then as candidate `0.1.5`, and then
   replay `0.1.5` once to prove current-state idempotence.

The predecessor is established from the exact accepted `0.1.4` source/archive
boundary recorded by the continuous-Goal handoff. Historical proof directories
are read-only and are not upgraded in place.

## Minimal installed-product acceptance

- predecessor, upgrade, and current replay installer invocations exit 0 and
  return canonical `status=ready`;
- DSH remains `0.1.1-rc.2`, and its installed host tree is byte-identical
  across the Runtime-only upgrade;
- the `0.1.4` archive remains present;
- receipt, managed Profile, current archive, and CLI identity all resolve to
  exact Runtime `0.1.5`;
- existing Session/evolution state, when present naturally, is byte-identical;
  no synthetic Session is created for the proof;
- the replay does not change receipt, Profile, archive, host, or user state;
- no installer staging or backup directory remains;
- the Runtime archive, Desktop embedded archive, unpacked Desktop, and single
  NSIS installer all agree on `0.1.5` / `preview.6`;
- a provider-free Desktop/Web startup check reaches a loopback HTTP page and
  owned processes stop cleanly. The already-green exact-main deterministic
  contracts cover the interactive Profile confirmation branch, so the
  controller does not invent an automatic UI clicker.

## Verification economy

Run focused release-identity, installer, Runtime packaging, Desktop staging,
and artifact tests for the changed version boundary. Build the actual local
artifacts and perform the one installed upgrade described above. Do not repeat
the already-green Python suite, every scripted demo, natural Goal run, or
Provider-backed task merely to restate prior evidence.

After integration, exact-main CI remains the repository-wide gate for the
final SHA.

## Explicit non-goals

- no DSH upgrade, DSH upstream modification, or external DSH push;
- no Provider/model request or repeated natural task;
- no online updater, scheduler, download service, generic migration range,
  retry framework, or new Desktop UI;
- no npm publication, Git tag, GitHub Release, installer upload, or public
  distribution without separate external-release authorization;
- no mutation or cleanup of historical proof, evidence, product, debug, or
  legacy worktree directories.

## Handoff boundary

The stage will create a new Runtime `0.1.5` release handoff. It will report
release SHA, archive and Desktop artifact hashes, installed upgrade result,
deterministic checks, exact-main CI, retained predecessor facts, cleanup, and
the absence of Provider or external publication separately.
