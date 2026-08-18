# Alpha seed evidence lifecycle handoff

Date: 2026-08-19

## Outcome

- Base: `f6694d12d6550bca822ba575203287633720e8d3`.
- Shared fix: `887ffc72c5a4377aef2763f72baa0ca4a78c1f0f`.
- `prepare()` is now the only producer of `seed-preflight` evidence.
- `execute()` revalidation and `resume()` consume that durable evidence with
  `reconcile("seed-preflight")`; missing, wrongly typed, non-`not_met`, or
  mismatched evidence fails closed before a new model request.
- Docker preflight still runs before execution. Only volatile `free_bytes` is
  excluded from frozen identity equality; drift in stable Docker identity is
  still rejected.

## TDD and gates

- Initial lifecycle RED: 10 failures proving execute/resume reran the seed
  verifier or accepted invalid durable evidence.
- Real-Docker follow-up RED: changing only `free_bytes` caused an erroneous
  frozen-authority rejection; a separate regression proves stable Docker
  identity drift remains rejected.
- Focused lifecycle tests: 15 passed, 51 deselected.
- Alpha Docker + Alpha Trial + A1-A5: 125 passed.
- Alpha comparison: 42 passed.
- Full Python: 568 passed, 4 skipped.
- Ruff, `compileall`, and `git diff --check`: passed.
- Independent correctness: C0 / I0 / M0.
- Independent Ponytail/YAGNI: approved; no safely removable production code.

## Free full-lifecycle proof

The final proof used the real `AlphaTrialRunner`, real A1 verifier, real locked
Docker image, and a deterministic local fake model. It completed
prepare -> execute -> final verifier -> durable TrialResult reload.

- Proof: `D:\DevData\tianwen-alpha-seed-evidence-dry-lifecycle-final\dry-lifecycle-proof.json`.
- Proof SHA-256: `707d0d0471b29602d119a356fea58f35b6677f323370c9e11155b7eff862cfd8`.
- Trial: `trial-a68402f9c57fd94a20f154bb2beea273`.
- Result: completed / `not_met`; seed preflight count exactly 1.
- Deterministic fake-model usage: 1 request, 105 simulated tokens.
- External Provider usage and cost: 0 requests, 0 tokens, CNY 0.
- Both temporary proof containers were removed by exact ID and confirmed absent.

The first dry attempt stopped before any model call because volatile free-space
was incorrectly treated as frozen identity. Its exact container was removed;
the stopped root remains as evidence.

## Boundaries and next entrance

- The consumed formal live root
  `D:\DevData\tianwen-alpha-c-live-sample-mainline` and retained container
  `7743e948...` were not changed.
- No recovery, Provider call, paid model, Candidate, Promotion, Shadow, or
  Alpha-D work occurred. Alpha-C's cumulative CNY 20 balance remains CNY 20.
- After this shared fix is merged, the only next live entrance is a fresh branch
  and fresh root from the new main. It must not replay any consumed root or add
  a recovery framework.
