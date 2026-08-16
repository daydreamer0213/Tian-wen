# Task 1 — Tianwen model configuration report

## RED

- The first focused command was:

  pnpm exec vitest run tests/dsh-migration/model-configuration.spec.ts

- Initial collection was blocked by the worktree dependency state:
  @tianwen/evidence/projector was not resolvable. An offline frozen install
  completed without downloads, but the package still had no usable built
  workspace closure. The focused test therefore mocks the unrelated status
  module and the Task 2 credential package so Task 1 behavior can run in
  isolation.
- The valid focused RED then ran 16 tests and failed 2 tests. After correcting
  the Windows pnpm-installed DSH path assertion, the remaining failure was:
  offline status called llm.listModels('deepseek-official'). This violated the
  frozen contract that the fixed offline selection requires no catalog lookup.

## GREEN

Command:

pnpm exec vitest run tests/dsh-migration/model-configuration.spec.ts

Result: 1 test file passed, 16 tests passed, 0 failed.

The focused cases cover usage errors and no state creation, status/use launch,
fixed shell-free invocation, all three mappings, read-only status, catalog
validation before DeepSeek save, offline no-discovery behavior, credential
fact copying without values, zero model requests, and appExit receipt output.

## Implementation

- Added the fixed ModelChoice mapping, absolute data-dir preflight, installed
  DSH resolver launch, inherited environment, packaged patch path, and
  shell: false/inherited stdio invocation.
- Extended cli.ts with exactly model status and model use grammar while
  preserving existing command branches.
- Added the public-service runner using only agentDefaultModel, llm, and
  credentials; DeepSeek choices are catalog-checked before saveSelection.
- Added the model-only patch disabling headless startup, headless runner, and
  goal round driving, then inserting the Tianwen runner.
- Added the offline status fixed catalog branch so it performs no provider
  discovery.

## Self-review

- Receipt schema is tianwen.model-config.v1 and always has
  modelRequestsDelta: 0.
- The credential path uses only credentialRef('DEEPSEEK_API_KEY') and
  describe; no credential value is read, printed, or placed in a receipt.
- No Agent, Session, Goal, Evidence, Evolution, Champion, package manifest,
  or E2E change was introduced.
- git diff --check passed.
- The runtime-bundle typecheck remains blocked by pre-existing Task 2 package
  surface/workspace artifacts: missing @deepseek-ai/dsh-credentials,
  @tianwen/runtime declarations, and @tianwen/dsh-compat declarations.
  Task 2 explicitly owns the package dependency/export/build changes.
- Only the five requested owned files are included in the commit.
