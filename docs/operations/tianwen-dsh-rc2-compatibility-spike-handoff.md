# Tianwen DSH `0.1.1-rc.2` compatibility spike handoff

Date: 2026-08-27 (Asia/Shanghai)

Status: **reviewed compatibility-research record — candidate not integrable**

Verdict: **`compatible-with-portable-blockers`**

## 1. Authority

- Approved design: `docs/superpowers/specs/2026-08-27-tianwen-portable-dsh-plugin-and-optional-desktop-design.md`.
- Frozen plan and merge base: `ceafb6bc5d842402c83a0030cb2c2c57105c0dd8`.
- Candidate branch: `codex/tianwen-dsh-rc2-compat-spike`.
- Candidate source/test HEAD before this handoff: `d2eeeb6f58bcc582e082ef09140ff136af5ee07c`.
- Isolated worktree: `D:\DevData\tianwen-worktrees\tianwen-dsh-rc2-compat-spike`.
- The source/test worktree was clean at `d2eeeb6` before this documentation record was created.
- The reviewed handoff commit is the commit containing this file. Its exact Git SHA is reported by
  Git and in the user handoff rather than written into this file, avoiding a self-referential
  commit-hash cycle.
- Exact upstream target: release tag `dsh-v0.1.1-rc.2`, peeled Git commit
  `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`. The immutable tag identity was checked with a
  read-only upstream query and recorded in
  `D:\DevData\tianwen-dsh-rc2-spike\evidence\baseline.txt`.
- No merge, push, main update, exact-main CI, official installer change, package publication,
  Desktop installation, live model run, or external/live Provider request belongs to this spike.

## 2. Dependency result

- The six current manifests contain **54** exact `0.1.1-rc.2` DSH pins, distributed as
  `21 + 20 + 1 + 1 + 2 + 9`. They remain exact versions, not ranges.
- `pnpm-lock.yaml` was generated with pnpm `11.20.0`; its current workspace importers resolve rc.2
  and contain no active rc.7 DSH resolution.
- The retained `@deepseek-ai/cordis-plugin-hmr@1.0.16` patch and
  `allowBuilds['@deepseek-ai/dsh-subprocess-local']=false` policy remain unchanged.
- Runtime build, type checking, exact install-closure checks, and public package-root import checks
  passed during Tasks 1–3. No Tianwen source was redirected to a private DSH source path.
- The formal Tianwen installer is deliberately excluded from this dependency result and remains
  pinned to its historical rc.7 product baseline.

## 3. Exact patch result

| Boundary | Disposition | Evidence-backed reason |
| --- | --- | --- |
| cold `--dump-config` remains boot-free | **`port`** | Unpatched rc.2 materialized `profiles/node_modules` with 185 entries during dump. The exact rc.2 patch moves fallback healing from preparation to real composition. Patched dump creates no fallback tree. |
| atomic Windows Profile publication | **`port`** | Three independent unpatched 8-process batches all failed on incomplete/direct final-path publication. The exact rc.2 app-boot patch ports the existing staged file/junction publication without adding retries or a framework. Patched 8/8 boot completed with parseable outputs, valid targets, and no staged residue. |

The active exact mappings are:

- `patches/@deepseek-ai__dsh@0.1.1-rc.2.patch`;
- `patches/@deepseek-ai__dsh-app-boot@0.1.1-rc.2.patch`.

The two rc.7 patch files remain tracked as historical source evidence, but their DSH mappings are
not active in the rc.2 candidate. Full unpatched and patched observations are in the Task 2 report
and `D:\DevData\tianwen-dsh-rc2-spike\evidence\profile-timings.md`.

## 4. Core runtime result

- The Runtime Bundle and its dependency closure build on exact rc.2 using public package roots.
- Offline focused tests passed for Goal creation and authority, Session persistence and recovery,
  explicit resume, Tool-facing public behavior, Skill governance, and Evidence projection/recovery.
- The managed-style fresh Profile verifier passed public offline package replay, exact rc.2
  resolution, ordered composition, boot-free dump, real Profile boot, and one Runtime mount.
- The one-shot real-process lifecycle reached the scripted local model-use/status/offline/status
  sequence and then closed HMR and the DSH process within the existing boundary.
- No **external/live Provider** request occurred. Tests that require a model-shaped interaction use
  the in-process `tianwen-probe` `ScriptedAdapter`; those local adapter requests are not represented
  as Provider or billing facts.
- The packed candidate is
  `D:\DevData\tianwen-dsh-rc2-spike\packs\tianwen-runtime-bundle-0.0.0.tgz`, 220,727 bytes,
  SHA-256 `49669ad521c3350c20f25d8955e2cce82702f3c01f7d6880bede69dd8964fbd6`. It contains the public
  runners and Bundle patches, and does not embed `src/`, `node_modules/`, or a second DSH runtime.

## 5. Performance and filesystem facts

Each label was bound to its packaged DSH binary and measured exactly three times with a fresh
`DSH_HOME`, a 120-second process timeout, telemetry disabled, and no persistent service or
external/live Provider request.

| Candidate | Mode | Samples (ms) | Median | Fallback links |
| --- | --- | ---: | ---: | ---: |
| rc.7 | dump | `217, 213, 205` | `213 ms` | `0, 0, 0` |
| rc.7 | bounded real Profile preparation | `8,932, 9,016, 8,758` | `8,932 ms` | `506, 506, 506` |
| rc.2 | dump | `242, 243, 222` | `242 ms` | `0, 0, 0` |
| rc.2 | bounded real Profile preparation | `8,496, 9,041, 7,678` | `8,496 ms` | `428, 428, 428` |

All six dumps were boot-free and all six bounded boot samples prepared valid Profile JSON/YAML.
The rc.2 boot median was 436 ms lower than rc.7, so the frozen relative-regression condition did
not trigger. Link counts describe the dependency closure and are not product thresholds. Complete
objects are in `D:\DevData\tianwen-dsh-rc2-spike\evidence\profile-timings.md`.

## 6. Data facts

### JSONL product path

**Verified compatible.** A synthetic rc.7 Session/Goal fixture was frozen at 476 bytes and SHA-256
`a0e879f3025124df21c2da2ead3becac29e4b7d3ae702ea89d28c722f96a1c8b`. The one permitted rc.2
verify process recovered the exact Session and Goal at revision 1, appended an end-seed and the
same Goal's change to revision 2, and produced a 900-byte file while preserving the original
476-byte prefix byte-for-byte. Final SHA-256:
`d8f3c343ab95259305058d2dbca1b9d3095c849e1eed09d7f7b837328584b42e`.

### SQLite external fact

Official immutable DSH sources change `SCHEMA_VERSION` from 15 at `dsh-v0.1.0-rc.7` to 17 at
`dsh-v0.1.1-rc.2`. Archived source copies and hashes are under
`D:\DevData\tianwen-dsh-rc2-spike\evidence\upstream-sqlite-schema`. SQLite migration remains
DSH-owned; Tianwen did not run or create a SQLite migrator, and this fact is not inferred from the
JSONL process result.

## 7. Portable external facts

### Stock headless Profile

- After an explicit bounded dependency prefetch, the public
  `dsh plugin --profile headless add --offline <local-tarball>` command exited 0.
- The dump contains one Tianwen Runtime row but no mounted
  `@deepseek-ai/dsh-cordis-host-runner` service layer. Although the runner package is resolvable,
  the headless composition does not satisfy Runtime's `dynamicCordisRunner` injection.
- A bounded `--help` exit 0 proves only the usage path; it does not prove Runtime injection.
- Classification: **portable-plugin composition blocker**, not an rc.2 core incompatibility.

### Stock Web Profile

- Public offline add exited 0 after the same separated dependency-preparation boundary.
- Dump contains one Web host-runner layer and one Tianwen Runtime layer; `dsh web --help` exited 0.
- Classification: **bounded composition reachable only**. No Runtime actual-load, persistent
  server lifecycle, HTTP reachability, or Desktop claim is made.

### Module/service identity and remaining risks

- From both Profile and Runtime anchors, Cordis `4.0.1` and the three checked rc.2 packages resolve
  to the same exact versions and real roots. No duplicate module-identity blocker was observed.
- Both final stock dumps reveal `evolutionRoot: D:/DevData/tianwen-dsh-probe/evolution`. This fixed
  legacy probe path is outside the selected portable roots. It is a **portable-plugin state/data-root
  blocker**, not an rc.2 regression. The bounded help commands did not prove a write there, and this
  spike did not inspect, modify, or clean that historical root.
- Outer/prefetch pnpm was exact `11.20.0`; nested DSH installation reported pnpm `11.21.0`. This is
  retained as a portable environment/version-control risk, not hidden or upgraded into a core
  incompatibility.
- Early fresh offline-add attempts left partial `node_modules` in their original roots. Those roots
  were preserved and not reused, so this spike does not claim install rollback or removal behavior.

## 8. Explicitly deferred product work

- Productize a portable Runtime Bundle contract: a real non-private package version, supported exact
  DSH version, Profile-selected state roots, no development-machine path, and the minimum runner
  composition needed by headless and Web Profiles.
- Verify existing-Profile install success, failure rollback, remove/uninstall, preservation of other
  bundles/configuration, persistent-state retention, and non-selected Profile isolation.
- Make `tianwen status/list/create/resume` target a user-selected DSH home, Profile, and Tianwen
  state root rather than the managed installation layout.
- Migrate and independently verify the formal Tianwen installer; it is still rc.7 now.
- Test a bounded Web server lifecycle and HTTP reachability only in the portable-plugin acceptance
  plan. No Tianwen-specific Web page is planned for the first phase.
- Evaluate and package the optional DSH Desktop shell only after the portable CLI/Profile product
  path is accepted. No Electron/Desktop dependency belongs in the core Runtime Bundle.
- Decide the public product/package/CLI name before external publication; historical `tianwen`
  protocol and evidence names are not rewritten.

## 9. Task 5 local gate status

The candidate-specific deterministic gates are green:

- frozen install, Runtime build, typecheck, exact DSH install closure, and private-import check all
  exited 0;
- the 12-file focused rc.2 suite passed **111/111** tests;
- Python `ruff` and `compileall` exited 0; pytest passed **608**, skipped 4, and failed 0;
- the three opt-in real-process probes used separate fresh Task 5 roots and were each run exactly
  once: managed-style Profile **6 passed / 1 skipped**, one-shot lifecycle **3/3 passed**, and
  concurrent boot **8/8 passed** with 428 valid links in 33,352 ms;
- the fresh managed-style report recorded zero model requests, paid-model requests, live Web
  requests, and Docker invocations. No external/live Provider request occurred.

The complete TypeScript repository command is **not green**: 46 files / 661 tests passed, 2 files /
8 tests skipped, and 6 files / 12 tests failed. The failures were traced without changing source or
rerunning the full command:

1. six managed model/controlled-lifecycle tests construct or require the still-rc.7 installed
   product, while the changed shared `resolveInstalledDshBin()` gate now accepts only rc.2;
2. `controlled-lifecycle-profile.spec.ts` directly keeps the frozen rc.7 expectation while the
   workspace package is intentionally rc.2;
3. four Python A1-related tests derive state under the new Task 5 root, but the evaluator still
   authorizes only `D:\DevData\tianwen-dsh-probe`;
4. the non-opt-in default Profile test used a completely fresh selected-root offline cache and
   lacked Cordis metadata. The separately frozen opt-in Profile probe performed its explicit
   dependency-preparation phase and then passed the real offline verifier exactly once.

The formal installer/historical rc.7 versus shared Runtime rc.2 conflict is a real product phase
boundary, not an environment issue. In the current shared-package structure, the plan's promise to
move the workspace Runtime gate to rc.2 while leaving every rc.7 managed-product/historical
expectation unchanged and green cannot be satisfied as written. The four Python-authority failures
and one fresh-offline-cache failure are separate validation-root/preparation conflicts.

These failures do not overturn the observed rc.2 public Runtime or managed-style Profile result,
but they violate the plan's explicit full-repository acceptance gate. This candidate must not be
integrated. Committing this reviewed document only preserves the compatibility-research facts; it
does not make the full gate green or authorize integration. Complete logs are under
`D:\DevData\tianwen-dsh-rc2-spike\task-5\logs`; the full-check log is `08-pnpm-check.log`.

## 10. Final research classification and exact next gate

**Verdict: `compatible-with-portable-blockers`.**

The evidence supports exact rc.2 for the Tianwen workspace Runtime and managed-style Profile. No
rc.2 public API, core runtime, managed Profile correctness, JSONL data-path, shutdown, concurrency,
or performance failure blocks the next phase. The stock Profile gaps are isolated to portable
product composition and state-root ownership, so they must not be presented as either a core rc.2
failure or a completed portable product.

Because the full repository gate is red, the immediate next gate is a bounded **blocked
investigation/reconciliation**, not implementation of the portable plugin yet. It must decide, in
the smallest reviewed change, how the shared Runtime package represents an rc.2 workspace while
the formal managed installer and its historical protocol remain rc.7, and how the full-suite test
roots receive legitimate fresh dependency preparation without reading or writing legacy probe
state. It must not make rc.7 fixtures pretend to be rc.2 or weaken the new rc.2 Runtime check.

After that reconciliation makes the complete repository gate green, the next product gate is a
separately reviewed **portable-plugin phase plan**, beginning with the smallest product changes
that:

1. remove the fixed legacy `evolutionRoot` and bind state to the selected Profile/configuration;
2. freeze the public headless/Web runner composition and exact CLI install contract;
3. use one Runtime tarball in fresh and existing Profiles;
4. prove install failure rollback, remove behavior, other-Profile isolation, and persistent-state
   preservation;
5. prove actual Runtime load in headless and bounded Web server lifecycle/HTTP reachability.

Formal installer migration, real Provider smoke, package publication, and Desktop remain later,
separate gates.

## 11. Independent review and record boundary

The independent Task 5 review is recorded at
`.superpowers/sdd/2026-08-27-tianwen-dsh-rc2-compatibility-spike/task-5-review.md`.

- Research verdict: **accepted** as `compatible-with-portable-blockers`.
- Candidate integration status: **not ready to integrate** because the complete TypeScript gate is
  red.
- Other findings: **none** after correcting the research-record versus integration wording.

This documentation-only commit records the completed research. It does not authorize merging or
pushing the candidate, updating the formal installer, starting portable-plugin implementation, or
claiming exact-main CI. The bounded reconciliation in section 10 remains the next gate; a
portable-plugin plan may be written and executed only after the complete repository gate is green.
