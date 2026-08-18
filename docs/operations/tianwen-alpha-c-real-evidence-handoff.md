# Tianwen Alpha-C Real-Evidence Canonical Handoff

**Date:** 2026-08-18
**Stage branch:** `codex/tianwen-alpha-c-real-evidence`
**Base main:** `4638026f210c0de29262d307dd051934570d975e`
**Reviewed implementation HEAD:** `babf37698d409d6941bd52d462b5612543ec605d`
**Status:** offline-ready; live sampling not started; waiting at the truthful local-TTY gate

## 1. Stage conclusion

The bounded Alpha-C real-evidence operator is designed, implemented, independently
reviewed and fully verified offline. It is ready to sample the existing A1 task with the
current Champion under the existing Alpha Trial, Provider, Docker and verifier boundaries.

The real evidence stage is **not complete**. This controller has no interactive terminal
input channel and therefore cannot truthfully enter the required exact
`CONFIRM <trial-id>` local-TTY confirmation. Running the script non-interactively would
create the one-use stage authority and then stop before the first paid request, preventing
the intended live run. The script has therefore not been started.

Current factual outcome:

- real Trial count: `0`;
- paid model requests: `0`;
- model tokens: `0`;
- CNY charged or conservatively reserved: `0`;
- real Docker invocations: `0`;
- qualified real Case: none;
- conditional Lesson: none;
- Candidate: none;
- Promotion or Shadow change: none.

This is a truthful environment/interaction stop, not a product failure and not evidence
that a learning Case exists. Stage A remains a failed live proof whose exhausted Goal must
not be replayed; its historical `usage-invalid` remains operational evidence only.

## 2. Authority and fixed scope

The stage follows:

- `docs/architecture-master-session-memory.md`;
- `docs/superpowers/specs/2026-08-17-tianwen-continuous-learning-governance-design.md`;
- `docs/superpowers/specs/2026-08-13-real-task-alpha-roadmap-design.md`;
- `docs/superpowers/specs/2026-08-18-tianwen-alpha-c-real-evidence-design.md`; and
- `docs/superpowers/plans/2026-08-18-tianwen-alpha-c-real-evidence.md`.

The operator is deliberately fixed to:

- registered task `A1`;
- model `deepseek:deepseek-v4-pro` through the existing DeepSeek Provider;
- current active `repo_task_skill` Champion from the production governance store;
- per-Trial limits of 4 model requests, 8 tool calls, 40,000 total tokens, 300 seconds
  and 8 action effects;
- a 4,096-token provider-request output ceiling;
- one natural Trial, with exactly one independent repeat only after a genuine
  verifier-backed failure under identical frozen conditions and Champion;
- cumulative Alpha-C paid-model limit CNY 20; and
- no automatic Attribution, Lesson, Candidate, comparison, Promotion or Shadow step.

The operator does not modify Runtime or DSH and adds no scheduler, prompt shim, generic
controller, pricing framework or external Skill market.

## 3. Implemented safety and evidence gates

`scripts/run_alpha_c_real_evidence.py` is a one-stage operations entry point, not a
reusable runtime layer. Before any paid request it:

1. creates `D:\DevData\tianwen-alpha-c-real-evidence` atomically as a one-use stage
   authority; a second process or later restart fails closed;
2. requires the expected stage branch, exact base/main/origin-main SHA and a clean tracked
   checkout;
3. opens the production `.tianwen/tianwen.db` read-only, verifies immutable object body
   digests, requires one matching active Champion and rejects an existing Alpha-C real
   Case/Lesson/Conclusion/Candidate or Trial;
4. requires a local price snapshot sourced from the official DeepSeek pricing page, for
   the exact model, no more than 10 minutes old and not dated in the future;
5. applies the highest observed price category to every observed token as a conservative
   upper bound, never calling it an invoice or actual provider charge;
6. prepares A1 and persists a zero-paid preflight receipt before showing the bounded
   preview and exact local-TTY confirmation string; and
7. revalidates persistent TrialResult, TrialManifest, final-verifier Evidence and budget
   usage after execution.

The maximum official rate observed during design on 2026-08-18 was CNY 27 per million
output tokens. At the fixed 40,000-token Trial cap, each Trial reserves at most CNY 1.08;
two Trials reserve at most CNY 2.16, below the approved CNY 20 stage limit. This observation
is not reused as a live authority: the operator still requires a fresh on-disk snapshot
immediately before execution.

For learning intake, non-real, operational, environment, usage or otherwise non-qualifying
results never enter `LearningIntake`. A first qualifying failure is observation only. A
second Trial is permitted only after the first result, condition snapshot, Champion,
workspace and store authority are durably bound and independently rechecked. Two matching
real verifier failures may create a Case and then stop at `case_requires_attribution`.
Success, a single failure, different fingerprints/scopes or insufficient evidence all
stop without forcing a Case, Lesson or Candidate.

## 4. TDD and commit history

- `5a0af57`: initial real-evidence design and plan;
- `1d39254`: normal follow-up formatting fix; no history rewrite;
- `452591d`: bounded A1 operator and first focused tests;
- `d61e74b`: one-use root, fresh pricing, Git/governance audit, zero-resource Intake,
  durable receipt and retry hardening;
- `babf376`: ten-minute freshness bound and native JSON/Git/read-only-SQLite tests.

Recorded RED evidence:

- initial focused collection failed with `ModuleNotFoundError` for the missing operator;
- first review-fix RED failed because the zero-resource Learning budget did not exist;
- second review-fix RED failed because the ten-minute price freshness constant did not
  exist.

Final focused result on reviewed implementation HEAD: `28 passed`.

## 5. Independent reviews

Independent correctness review verdict at `babf376`: **C0 / I0 / M0**, approved for one
truthful live preflight. The review specifically rechecked:

- cross-process sampling and CNY reset prevention;
- production Champion and checkout binding;
- zero-resource LearningIntake compatibility;
- durable Result/Manifest/final-Evidence reload;
- price source, model, freshness and future-time rejection;
- exact TTY confirmation;
- independent repeat identity; and
- the absence of automatic Candidate, Promotion and Shadow effects.

Independent Ponytail/YAGNI review verdict: **approved / lean enough**. The one-use stage
root, small price/audit data records and stage-local receipts are necessary gates for this
one operation and have not become a general framework. No real API test or speculative
Candidate layer was added.

## 6. Fresh offline release gates

All gates below were run serially on `babf376` with generated data and caches on `D:`:

- focused real-evidence integration: `28 passed`;
- existing learning unit + vertical slice: `31 passed`;
- learning-intake unit + integration: `35 passed`;
- Alpha Trial integration: `40 passed`;
- A1-A5 package suite: `10 passed`;
- full Python: `537 passed, 4 skipped`;
- Ruff: passed;
- Runtime Bundle dependency-topology build: passed;
- workspace TypeScript typecheck: passed;
- installed DSH public surface: exact `0.1.0-rc.6`, passed;
- private DSH imports: `0`;
- full Vitest: `244 passed, 7 skipped`;
- full branch `git diff --check`: passed.

The four Python skips are the unchanged paid-live, Windows symlink and Windows ACL
conditions. The seven Vitest skips are existing conditional tests. The first topology
build attempt found a pnpm store-path mismatch; setting
`PNPM_CONFIG_STORE_DIR=D:\DevData\pnpm-store` reused the existing store with no manual
deletion or download and the fresh build passed.

## 7. Current local state

At handoff preparation:

- branch: `codex/tianwen-alpha-c-real-evidence`;
- reviewed implementation HEAD: `babf37698d409d6941bd52d462b5612543ec605d`;
- local `main`: `4638026f210c0de29262d307dd051934570d975e`;
- local `origin/main`: `4638026f210c0de29262d307dd051934570d975e`;
- tracked and untracked worktree status before adding this handoff: clean;
- `D:\DevData\tianwen-alpha-c-real-evidence`: absent;
- `D:\DevData\tianwen-alpha-c-real-evidence-price.json`: absent;
- `DEEPSEEK_API_KEY`: presence checked only; its value was not printed or persisted.

The exact canonical-handoff commit and remote stage ref are reported to the supervising
session after this document is committed and pushed. The stage is not merged to `main`.

## 8. Residual risks and stop conditions

- The live provider, Docker image and verifier have not yet been exercised in this stage;
  offline readiness must not be described as real learning evidence.
- Price data is time-sensitive. A human operator must inspect the current official page
  and write a matching snapshot immediately before the run.
- The stage root is intentionally non-restartable. Do not invoke the script merely to
  inspect it, and do not delete/recreate the root after an error to obtain another batch.
- Do not pipe confirmation, forge `confirmed_via`, add environment auto-confirmation or
  weaken the TTY receipt. Changing that authority boundary requires a separate user
  decision.
- If checkout, production Champion, price, Docker, verifier, provider identity, durable
  receipts or cumulative cost do not match, stop without a paid request where possible.
- Reaching CNY 20, expanding the Goal or authority, or encountering a major irreversible
  risk also stops the stage.

## 9. Pending user decisions

None.

The approved design already requires a real local-TTY operator. The present blocker is
availability of that truthful interaction channel, not a choice between product
directions. If someone proposes replacing the TTY authority with a different mechanism,
that proposal would become a new authorization-boundary decision and is not approved by
this handoff.

## 10. Only recommended next entrance

From this exact reviewed stage branch, a human/local operator should:

1. confirm the stage root and price-snapshot path are still absent;
2. inspect the official DeepSeek pricing page and write the fixed price JSON with the
   current UTC observation time and the current conservative maximum rate for
   `deepseek:deepseek-v4-pro`. The complete required shape is:

   ```json
   {
     "source_url": "https://api-docs.deepseek.com/zh-cn/quick_start/pricing/",
     "model_id": "deepseek:deepseek-v4-pro",
     "observed_at": "<current UTC ISO-8601 timestamp with timezone>",
     "rates_cny_per_million": {"peak_output": 27}
   }
   ```

   `27` is only the 2026-08-18 observation; replace it if the fresh official maximum has
   changed. Do not reuse the example timestamp or an older snapshot;
3. run `uv run python scripts/run_alpha_c_real_evidence.py` in a genuine interactive local
   terminal;
4. inspect the printed bounded preview and only then type the exact displayed
   `CONFIRM <trial-id>`; and
5. stop at the script's final receipt and send the durable evidence and conservative CNY
   accounting back to the supervising session.

Do not start Candidate materialization or Alpha-D after the run. A real Case, if one is
formed, still requires separate governed Attribution and conditional-Lesson evidence;
without both, Candidate remains absent.
