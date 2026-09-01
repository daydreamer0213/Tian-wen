# Task 7 Report: Native Long Goal execution plane

## Status

Task 7 is implemented and its focused gates are green on production HEAD
`f64ccaa284437fb6e242d8ecebc3a6dc2ba334ea`.

This report covers Task 7 only. It does not declare Stage 1 complete.

## Acceptance stories

### One normal main Session

The profile E2E starts `/goal` from one ordinary main Session. Tianwen then uses
the public DSH continuable-subagent service for the Planner and Task. The test
never opens, resumes, or sends user input directly to either child.

The main Session receives the native Planner lifecycle settlements and renders
model replies there. Public `listChildren()` calls prove the Planner and Task
are `continuable`, and return no `corrupt` diagnostic. Persisted inspection of
both children proves:

- exact main -> Planner -> Task lineage;
- the public `subagent/descriptor` with provider `spawn`;
- delegated `workspace-write` sandbox policy;
- delegated approval policy `never`.

The real Task Goal completes, the Long Goal reaches `complete`, and the Task
tool executes once in the exact Task Session.

### Permission renewal stays in the main Session

The first Task receives a structured sandbox denial under the main Session's
`workspace-write` policy. The old attempt becomes `permission-limited`, its
Task binding becomes `null`, and the main Session receives the instruction to
change that main Session to Full access.

The test changes only the main Session by appending the normal DSH
`danger-full-access` policy event. Tianwen creates epoch 2 with a new Planner
and Task, whose persisted policies are delegated `danger-full-access` plus
approval `never`. The old attempt remains byte-for-byte unchanged, the new
attempt settles, and the Long Goal completes. The Evolution service reports
zero Learning Signals, so the limited attempt cannot pollute the learning
loop.

No Tianwen approve/reject control, child-navigation instruction, or child-side
permission mutation is introduced.

### Offline parent recovery

The recovery story uses a real JSONL-persisted Task terminal event and a real
main Agent. While the main Agent lookup is offline, settlement remains
unacknowledged and sends nothing. After the same main Session is available,
two delivery calls produce one guarded main Turn and one durable delivery
cursor. The Task execution counter remains unchanged, proving recovery never
reruns the Task.

### Ordinary DSH non-interference

The same ordinary DSH tool round runs once with Tianwen disabled and once with
`@tianwen/runtime` enabled. It supplies no Tianwen-specific input. The two
runs have exactly equal provider/model selection, tool schemas, permission
events, assistant output, and tool execution count. The enabled run records
zero Learning Signals.

### Real stock base/web composition

The portable composition E2E builds and packs the current Runtime and probe
bundles, installs them into a fresh stock DSH `0.1.1-rc.2` host on `D:`, then:

- boots the stock headless Profile and obtains the Tianwen service receipt;
- boots the stock Web Profile, serves loopback HTTP successfully, and obtains
  the same service receipt;
- proves the Runtime Bundle declares exact peer contracts for the stock DSH
  Agent, preset, Goal, sandbox, session-persistence, and subagent services;
- resolves the native subagent implementation supplied by stock DSH Base as
  `0.1.1-rc.2`;
- proves Tianwen mounts once and does not add a dynamic runner to headless.

## TDD evidence

### RED

- The first real profile run stopped before Planner creation because the test
  profile omitted DSH's `agentPresets.composedPreset()` contract. The fixture
  was corrected to model the stock preset composition; production was not
  changed for that failure.
- With the correct native lineage, a real Task terminal event reached Long
  Goal revision 4 but remained in `planning`. The exact production error was
  `session "<task-id>" is not live in this store`. DSH's continuable manager
  disposed the Task Session before Tianwen's post-idle flush. The separate
  production fix `f64ccaa` starts the exact Task/main checkpoints while both
  Sessions are still live, then awaits idle and the checkpoints.
- The non-interference test initially used a full JSON Schema where DSH's
  public tool fixture expects its property-map schema and failed with
  `parameters.type must be a value schema object`. It was corrected to the
  public DSH tool contract.
- The portable test initially tried to resolve the peer subagent directly from
  the installed Profile, then directly from the CLI host. Both are the wrong
  pnpm ownership boundary. It now resolves the native service through the
  stock DSH Base package that owns it.

### GREEN

- `native-long-goal-profile.e2e.spec.ts`: 3 tests passed.
- Task 7 default gate: 3 files passed, 1 portable file skipped by its explicit
  opt-in guard; 12 tests passed and 2 skipped.
- Real portable opt-in gate with
  `TIANWEN_RUN_PORTABLE_COMPOSITION_E2E=1`: 1 file and 2 tests passed. The
  headless case took 46.6 seconds and the Web case 46.0 seconds; total process
  time, including fresh install/build/pack, was 261 seconds.
- Workspace `pnpm run typecheck`: exit 0.
- `git diff --check`: exit 0.

## Static and scope checks

- Task 7 changes only its three authorized test files and this report.
- No changed test imports a private DSH `/lib` or `/src` path.
- No custom approval/rejection UI, second scheduler/provider, or production
  child factory was added.
- Large generated installation and cache data remained on `D:`.

## Remaining risk

The model-driven profile stories use real DSH AgentLoop, Goal, JSONL,
continuable-subagent, delegated-policy, public child catalog, and Tianwen Host
services with a deterministic adapter. Stock CLI headless/Web boot is proven
separately by the portable E2E so the tests remain deterministic and do not
require network model credentials.

The offline story intentionally begins from an already durable terminal Task
to isolate parent recovery. The online profile story independently proves the
Task actually executes and settles through the native child plane.
