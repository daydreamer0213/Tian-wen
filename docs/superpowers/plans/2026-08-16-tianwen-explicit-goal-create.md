# Tianwen Explicit Goal Create Implementation Plan

> Execute with current-turn subagent development, TDD, independent review,
> ponytail scope and low-load serial final gates.

**Goal:** Ship and prove the installed user command
`tianwen create --objective TEXT --data-dir ABSOLUTE_PATH [--max-rounds N]`.
It must create one durable top-level Goal and Session with zero model requests,
then compose with the existing list/status/resume commands.

**Base:** `95701d5838ee0a062f579788c8701326f0e5ef37`
(`codex/tianwen-installer`).

**Target branch:** `codex/tianwen-goal-create`

## Fixed design

- `create` and `resume` remain separate explicit user actions.
- `--max-rounds` defaults to 3; supplied values must be positive safe integers.
- Reuse the exact installed DSH host resolver and Profile launcher seam.
- Add one packaged create runner and one fixed patch.
- Disable the Goal round driver for create so model requests stay at 0.
- Use public DSH Agent/Goal/Session services and JSONL persistence.
- Do not add a CLI framework, generic task API, daemon, queue, database or UI.

## Task 1: Freeze CLI and runner behavior

**Files:**

- Create `packages/tianwen-runtime-bundle/src/create.ts`.
- Create `packages/tianwen-runtime-bundle/src/create-runner.ts`.
- Create `packages/tianwen-runtime-bundle/create.patch.yml`.
- Modify `packages/tianwen-runtime-bundle/src/cli.ts`.
- Create `tests/dsh-migration/goal-create.spec.ts`.

### Step 1: Obtain valid RED

Write focused tests for exact CLI grammar, default/explicit budgets, empty and
invalid inputs, missing installed DSH, fixed launcher argv/env and zero writes
before launch. RED must be missing create exports/branch, not dependency setup.

### Step 2: Implement the public create runner

Test and implement one runner that creates a normal Agent with the Profile's
current model selection, creates one Goal, flushes Session persistence, verifies
request delta 0, returns `tianwen.goal-create.v1`, and disposes the handle. The
fixed patch binds Session/Evolution roots, disables ordinary headless rows and
the Goal round driver, and inserts only this runner.

### Step 3: Prove recovery and composition

In a fresh Context, recover the new Session/Goal as disarmed with no model
request. Prove the existing list/status projections discover exact authority.
Keep Session/Evolution bytes unchanged on all preflight/usage failures.

## Task 2: Package and installed acceptance

**Files:**

- Modify `packages/tianwen-runtime-bundle/package.json`.
- Modify package build/metafile/packlist tests as narrowly required.
- Modify `tests/dsh-migration/tianwen-startup.e2e.spec.ts`.

### Step 1: Package only the required surface

Build and publish `./create-runner`, `dist/create-runner.js` and
`create.patch.yml`. Extend the CLI bundle allowlist only for `src/create.ts`;
do not expose another workspace package or executable.

### Step 2: Replace the private resume fixture in installed E2E

Use the installed `tianwen create --max-rounds 1 --json` command to create the
Goal that the existing E2E later resumes. Prove:

- create adds one durable Goal/Session and zero model steps;
- installed list/status find it;
- installed resume runs it through the existing fixed offline adapter;
- the second resume still fails without new state;
- Champion/Evolution remain unchanged.

## Task 3: Review, gates and handoff

1. focused create tests;
2. Runtime Bundle build and package tests;
3. closure/private-import/typecheck;
4. serial default Node suite;
5. one installed Profile E2E using the already installed repeatable Profile;
6. Windows local sandbox gate;
7. Python A1-A5 author proof;
8. foreground full pytest;
9. Ruff and base-to-HEAD diff check;
10. independent scoped and whole-phase reviews with zero open Critical and
    Important;
11. canonical handoff, normal GitHub push and docs-only master-memory update.

Run expensive gates serially. No paid model, live web/search, dependency
download, real Docker, automatic resume, UI, daemon, scheduler, database,
automatic promotion or Runtime cutover belongs in this phase.
