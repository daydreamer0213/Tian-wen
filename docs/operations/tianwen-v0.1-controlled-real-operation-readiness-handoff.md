# Tianwen v0.1 controlled real operation readiness handoff

## 1. Conclusion and evidence boundary

The controlled lifecycle has complete archive/publication readiness, but Task 9B.0 proved that its official installed launcher is not yet ready. The official installer publishes the CLI ingress, one-shot runner, and static DSH Profile patch; however, the first official `tianwen.CMD model status --json` exited 0 with empty stdout because the CLI main-entry guard compared a pnpm link spelling with the module's canonical real path and silently skipped `main()`.

This is a core installed-command defect, not a patch-format or archive-content mismatch. The failed status was not rerun. The scripted full-chain still proves mechanics only; configured real Provider activity remains 0.

The reviewed product boundary is:

```text
installed CLI → installed DSH rc.7 Profile → one-shot runner → existing Tianwen Runtime/Evolution services
```

DSH rc.7 remains the only Agent Runtime. Tianwen has not added a second Agent controller or ledger.

## 2. Implementation audit trail

The reviewed Task 9A1-A4 implementation chain is:

- A1 installed ingress and safe transport: `b1c5b2131b086596e9ab5e81fbd89797ae4df39a`;
- A2 seed/Candidate chain: `4819fd768b6e250df4a8492ec03c006f44794023`, followed by stage-boundary revalidation at `c85d4cbd8a3f2cb8a285cfbe261fdc4ef0f91b9b`;
- A3 one-shot mechanism orchestration: `e5b6e37d4efcfc5f34d66d6601759a8b88438e12`;
- A4 publication and installed-boundary implementation: `df628cee8f5c619ab58b9ba62de79c66e35e8b68`, followed by the reviewed exact bundle-input contract at `3f3d8ce9a4e102eb79d1f964504d7f0aa61362a1`.

These are implementation audit points. This handoff deliberately does not invent a future documentation, merge, or CI SHA.

Feature `9da1f45843cc92ca011b94b3344c1a8581dadd78` was merged as main `ce3521f26e08d3fbf2f435fd869c9d64e8ed8b3d`. The merge tree equals the reviewed feature tree; the current repair will receive its own reviewed exact SHA rather than rewriting this audit point.

Repair `7042a7d84712d499671b464251d0f09ec898fcf6` was then merged as main `67ce961487f93734230c06c1624f44573703691f`. Its merge tree equals the reviewed repair tree; the newline repair will likewise receive a reviewed exact SHA before integration.

Newline repair `402b23d4252910ad367ba2070528b99067a041ca` was merged as main `95077be9265818cbcec443a89a71e22363ae1cde`. Automatic exact-main CI run `32641914572`, event `push`, attempt 1 completed successfully: Python, TypeScript, and installer-windows all passed. No earlier failed run was rerun or dispatched.

## 3. What the scripted full-chain proves

Two separate scripted fixtures carry different, non-interchangeable counts:

- The current controlled-real-operation runner spec: 25 formal Sessions, 85 local scripted model requests, 65 tool bodies, 20 acceptance Evidence, evaluation pass 80/80, and 0 external Provider requests.
- The older controlled-skill-lifecycle demo: 25 formal Sessions, 65 local scripted requests, 45 tool bodies, evaluation pass 60/60, and 0 external Provider requests. [`tianwen-v0.1-controlled-skill-lifecycle-handoff.md`](tianwen-v0.1-controlled-skill-lifecycle-handoff.md) remains authoritative for that demo.

Both fixtures prove scripted mechanics only. Neither set of counts is installed-operation or real-Provider evidence. The installed controlled-lifecycle one-shot runner does not import or register `ScriptedAdapter`; the scripted adapter used by this fixture is supplied only by tests. Older development-only mechanism paths retain their service-owned or script-local adapters; they are outside this installed runner.

## 4. Installed ingress readiness and preserved validation history

Each observed problem was closed at the narrow owning boundary:

- Archive stability: pnpm manifest asynchronous key ordering made two otherwise equivalent packs differ. The installer fixes only its pnpm child with `UV_THREADPOOL_SIZE=1`; this setting does not enter the installed product, Provider, or user process.
- Installed identity: the receipt's canonical real path is compared with the canonical real CLI, rather than comparing the receipt with the top-level link spelling. Same-content copies and external paths remain invalid.
- Fresh state ownership: Tianwen does not pre-create DSH-owned Session/Evolution roots. It checks each existing segment in the fixed owner chain and lets the owning DSH/Evolution service materialize a genuinely missing suffix.
- Windows transport: business completion is `child exit + stdout end + stderr end`, not platform pipe teardown. A transport failure requests child termination exactly once: kill once and fail closed.

The preserved validation history matters. The post-R3 official run proved installer/archive completion, manifest revalidation, and missing credential handling, while its second selection-mismatch outer-CLI case timed out. R4 then returned a legal selection-mismatch receipt through the direct installed DSH child; R5 reproduced the timeout through the outer CLI; R6 corrected the monitor and the one permitted short diagnostic returned the legal selection-mismatch receipt in about 4.9 seconds.

The corrected ten-minute official E2E was not rerun. The third official non-fresh Session case was also not run in that final correction round; only its focused contract was exercised. Therefore this handoff does not describe the full official installed E2E as green.

The current runner-plus-patch publication contract is 18/18: every published entry is a regular file with independent identity/inode, no source hardlink, and the LICENSE remains present.

## 5. Evidence labels, receipt and privacy

Mechanism capability is labeled `configured-provider-capable`; the exercised source is `scripted-fixture`, and the evidence remains `development-only` with `synthetic-defect`. These are distinct evidence dimensions, not a claim that all four values are one receipt field. `naturalUserEvidence=not-claimed` and `externalUserEvidence=not-claimed` remain fixed.

For this controlled lifecycle, real DeepSeek requests: 0; real controlled lifecycle runs: 0. No real-provider success has been demonstrated for this controlled lifecycle.

The installed command is:

```text
tianwen controlled-lifecycle --manifest ABS --data-dir ABS --json
```

Its bounded single-line receipt carries only digests, counts, and finite labels. The operation receipt and this readiness handoff exclude operation-specific raw paths, raw tasks, prompts, outputs, tool arguments/results, evaluator reasoning, Skill content, Session/Run/Candidate identity, credentials, and raw errors.

## 6. Feature gates / exact verification

Exact-main CI run `32635033552`, event `push`, attempt 1 is permanently preserved. Python and installer-windows succeeded; TypeScript failed. All four failures were test-platform placement failures: Windows-owned command and Runtime Bundle specs were placed on Ubuntu, where their fixed `D:` paths, junction boundary, and Windows Node/Corepack/archive contracts do not apply. The platform-independent controlled-real runner spec passed on Ubuntu. This is not evidence of a Runtime, Agent, or lifecycle semantic defect.

The failed run will not be rerun. Its recorded next boundary was a new repair exact SHA and a new exact-main CI push run attempt 1. Ubuntu keeps the seven controlled mechanism specs and the controlled-real runner spec, with its fixture root remaining step-local. installer-windows owns the installer, controlled-lifecycle command, and Runtime Bundle specs after a recursive Runtime Bundle build, inside the existing `D:` mapping and cleanup boundary. The runner spec does not move to Windows.

Exact-main CI run `32639440639`, event `push`, attempt 1 is also permanently preserved. Python and TypeScript succeeded; installer-windows failed. Its recursive Runtime Bundle build succeeded. The single Windows three-spec command finished with 1 failed / 103 passed: the installer and controlled command specs passed, and the only failure was the Runtime Bundle patch's complete-text comparison. Windows checkout text used CRLF while the test template used LF. DSH reads the patch as UTF-8 YAML, so this representation difference is not evidence of a Runtime, Agent, lifecycle, or installer product semantic defect.

run `32639440639` will not be rerun or dispatched. The narrow repair preserves the complete LF template comparison after normalizing only standard CRLF input; bare CR, BOM, content, order, indentation, blank-line, and trailing-newline changes remain rejected.

The long installed E2E requires Windows and explicit `TIANWEN_CONTROLLED_INSTALLED_E2E=1`; the default is skip. Local feature acceptance additionally runs the repository TypeScript check, full Python suite, full Ruff check, and diff whitespace validation from the canonical D: cache and fixture environment.

## 7. Next boundary: 9A6-R2 then 9B

This heading preserves the historical pre-R2 boundary: a new repair exact SHA and a new automatic exact-main push run attempt 1. R2 later passed exact-main CI; the current boundary is recorded below rather than rewriting that evidence checkpoint.

## 8. Task 9B.0 official installation evidence

Task 9B.0 ran exactly one official installer at main `95077be9265818cbcec443a89a71e22363ae1cde` into a fresh dedicated product root. The installer returned a canonical `ready` receipt with DSH `0.1.0-rc.7`, pnpm `11.20.0`, and archive digest `sha256:fa92696ea23686e10d83fb1d068eee3f4c3e2a95c9ea718c73f30e2775945f1d`.

Independent read-only checks proved:

- publication is 18/18 regular files, 18/18 `nlink=1`, 18/18 source/installed file identities distinct, and 0 source hardlinks;
- Sessions and Evolution were absent/empty after install and remained absent/empty after the failed status;
- the installer stdout receipt and persisted receipt were byte- and JSON-identical;
- the persisted archive digest matched a fresh raw archive SHA-256.

The single installed status used the official `tianwen.CMD` resolved from the receipt's bin directory. It returned exit 0, stderr 0 bytes, and stdout 0 bytes. Therefore it did not certify offline selection, configured credential reference, or `modelRequestsDelta=0`. It was preserved as `schema-mismatch` caused by empty transport and was not rerun.

The product and evidence roots remain preserved. No manifest, operation root, Agent, Session, Evolution ledger, model switch, Provider request, Goal, or controlled lifecycle was created. Formal `activity-01` was not consumed.

## 9. Next boundary: Task 9B-R0 then one formal lifecycle

Task 9B remains blocked. The next bounded repair must close three proven pre-Provider blockers:

1. compare canonical real file identity in the installed CLI main-entry guard, with a pnpm-like junction RED and no general launcher framework;
2. use the command-scoped DSH patch to set `llm-deepseek.retryPolicy=normal/0`;
3. disable only `session-title-llm`, keeping `session-title`, `llm-retry`, and `settings` enabled.

The full Profile composition must be proven with a dedicated zero-Provider `--dump-config` fixture. Existing runtime preflight remains authoritative for the actual retry value after settings are applied. Ordinary Profile behavior must remain unchanged.

The formal operation packet is frozen separately with exact 15 tasks, 20 workspaces, 25 Session IDs, byte rules, an operation freeze receipt, and a pre-frozen postmortem checker. Reporting distinguishes `receipt-certified`, `durable-observed`, and `unknown`. A passed receipt certifies its Session-event reductions; it does not turn `step/start` or `tool/call` into Provider-account or tool-body counts. No product receipt schema, telemetry, budgeter, or private-ledger reader will be added.

Only after a reviewed repair exact SHA is merged and a new automatic exact-main push attempt 1 has Python, TypeScript, and installer-windows all successful may a new official install use the fresh formal root `D:\DevData\tianwen-v0.1-controlled-real-formal-product`. The preserved Task 9B.0 root must not be reused, overwritten, or cleaned.

Only then may the project perform exactly one formal real Provider lifecycle. The operation must retain the same evidence labels and report a stopped result as evidence rather than retrying it into a better-looking outcome.
