# Tianwen Ordinary Resume Persistence Natural-Task Plan

**Goal:** Run one official installed Tianwen task with configured DeepSeek to
fix the ordinary Goal resume path that can report success after final Session
persistence has failed.

**Product boundary:** This is a small Runtime Bundle state-transition fix.  It
does not change Natural Run learning, DSH, Profile boot, dependencies,
installer behavior, receipt schemas, or external publication.

## Frozen authority and roots

- Main at design start: `8567494f9d65ed9ff9a7b634434ddba6c27efb8f`.
- Exact design/plan commit: record it in the frozen evidence package before
  creating the Agent worktree.
- Stage root: `D:\DevData\tianwen-ordinary-resume-persistence-natural`.
- Agent worktree: `<stage>\tianwen-workspace`.
- Official product: `<stage>\product`.
- Evidence package: `<stage>\evidence`.
- Agent branch: `codex/tianwen-ordinary-resume-persistence-agent`.
- Use one fresh official install, Goal, Session, Run, and ordinary Agent Turn.
- No retry or substitute Goal is allowed for this task.
- A passing result may not merge into `main` while the prior exact-main CI is
  still pending.

## Task 1: Freeze the natural-task package

1. Require the stage root and Agent branch to be absent, then create the Agent
   worktree from the exact committed design/plan SHA.
2. Keep dependency stores and generated data on `D:`.  Establish a clean
   TypeScript/Python baseline with the documented DSH probe root and controlled
   Python path.
3. Publish the same generic `tianwen-project-owner` Skill used for bounded
   repository work.  It must contain no implementation suggestion.
4. Freeze this Agent-visible brief:

   ```text
   Ordinary `tianwen resume` can run and settle a durable Goal, then return a
   successful `tianwen.goal-resume.v1` receipt even when the final DSH Session
   persistence explicitly returns false or rejects. Fix this product-state
   error so the command reports one deterministic non-zero, safe failure and
   never prints a success receipt when the settled result cannot be confirmed
   durable.

   The Goal may already have executed in memory, so do not claim it never ran,
   roll back its events, retry the Goal, retry persistence, or send an extra
   model request to manufacture success. Always release the resumed Agent
   handle. Preserve the existing successful receipt/counts/exit behavior and
   the existing Natural Run and live-smoke paths. Add focused regression
   coverage in tests/dsh-migration/goal-resume.spec.ts. Do not change DSH,
   dependencies, lockfiles, Profile, installer, receipt schemas, or learning
   semantics. The controller will run all tests independently after this one
   Agent turn.

   First load tianwen-project-owner with the skill tool. After the final
   mutation, call read exactly once with
   file_path=packages/tianwen-runtime-bundle/src/resume-runner.ts, offset=1,
   and limit=2000. Then settle the Goal normally.
   ```

5. Freeze a natural manifest bound to that final `read`, with task ref
   `task:ordinary-resume-persistence`, scope
   `project:tianwen/capability:ordinary-resume-persistence`, and
   `gapDisposition=observe`.  The in-Session read closes the natural Run; it
   does not decide controller acceptance.
6. Freeze these serial controller commands:

   ```powershell
   pnpm exec vitest run tests/dsh-migration/goal-resume.spec.ts
   pnpm exec vitest run tests/dsh-migration/goal-create.spec.ts tests/dsh-migration/goal-live-smoke.spec.ts tests/dsh-probe/natural-run-evidence-runtime.spec.ts
   pnpm run check:dsh-install
   pnpm run check:no-private-dsh-imports
   pnpm run typecheck
   pnpm exec vitest run
   uv run ruff check .
   uv run pytest
   git diff --check
   ```

## Task 2: Prepare the official installed product

1. Run the repository's official installer once into the fresh product root;
   require `status=ready` and DSH `0.1.0-rc.7`.
2. Copy the frozen Skill into the installed product and verify byte equality.
3. Confirm installed configuration and required ordinary edit/read/Skill tool
   surface without a model request.
4. Confirm the product is offline, then create one multiline Goal through the
   official PowerShell launcher.  Require no Turn and zero model requests.
5. Write the frozen Goal-bound manifest, record all package hashes, switch to
   configured `deepseek-v4-pro` once, and confirm status.
6. Recheck clean Git state, exact SHA, immutable package hashes, and zero prior
   Turns immediately before execution.

## Task 3: Run exactly one natural development task

1. Invoke official installed `resume --trial-manifest ... --json` exactly once
   from the Agent worktree.  Preserve stdout, stderr, exit, elapsed time, Goal,
   Session, Run, tool/model/token receipt fields, and changed files.
2. Restore the product to offline exactly once immediately after the command,
   then check status once.  Do not inspect or edit the worktree before the Turn
   settles and offline restoration completes.
3. Treat product `learningDecision` and controller task acceptance as separate
   facts.  Do not infer Provider billing from Session counters.
4. If the diff is empty or out of scope, record `task-incomplete` and preserve
   it without a replacement run.

## Task 4: Controller acceptance

1. Review the exact diff before running tests.  Require both `false` and
   rejection coverage, one fixed safe external failure, no success receipt,
   no retry, handle disposal, and unchanged success/Natural Run/live-smoke
   behavior.
2. Run the frozen commands serially without editing between failures.  A
   single transient-looking timeout may be repeated only as a diagnostic; the
   original result remains part of the verdict and is never erased.
3. Use independent read-only review for correctness and simplicity.  Any
   reachable product-semantic defect makes the result `task-incomplete`; minor
   wording/style issues do not.
4. For a passing source diff, run the official installer again into a second
   fresh post-edit product root and confirm the installed Profile/configuration
   boots normally.  This proves the changed Runtime Bundle is publishable; the
   fault-injection test remains the acceptance proof for persistence failure.
5. Commit only an exact Agent-authored diff that passes every frozen gate and
   review.  Do not push.

## Task 5: Report and integrate when allowed

1. Write an operation handoff separating task result, natural runtime facts,
   learning facts, and external facts.
2. Preserve any failed run and its Agent diff unchanged; do not rerun to choose
   a better answer.
3. If the feature passes but the prior exact-main CI is still pending, retain
   the local branch and continue only work that does not require integration.
4. After the prior exact-main gate is green, perform a controlled merge, run
   local exact-main gates, push Tianwen main once, and require CI whose head SHA
   equals the merge SHA.  DSH upstream publication remains out of scope.
