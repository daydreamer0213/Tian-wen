# 2026-09-05 learning-route handoff

## Latest bugfix acceptance and completed delivery

See [the real-user repair and retest record](tianwen-real-user-retest-20260905.md)
for the subsequent source `8707090`, Runtime `0.1.12` / Desktop
`0.1.0-preview.13` delivery. Final local tests and independent review are clean;
the genuine 0.1.11 predecessor upgrade passed. Installation-gate main commit
`62e84eef855e72fde89647129022d4ababb59233` passed all four jobs in
[CI 33968423484](https://github.com/daydreamer0213/Tian-wen/actions/runs/33968423484).
Both actual user Runtimes and the existing Desktop shortcut target are upgraded;
packaged Desktop boot/exit and preservation of all 30 user Session/state files
passed. The original shortcut remains the entry point. The 0.1.11 facts below
describe the previous delivery, not this patch's final identity.

Real-model feedback closure and the final bounded status query passed for the
observed cases. Bounded exploration, admitted-source adoption and natural
improvement remain unobserved; scripted coverage is not real-model acceptance.

## Later real-user acceptance correction

The subsequent [real-user browser acceptance](tianwen-real-user-acceptance-20260905.md)
used empty Sessions and genuine DeepSeek-V4-Flash/High responses, with task and
feedback actions through native DSH UI. Ordinary feedback triggered a real
analysis and current-answer correction, but no Skill change. Two formal summary
tasks passed; stop/refresh/continue and consent disable passed. General-task
evidence binding, misleading learning-status explanations and an over-broad
source search remain usability gaps. Bounded exploration and admitted-source
reuse did not execute, so Stage 2/3 real-user end-to-end acceptance remains open.
The engineering/install completion below must not be read as that acceptance or
as proof of ongoing improvement. The earlier synthetic-history browser plan is
superseded and excluded from this evidence.

## Final integration and local-upgrade acceptance

The finite engineering route is complete. The installation-gate main commit
`1e4135e90fd80f746f9f2b4917d6008706ee2b14` passed all four jobs in
[CI run 33950376148](https://github.com/daydreamer0213/Tian-wen/actions/runs/33950376148).
The final Linux failures were Windows-only Session fixture paths; the test helper
now supplies native absolute paths, without changing product validation. The
focused four-file suite passed 88 tests and the twelve-file learning suite passed
161 tests. Follow-up review found no blocker. Later handoff-only commits do not
change the product source or artifact identities listed below.

Both actual managed and Web Runtime under `D:\DevData\tianwen-experience` are
now `0.1.11`, with the exact archive/runtime/client hashes below. The actual
installer returned `ready`; the native Web plugin upgrade returned a ready
Profile. The audited Desktop `0.1.0-preview.12` replaced the existing shortcut's
unpacked target, without changing the shortcut or its DSH home. The previous
directory is retained as `desktop-replaced` in the integration evidence folder.

The real packaged Desktop test passed: Web loaded, Desktop exited successfully,
its owned DSH process exited, and three subsequent HTTP checks confirmed closure.
The 30 existing user Session/state files have the same aggregate digest before
upgrade, after both Runtime upgrades and after Desktop boot:
`F533F1AE67D28EB2CC65871888A9BAAF65D01A7DBC55865140E9B609AC6734E8`.
There were no changed, deleted or added files in those checked roots. No new
model task was submitted for this acceptance.

The local consolidated record is
`D:\DevData\tianwen-learning-route-20260905-integration\final-integration-record.md`;
the actual managed receipt is
`D:\DevData\tianwen-experience\receipts\tianwen-install.json`.
Stages 1–3 engineering and local delivery are complete. Stage 4 natural
effectiveness remains unproven and awaits genuine work; no public package,
tag, GitHub Release, installer upload or upstream DSH push was performed.

## Earlier integration candidate checkpoint

The user subsequently authorized continuing formal integration and local
upgrade, without external package publication, tag, GitHub Release or installer
upload. The earlier disposable acceptance below remains a historical checkpoint,
not the identity of the final integration candidate.

Current delivery identity remains Runtime `0.1.11` / Desktop `0.1.0-preview.12`:
the actual shortcut target uses `D:\DevData\tianwen-experience`, whose managed and
Web Runtime are both `0.1.10`. The unrelated older `D:\DevData\tianwen` installation
is not an upgrade target. A copied pre-existing Desktop and prior profile
manifests/receipt are retained in
`D:\DevData\tianwen-learning-route-20260905-integration`; no credentials were copied.

Integration review found and closed four narrow delivery defects:

- The installer now recognizes the exact frozen 0.1.10 patch, not the newer
  learningLoop-enabled patch. The predecessor fixture is independently frozen;
  current-install classification and rollback tests pass without editing user
  configuration to bypass preflight.
- Ordinary DSH hosts resolve an omitted learning workspace from the native
  Profile base URL's `state/learning-loop`, as the other existing state owners
  already do. Explicit relative paths still reject; no desktop-only dependency.
- Public declaration output is bundled with a pinned build-only declaration
  tool; archived declarations must refer only to packaged files or declared
  public peers. Runtime execution has no added dependency.
- CI and copyable README commands use the actual 0.1.11 archive. New learning,
  base Skill and ordinary-composition regressions are included in CI. The Desktop
  archive scanner retains full closure checking above one MiB with a four-MiB
  bound and a test for a missing import at the end of a large module.

The first broad local check exposed stale notice-policy/description/document
expectations and a machine Corepack path mismatch. Notice queries now use v2,
while historical v1 consent records remain unchanged. Focused delivery checks
passed 174 tests; the corrected default Profile check passed four, with three
opt-in checks skipped. The final local gate passed **101 Vitest files / 1,575
tests**, with five files / 18 conditional checks skipped, in 446.70 seconds.
Python lint/compile passed; pytest passed **608 tests**, with four conditional
checks skipped, in 294.52 seconds. Root typecheck, DSH installation and
public-import checks passed. Independent integration review has no remaining
findings. Natural effectiveness is still open. Exact-main CI and actual user
upgrade remain separately gated; their local receipts belong in the integration
directory named above.

Final integration candidate identities (not the earlier disposable build):

- 133-file source snapshot SHA256:
  `2a341e2b213517b3fdc6244d9380e176e6196f98ae653f18e9bfce2b50581506`.
- Standalone and embedded Runtime archive SHA256:
  `134c8715a070845840e959882ba64000a3b4e0cf417147b02bd14a3995d8dee1`.
- Runtime `dist/runtime.js` SHA256:
  `18a556feeb2eac3c06937b67923b1f06bbf92cae9ab28a3cbde2554738dcf79a`.
- Runtime `dist/client.js` SHA256:
  `7f7f8784f0e63b2eec321552bbbcffb0ef05076b7efe0eb92e5348234e3f4631`.
- Isolated Desktop candidate under `desktop-candidate/win-unpacked` passed the
  exact archive/resource audit; the original user shortcut has not been changed
  as of this candidate checkpoint.

## Earlier engineering checkpoint: source and route boundaries

Workspace: `D:\DevData\tianwen-worktrees\tianwen-architecture-overview-v2-merge`.
Branch: `codex/goal-chat-feedback`; unchanged HEAD:
`93e341e4da8c9a24693bb22e817935cd22385dbb`. All learning changes remain an
uncommitted working-tree increment. No main merge, push or external publication
is claimed. Existing user installation and historical Sessions are untouched.

1. Repeated ordinary outcomes: implemented. The existing three real-model
   illustrative tasks all ended met/no-case; they did not demonstrate learning.
2. Bounded exploration: implemented, with native stop/recovery and review fixes.
3. Existing Skill discovery and narrow adaptation: implemented for explicitly
   host-admitted self-contained text sources under the existing research-summary
   contract. No external source is automatically admitted or installed.
4. Real-task continuous improvement: execution and governance mechanisms are
   available; natural improvement remains unproven. There is no newly supplied
   genuine task requiring an improvement in this round. Do not invent a failing
   baseline or arrange a new model run merely to fill this stage's checkbox.

The finite engineering work is distinct from long-term effectiveness. Future
real work may legitimately succeed without a Candidate. Formal integration and
upgrading the user's currently used installation remain separate from disposable
installation acceptance.

## Review fixes and checked paths

- Accepted experimental work now stops through native `subagents.interrupt`;
  cancellation signals alone only stop native admission. Withdrawal uses the
  existing loop cancellation controller and no later observation is delivered
  after support disappears.
- Native aborted arms remain unfinished. Same-process ordinary/liveness wakes
  cannot restart them; the existing suspended gate requires main `继续` or native
  resume. Across a cold restart, the same child resumes and completed receipts
  are reused. Opening the main Session does not itself start model work.
- The selected model and reasoning effort are applied through DSH's public
  `installModelSelection`, including restored arms. Tests inspect actual requests.
- Source packets use the same initial-Turn boundary as outcome analysis; a later
  repeated packet cannot corrupt the frozen Run's exploration input.
- Reused Skills require a native inspection result with exact definition bytes,
  a matching host-reviewed record and current native-registry resolution. The
  observation must be flushed and found in the persisted child before Evolution
  can accept its reference. Authorization/binding are checked again after awaits.
- Candidate parent, scope and tool contract are preserved. The upstream source
  is untouched; source reference/rationale is retained in the existing immutable
  submission and attribution. The existing Candidate evaluation and activation
  gate still decides whether future Runs may use the change.

Scripted product stories cover direct no-case/skill-change with zero experiment,
indistinguishable experiment → insufficient evidence, distinguishable experiment
→ original analyst → evaluated Candidate, admitted source reuse → evaluated
Candidate, and changed source → rejection with zero Candidate. These are
mechanism proofs, not natural or statistical effectiveness claims.

## Configuration and remaining acceptance

`TianwenRuntimeBundleConfig.learningSkillSources` is optional; omission preserves
the previous tool list and performs no source lookup. Each configured record
must identify the native name/provider, SHA256 of the complete loaded definition,
origin/revision, reviewed license/time, exact scope/tool, DSH version and
`self-contained-text` kind. At most eight unique names are supported. The host
reviewer must establish source/license acceptability and lack of scripts,
installation, dependencies or extra permission requirements; a Skill's own
metadata is not an approval. Sources outside this bounded contract remain out.

## Final local acceptance

The final affected gate passed **20 test files / 364 tests**, 158.64 seconds.
It includes the original 16 learning suites, the new source-reuse suite and the
runtime-bundle, installer and install-closure suites. Root typecheck and
`git diff --check` passed. Public-DSH-import inspection returned zero private
import violations. Independent review closed all reported findings, including
the last source-observation persistence window.

The real installer completed successfully in the fresh disposable D: target
`D:\DevData\tianwen-learning-route-20260905`. Its receipt is
`receipts\tianwen-install.json`, status `ready`; DSH `0.1.1-rc.2`, pnpm
`11.20.0`, Runtime Bundle `0.1.11`. It exercised offline host/profile deployment,
two consecutive stable builds/packs, profile validation and the installer's
existing smoke path. This is local installation acceptance, not exact-main CI,
an external release or an upgrade of the user's current installation.

- Archive: `packs\tianwen-runtime-bundle-0.1.11.tgz`.
- Archive SHA256: `2eaa2c33decca942970749cbe05b5c93f7050ce103363e0ab9a2ce207e86f041`.
- Current built and installed `dist/runtime.js` bytes match, SHA256:
  `d59e29eb2bf86361388898cc78c66471242c0c0495f10df2293e94ccae31f81c`.
- Source snapshot SHA256:
  `241b1b3c924c34731f06b5838af6e04cfb46a5febaa51fae8222feaaa4c45d1a`.
  This hashes the sorted `[relative path, file SHA256]` JSON list of 133 tracked
  or untracked non-ignored files under packages/scripts and the root package and
  pnpm manifests. Documentation and tests are not part of that source identity.

The first packaging check exposed an outdated exact module allowlist and the
test reader's 1 MiB output limit. The allowlist now names only the three intended
new Runtime modules and Evolution exploration module; archive scanning remains
enabled with a bounded 4 MiB reader. The final gate passed unchanged privacy and
public-runtime seam assertions. A test launched while the installer was
rebuilding outputs briefly could not resolve a removed build artifact; the
final complete gate ran after those outputs were rebuilt and passed.

No new real-model run was performed. Historical model tasks and user data were
not edited or deleted. Keep this isolated installation and source worktree for
handoff; do not silently replace the user's product with them.
