# Complete grading criteria: verified daily delivery, 2026-09-07

Runtime **0.1.15**, Desktop **0.1.0-preview.16**, DSH **0.1.1-rc.2** are
delivered in the existing daily installation. This is engineering delivery, not
completion of the four-stage genuine-learning route.

## Reviewed source and gates

- Product changes: `30b351a` (versioned complete criteria), `be1a28c` (versions
  and normal predecessor migration). Test-only corrections: `044fa24`, `f308f1d`.
- Whole-branch independent review: `46bc73a..9b8e6da`, Approved, no open Critical
  or Important findings. Final `cbceec3a1000b204c33844ae0db478eb597a8e44` differs
  from reviewed `9b8e6da` only in two documentation files.
- Main was fast-forwarded and pushed normally. All four jobs in exact-main
  [CI34047307397](https://github.com/daydreamer0213/Tian-wen/actions/runs/34047307397)
  succeeded: Python, TypeScript, Windows installer, Windows Desktop. The last job
  finished at `2026-09-06T17:05:12Z`; exact-head metadata was checked at17:09Z.
- Fresh full Vitest: **1830 passed / 18 conditional skips**, 485.11s, exit0.
  Typecheck passed. Full Python: **608 passed / 4 conditional skips**, exit0;
  later changes were TS test-only and documentation. Public surface:25 passed.
- Rebuilt artifact checks:79 passed /3 opt-in skips. Import audit:189 packages,
  24 public surfaces, zero private-import violations. Actual native-module
  identity:14/14 same physical modules. Strict Desktop resource/archive audit passed.
- Separate candidate plus fresh standard Web Profile passed actual packaged
  startup/exit and owned-process cleanup:1 test,48.62s. This is lifecycle duration,
  not page-load speed or a real-model content test.

The earlier full run1822/4failed/18skipped and all diagnostic failures remain
retained. The four story failures were traced to a scripted test grader assuming
an old packet ID; only the test responder changed. Promotion assertions, source
selection, real grading, thresholds and historical results were not weakened.

## Exact daily artifacts and preservation

- Archive SHA256:
  `b7d9d1f23a81fdb0da0a544ac5328eaf1ad3ef662165a8932783ddb82c0ea7c8`.
- Managed and Web Runtime SHA256:
  `9b768c05ea17a501e37bef877c27376aa8037c7081162f7ce2465f820bbc7e95`.
- Web client SHA256, unchanged:
  `7f7f8784f0e63b2eec321552bbbcffb0ef05076b7efe0eb92e5348234e3f4631`.
- Desktop executable SHA256:
  `2e04bb52c9c4d47a6ae898a2d015ea620f25b05494cc6bd46521b946b79e721f`.
- New installation receipt SHA256:
  `25e10c4a56f32ed7b8225ba9585b172ebe1a5fedaeadfb2db3232bf2ae23b601`.

The normal installer upgraded actual014 to015 and independently rebuilt the
same archive twice. The normal Web updater changed outdated-runtime to ready;
both installed Runtime copies match the reviewed candidate. A repeated normal
installation returned the byte-identical receipt without rebuilding.

With no daily process open, old preview15's exact program directory was moved
recoverably to `D:/DevData/tianwen-real-user-retest-20260905/delivery/desktop-replaced-preview.15`.
The candidate was copied into the original shortcut target; all82 files match
individually. The shortcut itself and Web configuration patch remain unchanged.
The worktree cannot be removed: the user's shortcut still targets its dist tree.

The actual daily executable then passed the existing packaged lifecycle test
at01:14 local time:1 passed /4 filtered,5.74s, exit0. Owned DSH PID15140 and
port51184 were separately confirmed gone. This test made no model request.
All30 original Session/state files still match the pre-upgrade combined digest
`F533F1AE67D28EB2CC65871888A9BAAF65D01A7DBC55865140E9B609AC6734E8`.
Old archives, program, receipt and configuration backups remain available.
No package, tag, release or installer was published externally.

Evidence is retained under
`D:/DevData/tianwen-real-user-retest-20260905/evidence/complete-criteria-final-gates-9b8e6da/`
and `delivery/ci-cbceec3-jobs.json`; pre-upgrade receipts are in
`delivery/before-daily-015-criteria/`.

## Genuine acceptance remains open

The repair supplies the complete criteria only to future, explicitly versioned
reviews. Old B/G/J/K, their requests, scores and terminal results are unchanged;
H remains reserved for a post-promotion task. L/M/N are prospectively drafted
ordinary UI tasks, not prewritten answers. Freeze their inputs and final runtime,
parent and contract before the first real DeepSeek call; retain every outcome.
Stage3 genuine source reading/adaptation has evidence. Qualifying Outcome-driven
exploration, successful holdout/activation and targeted future-task improvement
still require real evidence and are not inferred from this delivery.
