# Tian-wen Task8 fix 2B

- Baseline: `08a75b6`
- Added RED coverage for unauthorized `GovernanceStore.persist_eval_request` bindings.
- Implemented atomic `BEGIN IMMEDIATE` authority re-read and immutable insert validation.
- Focused evaluation tests: 61 passed.
- Unit suite: 218 passed.

# Tian-wen Task8 fix 2C

- Baseline: `8b54395`
- `TIANWEN_EVAL_PRIVATE_KEY` now names a protected private-key file; the worker validates sealed paths and OS isolation before reading cases or key material.
- Windows validates `whoami` against `TIANWEN_RUNTIME_ACCOUNT` and fail-closes on unsafe or unparsable `icacls` ACLs for the key, sealed directory, and `cases.json`.
- POSIX requires evaluator-owned regular, non-link sealed paths with no group/other access.
- Added ACL attack/helper coverage and a Windows deployment procedure at `docs/operations/sealed-evaluator-windows.md`.

## Task8 fix 2C completion

- Replaced localized-name blacklist logic with a fail-closed ACL allowlist: only current `whoami` evaluator and `NT AUTHORITY\SYSTEM` may have access; SYSTEM is not evaluator authorization.
- Rejects runtime account, any unknown/localized principal, Administrators, DENY, inherited `(I)`, malformed/unknown ACL tokens, missing evaluator required rights, and command failures.
- Real temporary Windows ACL test: current evaluator plus SYSTEM only; evaluator subprocess generated a receipt; only pytest temporary paths were changed and cleaned up.
- Verification: focused 3 passed / 1 skipped, `test_evaluation` 65 passed / 1 skipped, unit 222 passed / 1 skipped, full 241 passed / 1 skipped, ruff and diff check clean.

# Tian-wen Task8 ACL parser hardening

- Confirmed `OA` is an icacls object-audit/inheritance flag, not an access right.
- Unknown no-parenthesis lines fail closed; only the exact successful icacls summary is ignored.
- DENY, unknown tokens, unknown principals, and inherited entries remain rejected.
- Verification: focused 1 passed, `test_evaluation` 65 passed / 1 skipped, unit 222 passed / 1 skipped, full 241 passed / 1 skipped, Ruff clean, diff check clean.

# Tian-wen Task8 fix 3A

- Baseline: `0e018f3`
- Added `GovernanceStore.bootstrap_repo_task` for one-transaction, exact-replay seeding of the active repo-task champion, approved full protocol, and generation-1 active pointer; partial or conflicting chains fail closed.
- `StateStore.put_immutable_object` now rejects all governance authority kinds and permits only exact candidate artifacts.
- `write_eval_request` binds the supplied full protocol to the approved persisted object before materializing a bundle; `persist_eval_request` receives and rechecks that exact protocol inside its transaction. Bundle-write failures remove only the newly created request directory.
- Added same-ID/different-digest protocol rejection coverage with assertions that no bundle or request remains; migrated evaluation, learning, and memory test seeds to governance bootstrap.
- Verification: focused governance 5 passed; `test_evaluation` 72 passed / 1 skipped; learning and memory 65 passed; Ruff and diff check clean.

# Task9 fix round1

- Baseline: `d0ed3ac`
- TDD RED: added integration coverage showing one parser finding cannot resolve `definitely_absent_review_token`, and Goal A exploration cannot alter Goal B's empty evidence packet or manifest digest.
- `TianwenApp.explore` now uses deterministic normalized word-token coverage over governed evidence summaries plus source title/locator metadata for each unknown; `SUFFICIENT` additionally requires every sufficiency criterion in evidence summaries, nonempty evidence, and no remaining unknowns.
- Added public read-only `goal_evidence_packet(goal_id)`, built from completed current-goal exploration reports with exact report IDs and validated task/run/scope/provenance bindings. The execution prompt digest includes this stable, short packet only; it excludes raw excerpts and prompts.
- Verification: focused 2 passed; vertical 3 passed; full pytest 287 passed / 1 skipped; Ruff and diff check clean.
