# Tianwen Goal-First Desktop UX Handoff

Date: 2026-08-30

## Result

This stage is `task-passed`. The current product already owned Goal-first
planning, Task derivation, per-Task DSH Sessions, and durable guidance. This
stage did not rebuild that architecture. It corrected the ordinary Desktop/Web
presentation so users see a long-term Goal rather than an authored Task plan.

The default create view still contains only Goal, optional context, and optional
success criteria. It contains no Task authoring or round-limit control. The v2
detail now separates authoritative projection facts into:

- current work;
- completed work;
- planned next steps; and
- abandoned work, which is not counted as completed.

The primary action follows the actual transition that the existing service will
perform: continue planning, start the next step, or continue current work.
Blocked and complete Goals do not show a disabled progress action. Blocked work
retains the explicit existing-session and abandon/replan recovery paths.

The Chinese entry is now `长期目标`, not `长期任务`. Legacy v1 Goals and their
execution path remain supported and unchanged.

## Verification

- The compiled DSH client suite passed 13/13 tests, including the three-field
  create view, current/completed/next/abandoned grouping, replanning after a
  settled Task, blocked recovery, locale switching, Session navigation,
  revision conflicts, and v1 compatibility.
- The Runtime Bundle completed its fresh build and TypeScript project build.
- An independent review approved the final projection grouping and action
  semantics with no blocker or important finding.
- A fresh Windows Desktop installer passed the unpacked and installed artifact
  audits.
- The tested `dist/client.js` and the same file extracted from the installed
  Runtime tarball had the identical SHA-256
  `D7AC77D267F8CAC06BF9D3C802795A245644AC624FBA38121CFB713E466F0CF6`.
- The fresh installer SHA-256 was
  `A96BA30EC700AC1D6B131AA18D24FD5D9AAB06C9D07918D1C3B9016B025ADEA9`.

No Provider request, natural task, controlled Activity, Evolution record, or
external DSH change was created. This was a product UI and delivery proof, not
new learning evidence.

## Product boundary

One explicit user operation still advances at most one planning/admission step.
That boundary is intentional: a recoverable planning result stays visible and
is not hidden behind automatic retries or a second scheduler. The UI now names
the next operation precisely instead of exposing internal Task management.

Tianwen Desktop remains a thin host for the same DSH Web Runtime plugin. A user
who installs Tianwen into a compatible ordinary DSH CLI/Web Profile receives
the same Goal-first interface and behavior; Desktop is not required.
