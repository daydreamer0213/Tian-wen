# Tianwen Portable Python CI Design

**Status:** Approved in the architecture-supervision conversation on 2026-08-20.

## Problem

The research-preview workflow intentionally defines one Python and one
TypeScript job on `ubuntu-latest`. The TypeScript job is green. The Python job
passes checkout, immutable `setup-uv`, dependency sync, Ruff, and `compileall`,
then fails only in four retained Alpha test files.

There are two deterministic causes:

1. `alpha_workspace._git_environment` always reads the Windows-only
   `SYSTEMROOT` variable.
2. The Alpha-B comparison and Alpha trial integration fixtures hard-code a
   `D:` data root and pass `allowed_drive="D:"`, although their private test
   seam already supports an injected drive boundary.

The public Alpha workspace entry point deliberately requires `D:` on Windows.
That safety contract belongs to the frozen Alpha lab and is not a Linux product
support promise.

## Decision

Keep both CI jobs on `ubuntu-latest` and keep the Python command as the complete
`uv run pytest`. Make only the retained Alpha test infrastructure portable:

- use `os.devnull` for Git's disabled global-config path;
- include `SYSTEMROOT` in the isolated Git environment only when the host
  provides it;
- keep Alpha integration test data under `D:\DevData` on Windows and use an
  operating-system temporary root on POSIX;
- derive the private test-only `allowed_drive` value from the resolved test
  data root instead of hard-coding `D:`.

The public `create_trial_workspace` path continues to enforce the existing
`D:` requirement. No Alpha execution feature, Runtime role, Docker behavior,
or product capability changes.

## Rejected alternatives

### Move the Python job to Windows

This is a smaller workflow diff, but it breaks the approved two-Linux-job
interface, consumes more hosted-runner capacity, and leaves the existing
portable Git-environment defect unresolved.

### Exclude the four Alpha files

This would make CI green by reducing coverage. It would also hide the real
`SYSTEMROOT` defect and contradict the documented complete `pytest` gate.

### Add a third Windows Alpha job

This adds cost and workflow complexity without proving anything the portable
fixture correction cannot prove. The preview does not need a platform matrix.

## Change boundary

The implementation may touch only:

- `src/tianwen/alpha_workspace.py`;
- `tests/unit/test_alpha_workspace.py`;
- `tests/integration/test_alpha_comparison.py`;
- `tests/integration/test_alpha_trial.py`.

The workflow, public README files, product architecture, dependencies, lock
files, and Alpha public drive restriction remain unchanged. A focused
regression test must prove that removing `SYSTEMROOT` no longer raises and
that the isolated Git environment still disables external configuration.

## Verification

Implementation evidence must include:

1. a focused RED for the missing-`SYSTEMROOT` regression;
2. the four affected Alpha files passing on Windows without Provider calls,
   paid models, Docker execution, or a live Alpha Trial;
3. Ruff, `compileall`, and `git diff --check`;
4. the exact new main SHA running the unchanged Linux `uv run pytest` command;
5. both real GitHub Actions jobs green before Task 6 can close.

Existing local dependency environments and the single disposable checkout
must be reused. No second clone, virtual environment, `node_modules`, or
dependency installation is allowed.

## Stop conditions

Stop and report instead of expanding the change if:

- Linux exposes an Alpha behavior failure beyond the two confirmed platform
  assumptions;
- the public `D:` restriction would need to change;
- Docker, Provider, paid-model, or live Alpha execution becomes necessary;
- more files, a platform matrix, skip rules, or a new test framework appear
  necessary.

Task 7 and Task 8 remain frozen until the exact main SHA has two green CI jobs
and the architecture-supervision conversation explicitly resumes the plan.
