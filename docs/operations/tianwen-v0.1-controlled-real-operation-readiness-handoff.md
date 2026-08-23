# Tianwen v0.1 controlled real operation readiness handoff

## 1. Conclusion and evidence boundary

The controlled lifecycle now has installed ingress readiness: the official installer publishes the CLI ingress, one-shot runner, and static DSH Profile patch. This conclusion rests on zero-real-Provider installer, preflight, and transport evidence. It does not claim a successful configured DeepSeek lifecycle. The scripted full-chain proves the mechanics; the configured real operation remains the next evidence boundary.

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

## 3. What the scripted full-chain proves

Two separate scripted fixtures carry different, non-interchangeable counts:

- The current controlled-real-operation runner spec: 25 formal Sessions, 85 local scripted model requests, 65 tool bodies, 20 acceptance Evidence, evaluation pass 80/80, and 0 external Provider requests.
- The older controlled-skill-lifecycle demo: 25 formal Sessions, 65 local scripted requests, 45 tool bodies, evaluation pass 60/60, and 0 external Provider requests. [`tianwen-v0.1-controlled-skill-lifecycle-handoff.md`](tianwen-v0.1-controlled-skill-lifecycle-handoff.md) remains authoritative for that demo.

Both fixtures prove scripted mechanics only. Neither set of counts is installed-operation or real-Provider evidence. Production does not register `ScriptedAdapter`; scripted adapters exist only in tests.

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

Current external counts are exact: real DeepSeek requests: 0; real controlled lifecycle runs: 0. No real-provider success has been demonstrated.

The installed command is:

```text
tianwen controlled-lifecycle --manifest ABS --data-dir ABS --json
```

Its bounded single-line receipt carries only digests, counts, and finite labels. Public documentation and receipts exclude raw tasks, prompts, outputs, tool arguments/results, evaluator reasoning, Skill content, Session/Run/Candidate identity, paths, credentials, and raw errors.

## 6. Feature gates / exact verification

The public feature gate keeps the controlled runner, command, and Runtime Bundle specs together in the TypeScript focused step. The native installer contract remains isolated in the Windows job. Automatic CI does not enable the long installed E2E.

The long installed E2E requires Windows and explicit `TIANWEN_CONTROLLED_INSTALLED_E2E=1`; the default is skip. Local feature acceptance additionally runs the repository TypeScript check, full Python suite, full Ruff check, and diff whitespace validation from the canonical D: cache and fixture environment.

## 7. Next boundary: 9A6 then 9B

Task 9A6 archives the exact feature, performs the controlled main integration, and waits for one exact-main CI attempt. Task 9B may begin only if Python, TypeScript, and installer-windows all succeed on attempt 1.

Only then may the project perform exactly one formal real Provider lifecycle. That operation must retain the same evidence labels and must report a stopped result as evidence rather than retrying it into a better-looking outcome.
