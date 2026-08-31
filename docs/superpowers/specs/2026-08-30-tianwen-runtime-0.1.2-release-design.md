# Tianwen Runtime 0.1.2 release design

**Date:** 2026-08-30
**Status:** completed historical `0.1.2` release; superseded by Runtime `0.1.5`

## Product problem

Runtime `0.1.1` was fixed at commit `55c90fa`. The Learning Clue inbox,
configured-model analysis, and reviewed lifecycle were added afterwards. Keeping
the package and archive named `0.1.1` would make one version identify different
product bytes, while an existing strict `0.1.1` installation would be treated as
current and never receive the new features.

The next distributable Runtime is therefore exact `0.1.2`.

## Version boundary

- DSH remains exact `0.1.1-rc.2`; this is not another DSH migration.
- Tianwen Runtime becomes exact `0.1.2`.
- Runtime `0.1.1` on DSH `0.1.1-rc.2` is the sole same-host Runtime predecessor.
- The existing managed DSH `0.1.0-rc.7` predecessor path remains supported and
  unchanged except that its successful destination is now Runtime `0.1.2`.
- Old Runtime archives remain in the shared pack directory because another
  Profile may still reference them.
- Internal private Tianwen packages do not receive cosmetic version bumps.

The standalone Runtime tarball remains installable through ordinary DSH
`plugin add`, so CLI/Web users do not depend on Tianwen Desktop or the managed
installer.

## Desktop boundary

The Desktop build that embeds Runtime `0.1.2` becomes
`0.1.0-preview.3`. Reusing `preview.2` with a different embedded archive would
repeat the same identity problem at the Desktop layer.

Preview.3 recognizes exact Runtime `0.1.1` as its one upgradable predecessor.
It asks for the existing user confirmation, invokes the native DSH plugin add
once, and then requires exact `0.1.2`. Runtime `0.1.0` must first use the
already-released `preview.2` path to reach `0.1.1`; preview.3 does not grow a
multi-version migration framework.

## Acceptance

Use one fresh isolated root on `D:\DevData` and existing accepted `0.1.1`
artifacts where possible:

1. establish an exact DSH `0.1.1-rc.2` managed installation and Web Profile on
   Runtime `0.1.1`;
2. run the candidate official installer once and reach Runtime `0.1.2` while
   preserving DSH host bytes, Session/state bytes, and the `0.1.1` archive;
3. let preview.3 classify the Web Profile as `outdated-runtime`, obtain one
   controller confirmation, invoke plugin add once, and then classify it as
   exact current without another install child;
4. start the real Web host, receive HTTP 200, and prove the Runtime client graph
   and Learning Clue RPC surface load;
5. run focused Runtime/archive, installer migration, Desktop staging/profile,
   TypeScript, and packaging checks, followed by one exact-main CI snapshot.

No Provider request, natural development task, controlled Activity, new DSH
download, or repeated lifecycle evaluation is part of this release proof.

## Non-goals

- no support range or generic updater;
- no direct Desktop upgrade from every historical Runtime;
- no DSH, learning schema, Goal, analysis, or reviewed-behavior redesign;
- no deletion of predecessor archives or user state;
- no claim that the release adds external-user or general-efficacy evidence.
