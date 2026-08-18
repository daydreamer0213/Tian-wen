# Tianwen Alpha-C clean live sample handoff

Date: 2026-08-18
Status: bounded real entry stopped before Provider at seed-verifier parsing; no paid request occurred

## Authority and Git

- Base: `48efe0b9626ebc5631270bc89008cfd2fc545975`.
- Branch: `codex/tianwen-alpha-c-live-sample`.
- Implementation code commit: `d34483568c4a1623ef19c51415eb4b192d857e6a`; the following commit adds this handoff.
- Commits preserve normal history; this branch is not merged to `main`.

## Fixed contract

- One new root: `D:\DevData\tianwen-alpha-c-live-sample`; it must not exist at start.
- Task/model: A1 / `deepseek:deepseek-v4-pro`, output ceiling 4096.
- Each Trial: 4 model requests, 8 tool calls, 40,000 tokens, 300 seconds, 8 action effects.
- At most two independent same-condition Trials; the second occurs only after one real verifier-backed qualifying failure.
- CNY 20 is the Alpha-C live-slice ceiling. Accounting uses a conservative estimate of CNY 27 per million tokens; two full token reservations estimate CNY 2.16.
- Existing Goal and budget approval is represented by `confirmed_via=approved_goal_budget`; audit records are not approval gates.

## Evidence and stop rules

- Durable Result, Manifest, final-verifier Evidence, and Goal budget usage are reloaded before classification.
- Non-real, operational, inconclusive, or non-qualifying results never enter LearningIntake.
- Success produces one Outcome and no Case. One qualifying failure only observes. Two matching qualifying failures may produce one Case and stop at `requires_attribution`.
- `candidate_version_id` is always `None`; no Attribution, Lesson, Candidate, Promotion, Shadow, or Alpha-D action is in scope.
- Provider-before failures write a zero-paid final receipt. An interrupted Trial writes its durable trial ID plus settled/reserved usage for later use with the existing `AlphaTrialRunner.resume`; this slice adds no resume or recovery wrapper.

## Verification and real outcome

- TDD covered bounded confirmation, success, operational stop, single retry gate, repeated matching Case, condition drift, CNY bound, seed failure, exact final run, and interrupted usage receipt.
- Fresh gates: related `90 passed`; full Python `541 passed, 4 skipped`; Ruff and diff-check passed. Independent correctness: C0/I0/M1. Ponytail/YAGNI: approved.
- Real root: `D:\DevData\tianwen-alpha-c-live-sample`; Trial directory: `trial-d74126cbaa1ab22faa74e8360982621d`.
- Final receipt SHA-256: `cab5378238176243a7aff316107d7a48aeecbf1ea45c1e6f4ba54524b69278ba`; stop=`infrastructure_preflight_failed`, requests=0, tokens=0, estimated CNY=0, remaining CNY=20.
- No Outcome, Triage, Case, Lesson, or Candidate was created; the second Trial was not prepared.
- Retained seed container `0f143e9f229470ea7ed31d451390e105c4e658bcbbf368628a934a5aa0058585` exited 0. Its canonical image, two read-only mounts, network=none, read-only root, log config, controlled/inherited Env, and identity all match; snapshot digest is `sha256:6f9b86f48b6773b815554faec2653a15c6dc2f2708de93ec64603f909a4495ab`.
- The verifier emitted valid `not_met` JSON with exactly one trailing LF (`sha256:94011985da972e00624174e3763bab8c7890893034a568063499a7137fd5f66d`). `DockerCheckExecutor._parse_verifier` rejects it because `decoded.strip() != decoded`; this is the exact Provider-before stop cause.
- Trial SQLite contains no Goal, Run, budget, action, manifest, or result. Its seed `check_execution` remains `running` although the retained container exited; the parser raised before terminal settlement. Database SHA-256: `76a0ee2eb69c165beeff58902847577969289efa02fa122107b9d53e03e9d223`.
- Pending user decisions: none.

## Only next entry

Do not rerun this root or create another live root. Supervision should first review the zero-paid stop and decide the next clean slice for the shared verifier-output framing bug. Do not merge `main`, create a Candidate, or enter Alpha-D before that decision.
