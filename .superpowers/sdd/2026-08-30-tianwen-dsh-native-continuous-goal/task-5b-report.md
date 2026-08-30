# Tianwen Task 5B report

## Release boundary

- Runtime identity is `@tianwen/runtime-bundle@0.1.4`.
- Desktop identity is `0.1.0-preview.5` and embeds only the exact Runtime
  `0.1.4` archive.
- Exact DSH remains `0.1.1-rc.2`. Runtime `0.1.3` is the sole same-DSH
  automatic predecessor; the existing rc.7 managed-predecessor path remains.
- Runtime and Goal-first runner input allowlists add only
  `continuous-goal-agent.ts`, `continuous-goal-service.ts`, and
  `continuous-goal-host.ts`. Package output files and Desktop resource shapes
  are unchanged.

## RED/GREEN

- RED: six focused assertions failed before implementation: three new Runtime
  inputs were rejected, the Runtime manifest remained `0.1.3`, Desktop remained
  `preview.4`, and the installer still derived the `0.1.3` archive.
- GREEN: the same six assertions pass after the minimal metadata, predecessor,
  and allowlist updates.
- The full focused release run then exposed two stale/environmental boundaries:
  the Runtime external seam omitted Task 3's public
  `@deepseek-ai/dsh-commands@0.1.1-rc.2`, and the isolated offline Profile store
  lacked `@deepseek-ai/schemastery@3.18.2`. The exact external list was updated;
  the missing tarball was prefetched into the existing isolated D-drive test
  store. Both previously failing tests pass individually.

## Documentation

- README usage now starts continuous work from an ordinary DSH Web/Desktop
  conversation with `/goal <objective>`, keeps Task execution in separate DSH
  Sessions, and documents natural guidance, native stop, and `/goal resume`.
- The architecture overview records v3 control state, Task-boundary progress,
  result-aware replanning, natural control, and the absence of a second UI,
  custom progress Session event, scheduler, poller, retry queue, or Tianwen-side
  Provider budget.
- Installed-product and real-Provider proof remains Task 6 work and is not
  claimed by this release-metadata task.

## Verification

- Release-identity RED/GREEN selection: 6 passed after implementation.
- Planned focused release run: 264 passed, 2 failed, 13 skipped before the two
  focused corrections above.
- Previously failing Runtime public-seam test: 1 passed.
- Previously failing default Profile installation test: 1 passed.
- `npm.cmd --prefix packages\tianwen-runtime-bundle run build` — passed.
- `npm.cmd --prefix packages\tianwen-desktop-host run build` — passed.
- Runtime and Desktop package-local typechecks — passed.
- `git diff --check` — passed before staging.
- No Provider or model request was made.

## Environment note

The dependency-prime directory
`D:\DevData\tianwen-test-fixtures\runtime-profile\dependency-prefetch-prime`
was retained because host policy rejected a command containing recursive
cleanup before it executed. It is test-only and can be included in the later
approved D-drive cleanup inventory.
