# Tianwen v0.1.0 Research Preview — Public-readiness handoff

**Date:** 2026-08-20

**State:** historical 2026-08-20 public-release attestation plus a current
2026-08-22 terminal-status addendum

## Current status addendum — 2026-08-22

The repository is public, and tag/public prerelease
`v0.1.0-research-preview` exists. The already-published GitHub prerelease text
still describes the pre-public candidate and is stale; updating that external
page remains separate from this repository docs-only closeout.

The current product code-bearing baseline is exact main
`b3be13476206a190f4299ee71a90b5d578b73b73`. Exact-main GitHub Actions run
[32566723012](https://github.com/daydreamer0213/Tian-wen/actions/runs/32566723012)
completed with Python, TypeScript, and native Windows installer jobs green.

Stage 7 is complete. One fresh configured-model natural task completed through
the installed DSH rc.7 product path with Goal complete, 45/45 complete Evidence,
`Outcome=met`, learning=`no-case`, parent Skill-use=`recorded`, and subsequent
offline model restoration. This is project-owner single-user product evidence,
not external-user or general-efficacy evidence.

The final official offline installer returned the canonical ready receipt,
published 16/16 regular independent Profile files with no source hardlinks,
and left Sessions/Evolution unchanged. Installed CLI read-only status returned
exit 0 without exposing governed private-ledger facts.

The bounded remaining route is real five-task paired B/C with blind controlled
evaluation, isolated Shadow, explicit project-owner Promotion approval, and a
Rollback rehearsal. The sections below preserve the 2026-08-20 candidate audit
and its then-current gates; their private-repository and pre-Stage-7 statements
are historical checkpoint facts, not current status.

## Scope and product claim

This handoff covers Tasks 1–6 of the canonical research-preview plan. It does
not authorize public visibility, a tag, a GitHub Release, a pull request, or an
OpenAI application.

DSH 0.1.0-rc.7 is the only product Agent Runtime. The deterministic zero-cost
demo proves a normal DSH Agent execution, a read-only Tianwen Evidence
projection, and an unchanged DSH session-event digest. With zero qualifying
signals the result is `no-case` and `candidateCreated=false`.

Candidate generation, Shadow evaluation, Promotion, production SLA, and a
complete UI are not implemented. Alpha A1–A5, Alpha-B/C, and Alpha-C Intake
are research assets, not adoption. Alpha-D remains stopped. DSH Message
Feedback is not a Lesson by itself, and a DSH Job is not a durable cross-run
Learning Ticket.

Executable Python `RepoTaskRuntime` / `AlphaRuntime` experiment code remains
in the repository for reproducibility and regression tests. It is frozen lab
code, not a supported product Runtime, and this preview publishes no PyPI or
npm package.

## Reviewed candidate secret-scan evidence

Official Gitleaks 8.30.1 was used after its downloaded archive matched the
published checksum
`d29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e`.
Both scans used `--redact=100`; the reports remain outside Git:

- `D:\DevData\tianwen-public-audit\final-all-refs.json` — 6 findings across
  all 138 refs, classified as 5 public/test fixtures and 1 non-secret false
  positive;
- `D:\DevData\tianwen-public-audit\final-current-tree.json` — 10 findings,
  classified as 3 repository test/public fixtures, 2 non-secret source/build
  false positives, and 5 ignored generated or third-party local artifacts.

Active real credential: **0**. Revoked credential: **0**. The supported
conclusion is: completed scans found no unresolved real credential. It is not
an absolute claim that a secret can never exist. No credential was rotated and
Git history was not rewritten.

After this docs-only attestation and its own CI complete, the final public
target is scanned again with Gitleaks 8.30.1. Those redacted reports use the
attestation short SHA in filenames and remain under `D:\DevData`, outside Git.
The final target SHA, CI, and scan classification are recorded in the external
controller handoff instead of being backfilled here; this avoids an endless
cycle in which recording a commit changes the commit being recorded.

## Fresh release-candidate gates

These local gates were recorded for release candidate
`63d6ace4e28455bee75de718078ef5202358ce0e` before mainline integration:

| Gate | Result |
|---|---|
| `uv run ruff check .` | pass |
| `uv run python -m compileall -q src tests` | pass |
| `uv run pytest` | 586 passed, 4 skipped, 0 failed |
| `pnpm run typecheck` | pass |
| `pnpm run check:dsh-install` | 187 exact rc.7 packages and 21 direct public surfaces |
| `pnpm run check:no-private-dsh-imports` | 0 violations |
| full Vitest with only legacy `runtime-profile.spec.ts` excluded | 22 files passed, 2 skipped; 245 tests passed, 4 skipped, 0 failed |
| `pnpm demo:research-preview` | pass; one formatted JSON object; zero external cost |
| `git diff --check` | pass |

The first Vitest attempt exposed local fixture drift rather than a repository
failure: a persistent DSH host still contained rc.6 and the exact probe Python
environment was incomplete. After rebuilding only the disposable probe
environment and temporarily presenting an rc.7 host, the exact gate above
passed. The pre-existing host was restored. No test was skipped to obtain the
result.

The legacy `tests/dsh-migration/runtime-profile.spec.ts` subprocess diagnostic
was deliberately not run. Its first-profile bootstrap can hang, so it is a
named exclusion rather than a claimed pass.

## Deterministic demo evidence

- execution: `completed`;
- scripted model requests: 2;
- deterministic tool calls: 1;
- Evidence: 1 complete, 0 errors;
- qualifying signals: 0;
- learning outcome: `no-case`, `candidateCreated=false`;
- before/after session digest:
  `sha256:0e26d91b8337bd4c50c412f06205d5f5144d74e5b6995b41e7421c60dd3f22fe`;
- formatted JSON SHA-256:
  `df28a3d3289d1a1b71096abf8038eeab3337bd60de3f9aad0d5ed3c91157a35b`.

The demo used zero network calls, Providers, paid models, tokens, CNY, Docker,
persistent databases, and user data.

## Candidate and integration record

- reviewed feature base: `6959f24ce250814ff683837b4278a56faba72a60`;
- release-candidate commit: `63d6ace4e28455bee75de718078ef5202358ce0e`;
- portable-path feature fix: `1b9e69281c98f67dba2c0fa6699e9ac0092bd870`;
- final code-bearing main commit:
  `150f4626ba9da5cfb6fab1a3d6d2cc5ee994291b`;
- exact-main GitHub Actions run:
  [32340254356](https://github.com/daydreamer0213/Tian-wen/actions/runs/32340254356),
  completed successfully for the code-bearing SHA;
- Python job:
  [96337751225](https://github.com/daydreamer0213/Tian-wen/actions/runs/32340254356/job/96337751225),
  success;
- TypeScript job:
  [96337751401](https://github.com/daydreamer0213/Tian-wen/actions/runs/32340254356/job/96337751401),
  success;
- public visibility at the 2026-08-20 checkpoint: private; later superseded by
  the current-status addendum;
- remote branches: 45;
- tag / GitHub Release at the checkpoint: 0; later superseded by the current-
  status addendum.

This attestation commit is docs-only. It does not change the code tree proven
at `150f4626ba9da5cfb6fab1a3d6d2cc5ee994291b`. Its own final target SHA and
automatically triggered CI are verified externally after the commit and are
not written back into the commit itself.

## Historical external actions completed after this handoff

This handoff originally required the project owner to review the exact target,
scan, CI, license, demo, and branch-visibility consequence before these three
independent external actions:

1. change `daydreamer0213/Tian-wen` from private to public and set public
   metadata/topics;
2. create and push the annotated `v0.1.0-research-preview` tag;
3. create the public prerelease from the reviewed release notes.

Those repository-publication actions were later completed, as recorded in the
current-status addendum. This historical authorization does not authorize a new
release, prerelease edit, application submission, Provider run, Promotion, or
other external action now.
