# Task 1 report: disambiguate analysis reports

## Scope

- Baseline: `7028449ca3cb17381d2a70b72e3c3737fc8ba97f`.
- Owned changes: `packages/tianwen-runtime-bundle/src/learning-analysis-tool.ts`, `packages/tianwen-runtime-bundle/src/learning-loop-orchestrator.ts`, `tests/dsh-migration/learning-analysis-child.spec.ts`, and `tests/dsh-migration/learning-loop-orchestrator.spec.ts`.
- No model calls, UI retest, full-suite run, installations, dependencies, or generated project data were used.

## Root cause and minimal fix

The no-case and insufficient-evidence reports presented a governance verdict without saying it only concerns evidence for a reusable Skill change. The minimal fix makes new preliminary and terminal reports state that boundary, keeps the current-answer correction independent, and retains the old text only when the matching legacy digest is already durable.

## RED

Command:

```powershell
$env:COREPACK_HOME='D:\DevData\corepack-home'; $env:PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN='false'; $env:TIANWEN_DSH_PROBE_ROOT='D:\DevData\tianwen-dsh-probe'; & 'D:\hermes\node\node.exe' 'D:\hermes\node\node_modules\corepack\dist\pnpm.js' exec vitest run tests/dsh-migration/learning-analysis-child.spec.ts tests/dsh-migration/learning-loop-orchestrator.spec.ts
```

Output: 2 expected failures, both in the real `submit_tianwen_analysis` path. New no-case and insufficient-evidence expectations failed because the delivered text was still the old bare verdict/stage report. The unaffected terminal suite passed. This confirmed the report producer was the fault boundary.

## GREEN

Command:

```powershell
$env:COREPACK_HOME='D:\DevData\corepack-home'; $env:PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN='false'; $env:TIANWEN_DSH_PROBE_ROOT='D:\DevData\tianwen-dsh-probe'; & 'D:\hermes\node\node.exe' 'D:\hermes\node\node_modules\corepack\dist\pnpm.js' exec vitest run tests/dsh-migration/learning-analysis-child.spec.ts tests/dsh-migration/learning-loop-orchestrator.spec.ts; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; & 'D:\hermes\node\node.exe' 'D:\hermes\node\node_modules\corepack\dist\pnpm.js' run typecheck; exit $LASTEXITCODE
```

Output: focused suite passed: 2 files, 66 tests. Typecheck completed with exit code 0.

## Coverage and review

- New no-case and insufficient-evidence preliminary reports are exercised through the real submission tool, assert the reusable-Skill boundary and current-answer correction, and assert no submitted hypothesis or raw feedback reaches the public report.
- Pending and delivered legacy preliminary reports retain their exact old content and digest for both verdicts.
- New terminal reports carry the same boundary; pending and delivered legacy terminal reports retain their old text and digest for both verdicts.
- Existing skill-change report behavior remains covered.
- `git diff --check` passed. Reviewed the owned diff for scope, durability, and absence of new fields or dependencies.

## Concerns

None. Full-suite and real UI acceptance remain intentionally owned by the controller.

## Review fix round 1

The initial replay tests selected legacy content and digest but did not model the delivered branch of the submission report-intent result, and terminal replay did not enter the reporting executor. The production behavior was already correct; only test coverage changed.

RED command:

```powershell
$env:COREPACK_HOME='D:\DevData\corepack-home'; $env:PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN='false'; $env:TIANWEN_DSH_PROBE_ROOT='D:\DevData\tianwen-dsh-probe'; & 'D:\hermes\node\node.exe' 'D:\hermes\node\node_modules\corepack\dist\pnpm.js' exec vitest run tests/dsh-migration/learning-analysis-child.spec.ts
```

Output: the two delivered legacy submission-report cases failed because the old mock incorrectly returned `pending` and invoked delivery once. This confirmed the coverage gap.

GREEN command:

```powershell
$env:COREPACK_HOME='D:\DevData\corepack-home'; $env:PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN='false'; $env:TIANWEN_DSH_PROBE_ROOT='D:\DevData\tianwen-dsh-probe'; & 'D:\hermes\node\node.exe' 'D:\hermes\node\node_modules\corepack\dist\pnpm.js' exec vitest run tests/dsh-migration/learning-analysis-child.spec.ts tests/dsh-migration/learning-loop-orchestrator.spec.ts; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; & 'D:\hermes\node\node.exe' 'D:\hermes\node\node_modules\corepack\dist\pnpm.js' run typecheck; exit $LASTEXITCODE
```

Output: focused suite passed: 2 files, 70 tests. Typecheck completed with exit code 0. The new executor-level cases prove that pending legacy no-case and insufficient-evidence records deliver their exact old text/digest, while delivered records do not redeliver.
