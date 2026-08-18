# Tianwen Alpha-C clean live sample handoff

Date: 2026-08-18
Status: offline implementation complete; real A1 sample not yet started

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

## Offline evidence

- TDD covered bounded confirmation, success, operational stop, single retry gate, repeated matching Case, condition drift, CNY bound, seed failure, exact final run, and interrupted usage receipt.
- Fresh related gate after review fixes: `90 passed in 69.08s`.
- No Docker, provider request, token, or CNY has been consumed by this branch so far.
- Pending user decisions: none.

## Only next entry

Complete independent correctness and Ponytail re-review plus fresh full Python/Ruff/diff gates. If all are green and the fixed root is still absent, run this one bounded live sample once and update this handoff with the durable result and cost evidence. Do not merge `main` before supervision reviews the real result.
