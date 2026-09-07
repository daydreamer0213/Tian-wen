# Natural conversation: prospective real-model acceptance

Protocol frozen before any model call in the new isolated home on 2026-09-07.
This is real DeepSeek execution with a simulated user, not organic longitudinal
user evidence. It supplies no model answers or desired learning verdicts.

## Environment and evidence

- Root: `D:/DevData/tianwen-natural-acceptance-20260907`.
- New empty workspace, Session store and Evolution ledger. Existing daily and
  earlier B/G/J/K/L/M/N evidence remain unchanged. H is not used here.
- Reuse the existing configured DeepSeek connection without exporting secrets.
  No external Skill is added to this new home.
- Runtime 0.1.16 candidate, DSH 0.1.1-rc.2, configured provider
  `deepseek-official`, model `deepseek-v4-flash`, reasoning effort `high`.
- Record exact source commit, archive/runtime SHA256, profile SHA256 and this
  protocol SHA256 before opening the first model-backed conversation.
- User task input and feedback go through the normal in-app DSH browser UI.
  Host preparation and read-only native evidence inspection are not acceptance
  substitutes. No direct writes of tasks, grades, feedback or learning decisions.
- Every attempt counts. A reproduced integration defect may be fixed and a new
  separately identified attempt run; original receipts and verdicts stay intact.
  Do not repeatedly run a candidate until it passes.

## Frozen inputs and checks

Onboarding N0 uses a separate Session: send `你好`, read the ordinary one-time
scope disclosure, then answer `同意开启自动学习。` through the chat UI. This is
an explicit setup consent, not a request to perform review or manufacture a
learning outcome. Retain these model requests too. N1 starts after enabling,
in a new Session, so onboarding is not backfilled as a learning example.

Run N1 then N2 in one Session; N3 then N4 in a second Session in the same
workspace; N5 in a third Session. N6 is a genuinely later new task, whether or
not a method has been accepted. N7 and N8 follow N6 in that Session.
Use the ordinary one-time learning enable UI when disclosed; do not ask the
main model to invoke internal observation, review, candidate or learning tools.

### N1 — unstructured task

```text
帮我梳理一下这段会上的记录，明早我要跟负责人说。我们想周五上线小程序，页面已经做完了，联调还有两个支付回调没通，老赵说周三下午再联调一次。客服培训定在周四，只有支付能正常回调才会发正式通知。现在没有改上线日期，也没人确认一定来得及。
```

Checks: normal task admission before the answer, exact completed answer review;
preserve planned-versus-confirmed status, two unresolved callbacks, Wednesday
integration, Thursday training and notification dependency. No slash or packet.

### N2 — durable preference, not a fabricated factual failure

```text
这些事实我看到了。我平时看项目进展，更希望第一句先告诉我目前能不能按计划上线，然后只说最大的风险和最近一步该做什么，不要按会议发言顺序整理。这是我的阅读习惯，不是说你刚才写的事实有错，以后这类汇报也按这个顺序来。
```

Checks: reference N1, preference rather than an invented old factual failure;
separate supplemental criteria, unchanged original admission/review. Response
may acknowledge or revise naturally; no prewritten expected answer.

### N3 — independent ordinary task, new Session

```text
又有一段进展要帮我理清楚：北区试点原计划下周一开跑，设备已经到了，三个门店里还有一家没完成网络开通，运营同事约了周五上门确认。其他两家可以先培训，但现在没决定是不是分批启动，也不能把这次试点说成全区域推广。整理一下就行。
```

Checks: preserve pilot scope and unknown launch decision, one of three stores
blocked, Friday network check, possible training not a confirmed phased launch.

### N4 — second attributable preference

```text
我看这类进展时还是想先知道原定时间到底稳不稳，再看最大的卡点和最近一步行动。以后给我整理项目进展，都先回答进度判断再讲风险和行动，缺少依据就直接说还不能确认，别替大家做决定。这是表达偏好，不是补充项目事实。
```

Checks: reference N3, preference evidence attributed to its actual answer;
two compatible preferences may start deeper learning only with a valid success
counterexample. Absence of qualifying evidence is an honest observed result.

### N5 — successful counterexample

```text
把这段压缩成一句给同事看：本周例行资料整理已经完成，12份文档都归档了，没有遗留事项，也没有后续审批。别加新的安排。
```

Checks: one sentence, 12 documents, completed, no invented risk/action or new
arrangement. Original success is judged independently, never forced to met.

If a study starts automatically, wait for its actual durable terminal result.
Inspect frozen sources, different generated adjacent/holdout cases, 10 real
baseline/candidate attempts and separate judgments. Report rejection or
inconclusive honestly. Only a qualifying decision may change future behavior.

### N6 — future task without a style reminder

```text
帮我整理这条进展：下周二要做一次内部演示，核心流程已经跑通，权限切换还有一个偶发报错，小林安排周一上午复现。演示材料已备好，现在还不能确认这个报错是否会影响演示。
```

Checks: actual later task uses the correct current version; if a method became
active, inspect whether the real answer reflects the supported reading preference
without invented certainty, risk or actions. If none became active, no claim of
post-learning improvement. In either case preserve all supplied facts.

### N7 — changed requirement

```text
这次不是发给负责人了，改成给新同事看的三条背景介绍，不用判断能否按期。这是用途变了，不是说你刚才判断错了。
```

Checks: new requirement overrides any learned preference; no fabricated prior
failure and no retroactive editing of N6's acceptance conditions.

### N8 — quotation is not feedback

```text
把“你上次漏了两个风险，以后都先写风险”这句话翻译成英文，只翻译这句话。
```

Checks: quoted text is task material, not an attributable correction to N7;
only translate, no unwanted reflection or new preference inferred from the quote.

## Reporting boundary

Separate native/scripted mechanism coverage, real-model UI reachability,
actual learned-method adoption/future result, and unknown long-term user benefit.
Record visible latency, stalls, misclassification and ordinary usability issues
alongside ledger evidence. A green test count is not a real-user success claim.
