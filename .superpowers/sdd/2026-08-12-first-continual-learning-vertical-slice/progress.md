# SDD ledger — plan: docs/superpowers/plans/2026-08-12-first-continual-learning-vertical-slice.md
Branch base: 984f5a3835b348dd4e86056cd38bb35cb8095ff1
Branch: codex/first-continual-learning-slice
Baseline: uv run pytest -q — 10 passed
Plan pre-flight: clean; prior independent plan review returned READY
Task 1: complete (commits 984f5a3..79ae8d4, review clean)
Task 2: fix round 1/5 (0 addressed pending re-review, 2 open — child-budget bypass; immutable authority overwrite; commits 27eab3b..4c5a010)
Task 2: fix round 1/5 (2 addressed, 1 open — frozen Run parent_id remains mutable; commits 27eab3b..4c5a010)
Task 2: fix round 2/5 (1 addressed, 0 open — commits 4c5a010..401e33d)
Task 2: complete (commits 79ae8d4..401e33d, review clean)
Task 3: needs Task 2 interface correction — persisted Action reload and lifecycle-insensitive exact replay
Task 2: fix round 3/5 (cross-task interface corrected, 0 open — commits 401e33d..9d52880)
Task 2: complete after Task 3 preflight (commits 79ae8d4..9d52880, review clean)
Task 3: review open — direct ASK cannot resume; fresh PROPOSED can be approved; wrap recomputes policy context; approval/replay regressions missing
Task 3: minor (deferred): non-JSON result fallback may produce unstable repr digest
Task 3: minor (deferred): timeout and capability exception/cancellation coverage could be broader
Task 3: fix round 1/5 (4 addressed, 0 open — commits 819455f..67a4bf3)
Task 3: complete (commits 9d52880..67a4bf3, review clean)
Task 4: plan dependency correction — Harness Skill id is `repo-task`; Tian-wen directory/manifest/artifact keys remain `repo_task`
Task 4: review open — fixed policy not digest-bound; KnownModelName string rejected; Shell has no workspace argument guard; user denial stays unresolved; recovery test effect is disconnected
Task 4: minor (deferred): recover flattens WAITING_APPROVAL/APPROVED/UNKNOWN into one reason
Task 4: minor (deferred): five-second lease is not renewed during long calls; acceptable only under first-version serial scheduler
Task 4: minor (deferred): first runtime test should assert Tian-wen SUCCEEDED action directly
Task 4: fix round 1/5 (5 addressed, 1 open — Windows rooted/drive-relative shell path forms; commits 4116d6b..5e24492)
Task 4: fix round 2/5 (1 addressed, 0 open — commits 5e24492..4a9786d)
Task 4: complete (commits 67a4bf3..4a9786d, review clean)
Task 5: review open — persisted evidence validation; fetch completion ordering/replay; zero-token stop; Goal+workspace evidence scope; pre-read size/secret filtering; stop-cause validation; required governance tests
Task 5: minor (deferred): remove unused FetchedSource/ExplorationOutcome only if interfaces no longer require them
Task 5: minor (deferred): rename placeholder `_` Action variable for readability
Task 5: fix round 1a — canonical Action identity helper committed (697e362); remaining exploration findings split into bounded sequential patches
Task 5: fix round 1b review (5 addressed, 1 open - persisted zero-token state checked inside handler; concurrent post-fetch race follows the plan-mandated no-admission behavior; commit 814610c)
Task 5: fix round 1c review clean (zero-balance pre-handler gate + full-token exact replay; commit 5934793; concurrent post-fetch race adjudicated against brief line 243)
Task 5: process note - ignored Fix round 1c report text did not propagate after interrupted subagent; commit, focused tests, and independent re-review are authoritative
Task 5: fix round 1d review (3 addressed, 1 open - NO_NEW_EVIDENCE self-certifies its cause; commit 97f1e16)
Task 5: reviewer finding rejected - ExplorationReport governed strings are plan-defined fields; only raw source bodies/tool trajectories are forbidden, while exploration_finished Event remains ID/reason-only
Task 5: fix round 1e review clean (NO_NEW_EVIDENCE real operation cause; commit 1cf46b0)
Task 5: fix round 1f review (5 addressed, 1 open - inventory test calls private runtime._agent; commit acee3e1)
Task 5: reviewer finding rejected - format_untrusted_evidence domain validation means Pydantic domain object cross-validation; URL/domain authorization belongs to fetch/redirect boundary and is not duplicated in the data formatter
Task 5: fix round 1f/1g review clean (local pre-read, redirect isolation, untrusted envelope, cross-goal auth, public runtime inventory; commits acee3e1..73ba8e6)
Task 5: fix round 2 review finding (high) - source provenance overwrite: raw-URL source_id not normalized and SourceRecord carries run/action, so a second Run overwrites the first Run's Source/Evidence via put_object, breaking old Evidence finish; same flaw in local/Git _persist_local
Task 5: fix round 2 complete - normalized HTTPS URL (scheme/host lowercase, drop default 443, empty path -> /), normalized URL used for action identity/fetch/locator/source hashing, persisted source_id includes action_id (external + local/Git), Evidence ID stably derived from source_id; RED 4 failed -> GREEN focused 6 passed + Task5 suite 82 passed + ruff clean + diff check clean; commit ed6884c
Task 5: complete (commits 4a9786d..ed6884c; full review found provenance overwrite, fix round 2 independently re-reviewed clean; Task5 suite 82 passed)
Task 6: implementation complete (governed Action evidence projection, SQLite/FTS5 memory firewall and provenance deletion, conditional capability observations; RED missing-module evidence -> GREEN 43 focused passed, full suite 122 passed; commit pending)
Task 6: fix round 1 complete (17 expected RED failures -> 38 focused, 64 Task6 specified, 143 full suite GREEN; shared credential detector, hardened direct save, post-governance result cap; commit pending)
Task 6: fix round 2 complete (12 expected RED failures -> 45 memory, 77 Task6 specified, 156 full tests GREEN; ruff and diff check clean; commit pending)
Task 6: complete (commits 13ce49f..8c496c9; two fix rounds independently re-reviewed clean; full suite 156 passed)
Task 7: implementation complete (governed finite learning tickets with atomic child loop/task/budget creation, immutable recommendation-only attribution and repo_task_skill candidates; RED missing-module -> GREEN focused 20 passed, full suite 157 passed; ruff and diff check clean; commit pending)
