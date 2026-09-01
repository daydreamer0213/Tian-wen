# Task 5 gate hardening

## RED

Added the required `scope-shadowing` fixture to `tests/dsh-probe/dsh-public-reuse-surface.spec.ts`:

```ts
const packageName = 'safe-package'
function load(packageName: string) {
  return import(`@deepseek-ai/${packageName}/src/private.js`)
}
void load('dsh-subagent')
```

Before the utility change, the exact target command failed as intended:

```text
FAIL tests/dsh-probe/dsh-public-reuse-surface.spec.ts
AssertionError: scope-shadowing: expected [] to not deeply equal []
Test Files  1 failed (1)
Tests  1 failed | 2 passed (3)
```

This demonstrated the real false negative: the flat constant table resolved the function parameter `packageName` to the outer `safe-package` constant and did not enter the conservative dynamic-import rule.

## GREEN

The smallest in-file fix threads a set of lexically closer bindings through module-pattern resolution. It collects function parameters, block bindings, loop initializers, catch bindings, and direct function/class declarations from AST parent scopes. A shadowed identifier resolves to `<dynamic>`, so the existing fail-closed check reports any unresolved loader expression when the source references `dsh-subagent`.

No production code, dependency, compatibility file, or other test was changed.

## Verification

1. `pnpm exec vitest run tests/dsh-probe/dsh-public-reuse-surface.spec.ts`
   - PASS; 1 file, 3 tests.
2. `pnpm exec vitest run tests/dsh-migration/permission-attempt.spec.ts tests/dsh-migration/continuous-goal-host.spec.ts tests/dsh-probe/native-continuable-subagent.spec.ts`
   - PASS; 3 files, 67 tests.
3. `git diff --check`
   - PASS; no whitespace errors.

## Self-review

- Existing const, let, function-parameter forwarding, combined dynamic, static private, and dynamic private fixtures remain rejected.
- Ordinary non-loader template strings remain free of false positives because inspection is still limited to module-loader expressions.
- Runtime public consumers continue to pass, and `long-goal-subagent.ts` remains absent.
- No new dependency or general data-flow engine was introduced.

Concern: the existing source-wide `dsh-subagent` fallback remains intentionally conservative for unresolved loader expressions and may report unrelated text only when it appears in a loader source file.

## Gate-hardening fix round 1

### RED

Added the `case-block-shadowing` fixture:

```ts
const packageName = 'safe-package'
switch (0) {
  case 0:
    let packageName = 'dsh-subagent'
    import(`@deepseek-ai/${packageName}/src/private.js`)
}
```

Before the fix, the target command failed as intended:

```text
AssertionError: case-block-shadowing: expected [] to not deeply equal []
Test Files  1 failed (1)
Tests  1 failed | 2 passed (3)
```

### GREEN

Reused the existing statement-binding collection for `CaseBlock` clauses. `scopeShadowed` now collects lexical declarations from every clause statement in the switch's shared case scope, so the inner `let packageName` prevents resolution to the outer flat constant and enters the existing conservative dynamic rule.

### Round-1 verification and self-review

- Target probe: PASS; 1 file, 3 tests.
- Runtime consumer regression set: PASS; 3 files, 67 tests.
- `git diff --check`: PASS; no whitespace errors.
- All prior fixtures remain in place; the change is limited to the owned test utility and report.

Round-1 concern: `CaseBlock` handling intentionally covers direct clause statements only; nested scopes continue to be resolved through their own AST parents rather than a general data-flow engine.
