# Subsequent release preparation — not yet dispatched

Execute only after both source-reference tasks have passed their reviews. This is a mechanical release/upgrade identity task, not a change to learning criteria, permissions, models or effects. Main must record dispatch BASE and provide this brief plus report path. Use existing isolated D:/DevData/tianwen-worktrees/tianwen-architecture-overview-v2-merge. You are not alone; preserve others' work. No actual packaging, install, network, process, Daily, old evidence, dependencies or lockfile changes.

## Outcome and exact ownership

Prepare Runtime0.1.22 / Desktop0.1.0-preview.23, retaining predecessor010–021 including actual Daily017. Preserve unknown-future rejection, now023. Current source version021 is a candidate, not current Daily; docs must keep that distinction.

Owned production/metadata files:
- packages/tianwen-runtime-bundle/package.json
- packages/tianwen-desktop-host/package.json
- packages/tianwen-desktop-host/src/host.ts
- packages/tianwen-desktop-host/src/main.ts
- packages/tianwen-desktop-host/src/locale.ts
- packages/tianwen-runtime-bundle/src/portable-profile.ts
- packages/tianwen-runtime-bundle/src/controlled-lifecycle.ts
- scripts/install-tianwen.mjs
- scripts/stage-desktop-runtime.mjs
- scripts/audit-desktop-artifact.mjs
- scripts/verify-dsh-profile.mjs
- .github/workflows/ci.yml
- README.md

Owned test files (all in tests/dsh-migration except final Python file):
controlled-lifecycle-profile.spec.ts, controlled-lifecycle-command.spec.ts, one-shot-profile-lifecycle.spec.ts,
ordinary-long-goal-cli.spec.ts, portable-goal-cli.spec.ts, portable-plugin-lifecycle.e2e.spec.ts,
portable-profile-composition.e2e.spec.ts, runtime-bundle.spec.ts, runtime-profile.spec.ts,
tianwen-desktop-artifact.spec.ts, tianwen-desktop-distribution.e2e.spec.ts,
tianwen-desktop-host.spec.ts, tianwen-desktop-profile-prepare.spec.ts, tianwen-installer.spec.ts,
tianwen-version-upgrade.e2e.spec.ts, tianwen-startup.e2e.spec.ts,
tests/contracts/test_public_repository_surface.py, and assigned report.

## Implementation and evidence

1. Read-only inventory by /root/natural_reuse_release_inventory at663df39 found no Python product/version changes and no lockfile version literal. Do not rerun a whole-repo discovery audit. Inspect the named files where needed, keeping current-vs-predecessor-vs-invalid-future roles distinct.
2. RED: update one existing current-version assertion to022 and add valid021 predecessor/invalid023 expectations first in tianwen-desktop-host.spec.ts; run that focused file to show failure against021 production. Then implement current022 constants/archive names/package metadata, preview23 and017-preserving predecessor additions.
3. scripts/install-tianwen.mjs currently has explicit per-version archive/receipt identities. Add021 matching branch and archive path, preserve010–020 branches including017 and their state/session backup safeguards. Existing parameterized predecessor tests already exercise full identity checks, source-link rejection, old package/data retention, repeated-install byte identity and failure recovery. Add021 to those matrices rather than duplicate installer machinery.
4. host.ts predecessor array adds021, current022. locale.ts upgrade wording adds021 and names022. desktop-host package resources and main.ts use022 archive. Other named runtime/lifecycle/installer/staging/audit/profile verification constants and current-version fixture filenames become022; keep historical020/021 predecessor fixtures where they are intentionally older. Unknown future version in host spec becomes023. No global blind replacement of every old version.
5. CI currently incorrectly stages/audits0.1.20 at .github/workflows/ci.yml112/140 while current candidate is021; change both to022. Add conversation-skill-source.spec.ts to the explicit natural conversation suite nearline50; synchronize the exact suite tuple in tests/contracts/test_public_repository_surface.py near831–852. Preserve all other workflow/test gates.
6. README current-candidate version/install examples/upgrade range become022; explicitly preserve actual Daily017 delivery as history, not a new installation claim. No old acceptance/result documents edited or renamed.
7. Environment prefix: source D:/DevData/tianwen-natural-acceptance-20260907/evidence/gate-env.ps1; D:/hermes/node/node.exe D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs. Scoped runtime-bundle/desktop-host typecheck/build may emit package JS, but do not pack Desktop. Actual default pack:dir/pack:win would overwrite the Daily shortcut target dist/tianwen-desktop/win-unpacked and is forbidden. Big future artifacts will be made in separate E: output by main.
8. GREEN: current CI's two relevant suites: tianwen-installer.spec.ts, controlled-lifecycle-command.spec.ts, runtime-bundle.spec.ts, one-shot-profile-lifecycle.spec.ts, learn-loop-host.spec.ts; then tianwen-desktop-host.spec.ts, tianwen-desktop-bootstrap.spec.ts, tianwen-desktop-profile-prepare.spec.ts, tianwen-desktop-artifact.spec.ts. Run focused Python tests/contracts/test_public_repository_surface.py with existing project .venv Python and short D: temp/cache paths, no installs. If a command requires exact existing fixture env not supplied, ask main for it rather than start live/install operations. Record actual conditional skips; no suite result substitutes for a packaged install.
9. Self-review role-specific version changes and git diff --check; commit only owned files and report. Report RED/GREEN actual commands/output, exactSHA, retained017 predecessor, known limits. Whole-branch final review/full regression/exact candidate packaging/real checks/mainCI/Daily remain with main. Actual tianwen-version-upgrade.e2e target is historical DSHrc.7; never call it real Daily017→022 acceptance.

The current raw sources and version constants are independently checkable. No newer date/SHA can stand in for actual installed bytes. Do not mutate global dependencies, shared junctions, old R0–R10/R11 records or user installation while doing this task.
