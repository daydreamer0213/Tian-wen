# Final fix report: Windows CI public contract

Date: 2026-09-09

## Scope

This narrow source fix addresses the final review finding that the unchanged
Python public CI contract still expected the older Windows installer Vitest
command. The only owned source file changed was:

- `tests/contracts/test_public_repository_surface.py`

The expected Windows installer command now includes these five suites already
owned by the `installer-windows` CI job:

- `conversation-file-material.spec.ts`
- `conversation-file-observer.spec.ts`
- `conversation-file-trial.spec.ts`
- `conversation-guidance-files.spec.ts`
- `conversation-file-learning.spec.ts`

The same five suites were added to the Windows-owned exclusion list for the
Ubuntu TypeScript job. Existing ordered-job, whole-job, and isolation
assertions were preserved. CI production files were not changed.

## Fresh verification

All commands ran from
`D:\DevData\tianwen-worktrees\tianwen-architecture-overview-v2-merge` with
the existing direct interpreter `.venv\Scripts\python.exe`. Temporary data
used the unique directory
`D:\DevData\tianwen-conversation-tests\final-ci-fix-20260909`.

### RED before the fix

```text
\.venv\Scripts\python.exe -m pytest tests/contracts/test_public_repository_surface.py -k installer_windows_job_isolated_from_ubuntu_vitest_contract -q
F                                                                        [100%]
1 failed, 25 deselected in 0.18s
```

The deterministic failure was the whole-job comparison: CI contained the five
new conversation-file suites while the test expected the old command.

### GREEN after the fix

```text
\.venv\Scripts\python.exe -m pytest tests/contracts/test_public_repository_surface.py -k installer_windows_job_isolated_from_ubuntu_vitest_contract -q
.                                                                        [100%]
1 passed, 25 deselected in 0.09s

\.venv\Scripts\python.exe -m pytest tests/contracts/test_public_repository_surface.py -q
..........................                                               [100%]
26 passed in 0.24s

\.venv\Scripts\ruff.exe check tests/contracts/test_public_repository_surface.py
All checks passed!
```

Exit status was 0 for each command.

## Boundaries

This report covers only the public Python CI contract synchronization. It does
not claim Task 5 release readiness or real-model completion. The bounded
seed-failure cleanup minor finding and the pre-existing declaration composite
warning remain deferred as explicitly ruled by root. The six unchanged Python
ACL failures are outside this fix.
