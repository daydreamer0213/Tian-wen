# Controlled evaluation arm lifecycle implementation plan

1. Add focused RED tests in `controlled-skill-evaluation-runtime.spec.ts` for candidate create, bind,
   dispose, and workspace failures. Assert distinct reasons and no later durable activity.
2. Refactor only `runControlledArms()` in `skill-evaluation.ts` into explicit create/validate/bind/
   execute/dispose boundaries. Preserve existing success and execution behavior.
3. Add runner RED/GREEN coverage in `controlled-real-skill-lifecycle-runner.spec.ts` and extend the
   controlled lifecycle receipt reason union only for the finite evaluation phases.
4. Run focused specs, Runtime Bundle build, typecheck, no-private-imports, and diff checks.
5. Review correctness, lifecycle ownership, and minimality. Commit the implementation, integrate by a
   normal merge, and require the automatic exact-main push attempt to pass all three jobs.
6. Only after that CI gate, create a fresh installed product/activity and run the existing formal
   five-command sequence exactly once. Use the preserved phase reason to decide the next functional
   correction. Do not rerun Activity-09.
