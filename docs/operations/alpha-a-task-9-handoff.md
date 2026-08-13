# Alpha-A Task 9 Handoff

Date: 2026-08-14

## Status

Task 9 is complete, independently reviewed, and ready for controller
acceptance. A4 and A5 are frozen real task packages. Task 10 was not started.

The implementation started from the required remote state:

```text
origin/codex/alpha-a-real-task
2a15763e6bd63e8e25b8645e5cdaa6686f197806
```

Implementation commits:

```text
c3ab5ff21bdabc2752474b5070a832bfb3738e09 test: add preservation and feedback alpha tasks
b3e8fb9b1f94a7f0a449129e37b7f3952d19e3bd test: strengthen task nine proof evidence
4bd5baaa2c4cff4657eef8b1e62ce04bee5a17b1 style: satisfy alpha task verifier lint
```

The final handoff commit and pushed remote SHA are recorded in the structured
controller handoff after the ordinary fast-forward push and `ls-remote`
verification.

## Exact scope

Created only the planned A4/A5 package files:

```text
alpha/tasks/A4/checks/public.py
alpha/tasks/A4/instruction.md
alpha/tasks/A4/reference/solution.patch
alpha/tasks/A4/seed/headers.py
alpha/tasks/A4/task.json
alpha/tasks/A4/verifier/verify.py
alpha/tasks/A5/checks/round_1.py
alpha/tasks/A5/checks/round_2.py
alpha/tasks/A5/feedback/round-2.md
alpha/tasks/A5/instruction.md
alpha/tasks/A5/reference/solution.patch
alpha/tasks/A5/seed/reports.py
alpha/tasks/A5/task.json
alpha/tasks/A5/verifier/verify.py
```

Modified only:

```text
tests/alpha/test_task_packages.py
tests/integration/test_alpha_trial.py
```

The staged author list is exactly:

```python
TASK_IDS = ("A1", "A2", "A3", "A4", "A5")
```

No runtime, dependency, A1-A3 package, newline repair, Task 10, deferred
Minor, paid-model, network, or Docker file was changed.

## A4 behavior-preservation proof

A4 keeps `normalize_header_names(message: str) -> str` and permits writes
only to `headers.py`. Its seed incorrectly lowercases the complete message.

The final verifier separately proves:

- LF and CRLF inputs;
- literal value spaces and case;
- literal body content;
- header-only input;
- blank input;
- malformed non-empty header lines;
- a final line without a newline.

The public check is executed twice against the seed and twice after the
bounded trusted `git apply` of the standard-library reference patch. Raw
stdout is byte-identical within both pairs; the seed pair fails and the
patched pair succeeds. The final verifier also emits one deterministic JSON
object and repeats exactly as `not_met` before the patch and `met` after it.

Frozen A4 authority:

```text
task_bundle_digest:
  sha256:30986bb0cde3b3dd9256480d569bdfbd0f30c888e5950946dcc2f714ee9412cd
model_input_digest:
  sha256:ebbfbc43b5b912632225ff4652e6c8621fa685f6c65d5d6ef1a8b704be2a1311
final_verifier.digest:
  sha256:ea4a063517a126c06ec5cd145654283c83399989eafe7bbb50b195fbf90567a9
```

## A5 two-round author proof

A5 keeps one frozen base instruction and adds only the preregistered
`feedback/round-2.md` in round 2:

```text
round-1 -> check round-1, no feedback
round-2 -> check round-2, feedback digest
sha256:827dd1e619362fe9e09a26658823813e7def6fa7cc9c39ed7407a6c5542f908d
```

The final `reference/solution.patch` is deliberately the round-2/final
Oracle, so it does not satisfy the non-alphabetical first-seen ordering
required by `round_1.py`.

The author proof therefore uses two fresh temporary workspaces:

1. The exact trusted round-1 fixture is written only to the first temporary
   workspace. Two `round_1.py` executions have identical raw stdout and pass;
   two final-verifier executions have identical raw stdout and remain
   `not_met`.
2. A fresh seed receives the bounded final reference patch. The deliberately
   incompatible round-1 check repeats identically and fails; `round_2.py`
   repeats identically and passes; the final verifier repeats identically as
   `met`.

The trusted round-1 fixture exists only in the author test. It is absent from
the task package and model input.

Frozen A5 authority:

```text
task_bundle_digest:
  sha256:eaae3c8166a2563b7857b7bc9761123085c8c51b8b8c5ff1b59cfda3bed0560e
model_input_digest:
  sha256:ff692e49d52e16dc9f8873d63f5ed07316f16303ee092fc25e7e1da4daf2950f
final_verifier.digest:
  sha256:df90965d75e5b492ed955f809a8e5d1aebb292004a0da2a23dc033811955b4d3
```

## A5 trial authority and information isolation

The integration proof uses the real frozen A5 package and captures the
actual `UserPromptPart` JSON for both model requests.

It proves:

- one Goal, workspace, shared root-loop budget, Champion, and TrialManifest;
- two distinct Runs in the frozen order `round-1`, `round-2`;
- round 1 admits only check `round-1`;
- round 2 admits only check `round-2`;
- request 1 contains the exact frozen `instruction.md`;
- request 1 has `feedback=None`;
- the exact round-2 feedback and its derived `casefold` / `(none)` acceptance
  text are absent from round-1 prompt, policy, tool contract, Evidence, and
  error state;
- request 2 contains the exact frozen `feedback/round-2.md`;
- both Runs bind the same Goal digest, workspace digest, Champion version and
  digest, and TrialManifest digest.

The test compares request contents directly to the independent frozen files,
not to a preview-derived expectation.

## Clean committed A1-A5 re-freeze proof

The final proof used an LF-only detached worktree at
`D:\DevData\tianwen-alpha-task9-final`, created with
`git -c core.autocrlf=false worktree add` from the final implementation
commit.

For A1-A5, the state before freezing, after the first
`freeze_task_bundle()`, and after the second call was identical across:

- literal `task.json` bytes and LF-only shape;
- SHA-256;
- `git hash-object --no-filters` blob identity;
- committed Git blob identity;
- `task_bundle_digest`;
- `model_input_digest`.

The worktree remained clean after both freezes.

| Task | Stable file SHA-256 | Stable Git blob | Stable task bundle | Stable model input |
| --- | --- | --- | --- | --- |
| A1 | `69b29a8c4ecc19d4350d91bf5c9151f918de7e96ce679fa1e8da73c1d484eb2c` | `1ff0f936b9d4c22b27012cfb9312a8c46bf70083` | `sha256:15e08373a535c14bb0de636724170afb05cbb2e8ace1f91ca53bc877f73184d0` | `sha256:b8f76aae549aeca56d9a4749aa188788648fc0fae578f422c85cfb6da28eb490` |
| A2 | `2df6d3107308fbea1d8c7650d44a020a5e8e29329efce016ac7760db2164d989` | `2f1eb8871ed7c46b9ec751b03daf10d5c24204b1` | `sha256:461bb90c1de9b45b18c4c956b7c2bbd326d9aa4a6dd7bfaae88a9a83ae0a84f1` | `sha256:39fa759cca124bdb2d612ce3cfe24ce391332152c52560e303d88e72095c049e` |
| A3 | `445b33029b793c238fb4dd97a4e01d9670dd6f2bf0b92802e89897fe70dd42ee` | `7739f4b33817eb5db8d6e9f9a3dfad8d39ae1b8b` | `sha256:7f36109f813d5f0674d91c5498bdb13e1c1b986d2bf45ead99b677b75860c54e` | `sha256:d0828aede8948bcf97b32154ce7cce131edb5dced8425af32cc058831fc5d5de` |
| A4 | `f73392622c7d0981831b6a6abda284e299953e5ac5ceaff4a7ef899050ce03c9` | `4a5ec4632b65342c32b058c95f51738a447ce8d8` | `sha256:30986bb0cde3b3dd9256480d569bdfbd0f30c888e5950946dcc2f714ee9412cd` | `sha256:ebbfbc43b5b912632225ff4652e6c8621fa685f6c65d5d6ef1a8b704be2a1311` |
| A5 | `6396c6ecf3e3c9da704868f7c1eca1beca66cb54ca81c3131c9dfaf997062b44` | `548d0cbc5cdb3ac975b638c0f32e10d24978a0ec` | `sha256:eaae3c8166a2563b7857b7bc9761123085c8c51b8b8c5ff1b59cfda3bed0560e` | `sha256:ff692e49d52e16dc9f8873d63f5ed07316f16303ee092fc25e7e1da4daf2950f` |

## Final verification

All final commands were offline and used:

```text
UV_CACHE_DIR=D:\DevData\uv-cache
UV_OFFLINE=1
TEMP=D:\DevData\tianwen-alpha-task9-temp
TMP=D:\DevData\tianwen-alpha-task9-temp
```

The Python environment was
`D:\DevData\tianwen-alpha-task9-env`; no project `.venv` remained on `C:`.

- Focused A4/A5 package and trial proof:
  `10 passed, 32 deselected`.
- Complete A1-A5 author proof: `10 passed`.
- Related task/runtime/trial tests: `59 passed, 2 skipped`.
- Full offline suite: `424 passed, 4 skipped`.
- Full `ruff check .`: `All checks passed!`.
- `git diff --check 2a15763e...HEAD`: exited `0` with no diagnostics.

The four full-suite skips are the explicit paid live-model probe, two
Windows-account symlink privilege tests, and the Windows ACL test that is
separately gated. No network, paid model, or real Docker Engine was used.

## Independent review

The first complete scoped review found two Important proof gaps:

1. exact request values were compared to preview values rather than the
   independent frozen files;
2. A4's public check lacked two-run raw-stdout proof.

Fix round 1 closed both. The scoped re-review marked both `ADDRESSED`, with no
new Critical or Important findings.

The final full-Ruff gate then exposed seven verifier-only style findings that
the earlier test-file-only Ruff command had not scanned. Fix round 2 changed
only verifier formatting and the corresponding A4/A5 frozen verifier
digests. Its independent scoped re-review marked the finding `ADDRESSED` with
no new breakage.

There are no open Critical, Important, Minor, parked, or deferred Task 9
findings.

## Residual risk and next step

Residual Task 9 risk is low. A4/A5 are small, standard-library-only task
packages, their author and trial boundaries are executable, and the frozen
authority is stable from the first re-freeze onward.

Task 10 is not started. The controller may proceed to Task 10 only after
confirming the final fast-forward push and remote SHA.
