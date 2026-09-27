# Tianwen claim-scope preservation diagnostic plan

1. Freeze eight new one-sentence source/answer pairs, expected atomic spans and modes, both stage instructions, current source commit, runtime package, model and scripts in a new `D:/DevData/tianwen-claim-scope-20260927` directory. Record SHA-256 before calling a model.
2. Reuse the existing DSH native judgment runner in an isolated profile. Stage 1 extracts exact atomic spans without classification; stage 2 independently receives each span with the complete answer and decides stance and source support. Reject structurally invalid results and retain the first result for every call.
3. Audit frozen bytes, native Session and structured-tool records, model identity, source-quote identity, extracted span completeness against prewritten expectations, and the empty learning ledger. Apply the frozen stop condition without retrying failures.
4. Write a result note and update the current handoff. Run document/diff checks and push the existing branch. Do not change production safety or main/Daily.
