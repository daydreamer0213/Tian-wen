# Tianwen v0.1.0 Research Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Tianwen into a safe, reproducible public research preview and prepare an accurate Codex for Open Source application packet.

**Architecture:** DSH remains the only product Agent Runtime. The release adds a deterministic zero-cost demo of a normal DSH run followed by read-only Tianwen Evidence projection; because the demo contains neither repeated attributable failure nor explicit user correction, it ends with no learning Case. Alpha remains an experiment/evaluation asset, not a second Runtime.

**Tech Stack:** TypeScript 6, Node.js 22, pnpm 11, Vitest 4, Python 3.12, uv, pytest, Ruff, GitHub Actions, Gitleaks 8.30.1, GitHub CLI.

## Global Constraints

- Work only in D:\DevData\tianwen-worktrees\tianwen-oss-application-prep on codex/tianwen-oss-application-prep until final integration.
- Do not touch or run the dirty legacy Alpha checkout at `<legacy-alpha-worktree>` on codex/tianwen-agent-execution-foundation.
- Use the user-approved Apache-2.0 license.
- Keep Python/Node package versions at 0.0.0 and root package.json private=true; the tag is a repository research preview, not a package release.
- No Provider, paid model, API key, Docker, user data, Trial root, receipt, or local database in the public demo or CI.
- Do not revive Alpha-D, a second Python Runtime, current-run hot swap, Candidate generation, Shadow, or Promotion for this release.
- Upgrade all product DSH dependencies to exact `0.1.0-rc.7` before building the preview. The completed probe at `7331d20ec1336ef46a21f4eca9eedb80b740f070` is compatibility evidence, not code to merge wholesale.
- Reuse rc.7 Session Query, Skill, Jobs, Workflow, Message Feedback, Approval, and permission seams where their responsibilities match. Do not rebuild them in Tianwen; do not force them into the preview demo when the demo does not need them.
- The intermittently hanging product `runtime-profile` subprocess test is a documented, non-blocking diagnostic. Do not call it passing and do not fix, retry-loop, or enlarge the release around it. The rc.7 upgrade instead requires the already-proven native headless/Profile check and the stable product execution/governance gates below.
- Store scanner binaries, reports, caches, and temporary audit data under D:\DevData, never in Git.
- If a real credential is found, revoke or rotate first and obtain explicit permission before rewriting history.
- Use ordinary commits/pushes and a final --no-ff merge; never rebase, squash, or force-push.
- Visibility change and application submission are separate final external actions.

---

### Task 1: Public-safety baseline and Apache-2.0 license

**Files:**
- Create: LICENSE
- Modify: docs/research/2026-08-19-tianwen-public-readiness-audit.md
- Modify the eleven Markdown files returned by the approved absolute-path audit.

**Interfaces:**
- Consumes: every Git ref, current tree, official Gitleaks 8.30.1 release, Apache-2.0 decision.
- Produces: redacted scan reports outside Git, classified findings, root license, neutral current-tree paths.

- [ ] **Step 1: Install and verify Gitleaks under D:**

Download the Windows x64 v8.30.1 archive and official checksum list into D:\DevData\tools\gitleaks\8.30.1. Verify the archive SHA-256 before extracting gitleaks.exe.

Expected:

    gitleaks version 8.30.1
    archive hash equals its official checksums entry

- [ ] **Step 2: Scan all refs and the current tree**

Run from the isolated worktree:

    $auditRoot = 'D:\DevData\tianwen-public-audit'
    New-Item -ItemType Directory -Force -Path $auditRoot | Out-Null
    & 'D:\DevData\tools\gitleaks\8.30.1\gitleaks.exe' git --no-banner --redact=100 --report-format json --report-path "$auditRoot\gitleaks-all-refs.json" --log-opts='--all' .
    & 'D:\DevData\tools\gitleaks\8.30.1\gitleaks.exe' dir --no-banner --redact=100 --report-format json --report-path "$auditRoot\gitleaks-current-tree.json" .

Exit 0 means no findings. Exit 1 means classify each finding by rule, ref/commit, path, reality, and remediation state without copying the suspected value into a report or chat.

- [ ] **Step 3: Apply the finding decision rule**

    active real credential -> revoke/rotate, inspect provider use, stop publication
    revoked credential -> record revocation evidence; rewrite only if materially useful and explicitly approved
    test fixture -> prove it cannot authenticate; retain unless it harms comprehension
    visible synthetic placeholder -> retain as a clearly fake example

- [ ] **Step 4: Add the canonical Apache License 2.0 text**

Create LICENSE from https://www.apache.org/licenses/LICENSE-2.0.txt without custom restrictions or dual-license wording.

- [ ] **Step 5: Neutralize personal paths in the current tree**

Replace personal repository/profile absolute-path examples with `<repo>`, `<worktree>`, or a neutral `D:\DevData` example while preserving historical SHAs and outcomes.

Verify:

    rg -n 'D:\\Guo\\zuochong\\AGi|C:\\Users\\Administrator' README*.md docs

Expected: no current-tree matches.

- [ ] **Step 6: Update and commit the audit**

Record scanner version, commands, ref count, finding counts by classification, license decision, and reviewed commit. Say “no unresolved real credential was found by the completed scans,” not “secrets cannot exist.”

    git diff --check
    git add LICENSE docs
    git commit -m "docs: establish public safety and license baseline"

---

### Task 2: Upgrade the product baseline to exact DSH rc.7

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `packages/tianwen-dsh-compat/package.json`
- Modify: `packages/tianwen-dsh-compat/src/index.ts`
- Modify: `packages/tianwen-dsh-compat/src/runtime.ts`
- Modify: `packages/tianwen-dsh-host/package.json`
- Modify: `packages/tianwen-dsh-probe-bundle/package.json`
- Modify: `packages/tianwen-profile-host/package.json`
- Modify: `packages/tianwen-runtime-bundle/package.json`
- Modify: `packages/tianwen-runtime-bundle/src/resume.ts`
- Modify: `packages/tianwen-runtime/src/index.ts`
- Modify: `scripts/check-dsh-install.mjs`
- Modify: `scripts/install-tianwen.mjs`
- Modify: `scripts/verify-dsh-profile.mjs`
- Modify: the existing version-contract assertions under `tests/dsh-probe` and `tests/dsh-migration`
- Create: `tests/dsh-probe/rc7-reuse-surface.spec.ts`
- Modify: `docs/tianwen-architecture-overview-v2.md`

**Interfaces:**
- Consumes: the exact rc.7 npm release and the independently verified probe at `codex/tianwen-dsh-rc7-compatibility-probe@7331d20`.
- Produces: one exact rc.7 product dependency closure, unchanged Tianwen execution semantics, and a small regression proving that reusable rc.7 services are reachable through public package roots.

- [ ] **Step 1: Write RED version and reuse-surface contracts**

Change the existing exact-version assertions from rc.6 to rc.7 before changing manifests. Add `tests/dsh-probe/rc7-reuse-surface.spec.ts` with two deterministic public-import contracts adapted from the reviewed probe:

    import { describe, expect, it } from 'vitest'
    import LocalJobRegistry from '@deepseek-ai/dsh-jobs-local'
    import MessageFeedbackService from '@deepseek-ai/dsh-message-feedback'
    import SqliteSessionQueryEngine from '@deepseek-ai/dsh-session-query-sqlite'
    import SkillRegistry from '@deepseek-ai/dsh-skill'
    import WorkerThreadWorkflowEngine from '@deepseek-ai/dsh-workflow-worker-thread'

    describe('DSH rc.7 reusable public seams', () => {
      it('resolves Session Query and Skill from public package roots', () => {
        expect(typeof SqliteSessionQueryEngine).toBe('function')
        expect(typeof SkillRegistry).toBe('function')
      })

      it('resolves Jobs, Workflow, and Message Feedback from public package roots', () => {
        expect(typeof LocalJobRegistry).toBe('function')
        expect(typeof WorkerThreadWorkflowEngine).toBe('function')
        expect(typeof MessageFeedbackService).toBe('function')
      })
    })

Keep the existing probe's behavior tests as the authority for `start → wait → read`, worker-thread result `42`, and feedback `put → list`; do not copy its 8,477-line isolated lockfile into the product repository.

- [ ] **Step 2: Run RED**

    pnpm exec vitest run tests/dsh-probe/public-surface.spec.ts tests/dsh-probe/install-closure.spec.ts tests/dsh-probe/rc7-reuse-surface.spec.ts

Expected: the rc.7 version assertions and new public imports fail against the rc.6 product baseline.

- [ ] **Step 3: Update only the exact DSH dependency closure**

Change every direct `@deepseek-ai/dsh*` dependency in the six product manifests from `0.1.0-rc.6` to exact `0.1.0-rc.7`. Add only the public packages exercised by the new contract:

    @deepseek-ai/dsh-jobs-local
    @deepseek-ai/dsh-message-feedback
    @deepseek-ai/dsh-session-query
    @deepseek-ai/dsh-session-query-sqlite
    @deepseek-ai/dsh-skill
    @deepseek-ai/dsh-workflow-worker-thread

Update the version constants and their existing tests to rc.7. Regenerate `pnpm-lock.yaml` without moving dependency data to C::

    pnpm install --lockfile-only --store-dir D:\DevData\pnpm-store

Do not change Cordis, Node, pnpm, TypeScript, Vitest, Python, or Tianwen package versions; do not merge the standalone compatibility fixture.

- [ ] **Step 4: Run stable rc.7 product gates**

    pnpm install --frozen-lockfile --store-dir D:\DevData\pnpm-store
    pnpm run typecheck
    pnpm run check:dsh-install
    pnpm run check:no-private-dsh-imports
    pnpm exec vitest run tests/dsh-probe/public-surface.spec.ts tests/dsh-probe/install-closure.spec.ts tests/dsh-probe/rc7-reuse-surface.spec.ts tests/dsh-probe/evidence.spec.ts
    pnpm exec vitest run tests/dsh-migration/goal-resume.spec.ts tests/dsh-migration/runtime-composition.spec.ts tests/dsh-migration/runtime-bundle.spec.ts tests/dsh-migration/tianwen-startup.e2e.spec.ts
    pnpm exec dsh --profile headless --dump-config

Expected: exact rc.7 closure, zero private imports, ordinary Agent/Goal/Session/Evidence behavior unchanged, and native headless config exits successfully. Do not run `tests/dsh-migration/runtime-profile.spec.ts` as a release gate.

- [ ] **Step 5: Document the reuse boundary**

Update `docs/tianwen-architecture-overview-v2.md` to say the product baseline is rc.7 and record this ownership split:

    DSH rc.7: Session Query, Skill, Jobs, Workflow, Message Feedback, Approval, permissions
    Tianwen: cross-run Goal Graph, Evidence provenance, learning attribution, future-version governance

Clarify that DSH Message Feedback is an input to Tianwen attribution, not a Lesson by itself; a DSH Job is process-local work, not a durable Tianwen Learning Ticket.

- [ ] **Step 6: Review and commit the isolated upgrade**

Review the diff for accidental rc.6 leftovers outside historical documents and for newly duplicated adapters:

    rg -n '0\.1\.0-rc\.6' package.json packages scripts tests
    git diff --check

Expected: no active product/version-contract rc.6 match. Historical operation/research documents may retain rc.6 facts. Commit only the dependency upgrade, narrow contract, version assertions, and architecture update:

    git add package.json pnpm-lock.yaml packages scripts tests/dsh-probe tests/dsh-migration docs/tianwen-architecture-overview-v2.md
    git commit -m "chore: upgrade the product runtime to DSH rc.7"

---

### Task 3: Deterministic zero-cost demo

**Files:**
- Create: scripts/run-research-preview-demo.ts
- Create: tests/dsh-probe/research-preview-demo.spec.ts
- Modify: package.json

**Interfaces:**
- Consumes: mountCoreHarness, ScriptedAdapter responses, defineTool, projectEvidence.
- Produces: runResearchPreviewDemo() and pnpm demo:research-preview.

- [ ] **Step 1: Write the failing test**

Create tests/dsh-probe/research-preview-demo.spec.ts:

    import { describe, expect, it } from 'vitest'
    import { runResearchPreviewDemo } from '../../scripts/run-research-preview-demo.js'

    describe('Tianwen research preview demo', () => {
      it('projects evidence without changing the DSH session', async () => {
        const result = await runResearchPreviewDemo()
        expect(result).toMatchObject({
          schemaVersion: 'tianwen.research-preview-demo.v1',
          execution: { status: 'completed', modelRequests: 2, toolCalls: 1 },
          evidence: { count: 1, complete: 1, errors: 0 },
          learning: {
            decision: 'no-case',
            signals: 0,
            candidateCreated: false,
            reason: 'no-repeat-failure-or-user-correction',
          },
          nonInterference: { sessionUnchanged: true },
        })
        expect(result.nonInterference.beforeDigest)
          .toBe(result.nonInterference.afterDigest)
      })
    })

- [ ] **Step 2: Run RED**

    pnpm exec vitest run tests/dsh-probe/research-preview-demo.spec.ts

Expected: failure because the demo module does not exist.

- [ ] **Step 3: Implement the smallest real DSH path**

scripts/run-research-preview-demo.ts must:

1. Mount mountCoreHarness with one toolCallResponse and one textResponse.
2. Register one deterministic summarize tool.
3. Create an in-memory SessionId research-preview-demo.
4. Run the normal DSH Agent loop and wait for idle.
5. Hash session.events before Evidence projection.
6. Call projectEvidence without modifying the Session.
7. Hash session.events again and fail unless both hashes match.
8. Return this exact public shape:

    export interface ResearchPreviewDemoResult {
      readonly schemaVersion: 'tianwen.research-preview-demo.v1'
      readonly execution: {
        readonly status: 'completed'
        readonly modelRequests: number
        readonly toolCalls: number
      }
      readonly evidence: {
        readonly count: number
        readonly complete: number
        readonly errors: number
      }
      readonly learning: {
        readonly decision: 'no-case'
        readonly signals: 0
        readonly candidateCreated: false
        readonly reason: 'no-repeat-failure-or-user-correction'
      }
      readonly nonInterference: {
        readonly beforeDigest: `sha256:${string}`
        readonly afterDigest: `sha256:${string}`
        readonly sessionUnchanged: true
      }
    }

The no-case result is a demo conclusion from zero qualifying signals, not a new general learning engine. Dispose the Agent and Cordis fiber in finally. The CLI prints exactly one formatted JSON object.

- [ ] **Step 4: Add the command**

Add to package.json scripts:

    "demo:research-preview": "tsx scripts/run-research-preview-demo.ts"

- [ ] **Step 5: Run GREEN and commit**

    pnpm run typecheck
    pnpm exec vitest run tests/dsh-probe/research-preview-demo.spec.ts
    pnpm demo:research-preview
    git diff --check
    git add package.json scripts/run-research-preview-demo.ts tests/dsh-probe/research-preview-demo.spec.ts
    git commit -m "feat: add deterministic research preview demo"

Expected: one complete Evidence record, no Case/Candidate, identical before/after digests, and zero network/Docker/filesystem persistence.

---

### Task 4: Accurate bilingual public surface

**Files:**
- Create: README.zh-CN.md
- Create: CONTRIBUTING.md
- Create: SECURITY.md
- Create: tests/contracts/test_public_repository_surface.py
- Modify: README.md
- Modify: pyproject.toml

**Interfaces:**
- Consumes: docs/tianwen-architecture-overview-v2.md and the demo command.
- Produces: English/Chinese entry points and a regression contract against outdated architecture claims.

- [ ] **Step 1: Write the failing contract**

The new Python contract must assert:

    required = ('README.md', 'README.zh-CN.md', 'CONTRIBUTING.md', 'SECURITY.md', 'LICENSE')
    assert all((ROOT / name).is_file() for name in required)
    assert 'learning control plane' in README_EN
    assert 'DSH' in README_EN
    assert 'pnpm demo:research-preview' in README_EN
    assert 'Candidate/Shadow/Promotion' in README_EN
    assert 'completed autonomous learning' not in README_EN
    assert PYPROJECT['project']['description'] == 'An auditable learning control plane for long-running agents.'

It must also parse relative Markdown links in the four public root documents and assert each target exists, while ignoring https/http/mailto/fragment links. Scan current Markdown excluding .git, .venv, and node_modules and reject the two personal path prefixes.

- [ ] **Step 2: Run RED**

    uv run pytest tests/contracts/test_public_repository_surface.py -q

Expected: missing public files and outdated positioning.

- [ ] **Step 3: Rewrite README.md**

Use this exact order:

    Tianwen
    one-sentence definition
    why the project exists
    architecture: DSH runs; Tianwen governs across runs; Alpha is the lab
    what the preview proves
    three-minute zero-cost demo
    current limitations
    repository map
    development commands
    contributing/security/Chinese links
    Apache-2.0 license

The first screen must say DSH is the only Runtime, Tianwen learning is background/non-interfering, the preview proves execution/evidence/no-Case behavior, and Candidate/Shadow/Promotion is not complete.

- [ ] **Step 4: Add Chinese, contribution, and security documents**

README.zh-CN.md mirrors claims in natural Chinese and says “Alpha 是实验与评测资产，不是第二套产品运行时.”

CONTRIBUTING.md gives exact supported versions and commands:

    pnpm install --frozen-lockfile
    pnpm run typecheck
    pnpm run check:dsh-install
    pnpm run check:no-private-dsh-imports
    pnpm exec vitest run tests/dsh-probe/evidence.spec.ts tests/dsh-probe/research-preview-demo.spec.ts
    uv sync --frozen --dev
    uv run ruff check .
    uv run pytest

It also states the DSH/Tianwen boundary and rejects secrets or paid-live fixtures.

SECURITY.md uses GitHub private vulnerability reporting, forbids secrets in public issues, supports the latest research preview, and makes no production SLA claim.

- [ ] **Step 5: Correct metadata without publishing packages**

Set only:

    description = "An auditable learning control plane for long-running agents."

Keep all 0.0.0 versions and private=true.

- [ ] **Step 6: Run GREEN and commit**

    uv run pytest tests/contracts/test_public_repository_surface.py -q
    git diff --check
    git add README.md README.zh-CN.md CONTRIBUTING.md SECURITY.md pyproject.toml tests/contracts/test_public_repository_surface.py
    git commit -m "docs: publish the Tianwen research preview surface"

---

### Task 5: Minimal zero-paid CI

**Files:**
- Create: .github/workflows/ci.yml

**Interfaces:**
- Consumes: uv.lock, pnpm-lock.yaml, zero-paid tests, demo command.
- Produces: read-only Python and TypeScript Linux jobs.

- [ ] **Step 1: Add the workflow**

Use:

    name: CI
    on:
      push:
        branches: [main]
      pull_request:
    permissions:
      contents: read
    jobs:
      python:
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v7
          - uses: astral-sh/setup-uv@v9
            with:
              enable-cache: true
          - run: uv python install 3.12
          - run: uv sync --frozen --dev
          - run: uv run ruff check .
          - run: uv run python -m compileall -q src tests
          - run: uv run pytest
      typescript:
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v7
          - uses: pnpm/action-setup@v4
            with:
              version: 11.20.0
          - uses: actions/setup-node@v7
            with:
              node-version: 22.20.0
              cache: pnpm
          - run: pnpm install --frozen-lockfile
          - run: pnpm run typecheck
          - run: pnpm run check:dsh-install
          - run: pnpm run check:no-private-dsh-imports
          - run: pnpm exec vitest run tests/dsh-probe/evidence.spec.ts tests/dsh-probe/research-preview-demo.spec.ts
          - run: pnpm demo:research-preview

Do not add credentials, Docker services, a platform matrix, coverage upload, release automation, or write permissions.

- [ ] **Step 2: Reproduce commands locally**

    uv sync --frozen --dev
    uv run ruff check .
    uv run python -m compileall -q src tests
    uv run pytest
    pnpm install --frozen-lockfile
    pnpm run typecheck
    pnpm run check:dsh-install
    pnpm run check:no-private-dsh-imports
    pnpm exec vitest run tests/dsh-probe/evidence.spec.ts tests/dsh-probe/research-preview-demo.spec.ts
    pnpm demo:research-preview
    git diff --check

Expected: exit 0; paid live remains disabled without credentials.

- [ ] **Step 3: Commit**

    git add .github/workflows/ci.yml
    git commit -m "ci: add zero-paid research preview checks"

---

### Task 6: Release candidate and mainline integration

**Files:**
- Create: docs/releases/v0.1.0-research-preview.md
- Create: docs/operations/tianwen-v0.1.0-public-readiness-handoff.md
- Modify: docs/research/2026-08-19-tianwen-public-readiness-audit.md

**Interfaces:**
- Consumes: Tasks 1–5, fresh gates, redacted scan classifications.
- Produces: release notes, readiness evidence, reviewed mainline candidate.

- [ ] **Step 1: Write release notes**

Use sections: Problem; One Runtime and one learning control plane; What this preview proves; Reproduce; Existing Alpha/DSH evidence assets; Known limitations; Roadmap; License.

Explicitly state that Candidate generation, Shadow, Promotion, production SLA, and UI are not complete. A1–A5 and Alpha-C Intake are research assets, not adoption.

- [ ] **Step 2: Re-run final scans**

Write reports only to:

    D:\DevData\tianwen-public-audit\final-all-refs.json
    D:\DevData\tianwen-public-audit\final-current-tree.json

Expected: no unresolved real credential. Otherwise stop publication.

- [ ] **Step 3: Run fresh gates**

    uv run ruff check .
    uv run python -m compileall -q src tests
    uv run pytest
    $env:TIANWEN_DSH_PROBE_ROOT = 'D:\DevData\tianwen-dsh-probe'
    pnpm run typecheck
    pnpm run check:dsh-install
    pnpm run check:no-private-dsh-imports
    pnpm exec vitest run --exclude tests/dsh-migration/runtime-profile.spec.ts
    pnpm demo:research-preview
    git diff --check

Record exact pass/skip counts and demo JSON SHA-256. A timeout is not a pass.

The excluded runtime-profile test remains a named known flake in the release notes. Revisit it only if the Profile command hangs in normal product use; the completed rc.7 upgrade is not evidence that this diagnostic passed.

- [ ] **Step 4: Review the whole branch**

Review correctness, architecture fitness, and Ponytail/proportionality. Confirm public claims equal evidence, DSH remains the only Runtime, and no unnecessary dependency/framework/safety gate was introduced. Resolve all Critical/Important findings.

- [ ] **Step 5: Commit and integrate**

    git add docs/releases/v0.1.0-research-preview.md docs/operations/tianwen-v0.1.0-public-readiness-handoff.md docs/research/2026-08-19-tianwen-public-readiness-audit.md
    git commit -m "docs: prepare v0.1.0 research preview"
    git push origin codex/tianwen-oss-application-prep

Fetch first. If remote main advanced, merge it normally into this branch and rerun affected gates. Then merge with --no-ff into main and ordinary-push. Verify local main, origin/main, and ls-remote main are the same SHA. Never merge codex/tianwen-agent-execution-foundation.

---

### Task 7: Public visibility and GitHub Release

**Files:**
- No source changes after the release candidate unless public verification exposes a real defect.

**Interfaces:**
- Consumes: merged SHA, readiness checklist, acknowledged visibility action.
- Produces: public metadata, public repository, annotated tag, prerelease.

- [ ] **Step 1: Present the final external-action checklist**

Show repository, target SHA, scan results, unresolved-real-credential count, license, CI result, demo result, visibility consequence for all 38 branches, tag, and release-note path. Wait for acknowledgment before changing visibility.

- [ ] **Step 2: Set metadata and visibility**

    gh repo edit daydreamer0213/Tian-wen --description "An auditable learning control plane for long-running agents, built on DSH." --enable-issues=true --enable-projects=false --enable-wiki=false --add-topic ai-agents --add-topic agent-evaluation --add-topic continual-learning --add-topic governance --add-topic dsh --add-topic python --add-topic typescript
    gh repo edit daydreamer0213/Tian-wen --visibility public --accept-visibility-change-consequences

Do not enable Discussions or create artificial activity.

- [ ] **Step 3: Tag and release**

    git tag -a v0.1.0-research-preview -m "Tianwen v0.1.0 research preview"
    git push origin v0.1.0-research-preview
    gh release create v0.1.0-research-preview --repo daydreamer0213/Tian-wen --verify-tag --prerelease --title "Tianwen v0.1.0 Research Preview" --notes-file docs/releases/v0.1.0-research-preview.md

- [ ] **Step 4: Verify unauthenticated access**

In a signed-out browser verify README, Chinese README, LICENSE, CONTRIBUTING, SECURITY, architecture, CI, and prerelease. Confirm no local path, receipt, database, credential, or private Trial output is exposed.

    gh repo view daydreamer0213/Tian-wen --json visibility,description,repositoryTopics,licenseInfo,latestRelease

Expected: PUBLIC, Apache-2.0, expected topics, visible prerelease.

---

### Task 8: Codex for Open Source application packet

**Files:**
- Create: docs/operations/tianwen-codex-for-oss-application-packet.md

**Interfaces:**
- Consumes: public URL, Release URL, CI URL, final SHA, actual commit count.
- Produces: copy-ready non-personal application material.

- [ ] **Step 1: Refresh facts**

    git rev-list --count main
    git rev-parse main
    gh repo view daydreamer0213/Tian-wen --json url,visibility,latestRelease,viewerPermission

- [ ] **Step 2: Build the packet**

Include Role=Primary maintainer, repository URL, API credits interest, Codex Security selection, release URL, final SHA, and CI URL. Reuse the three approved answer drafts, replacing only stale facts such as commit count.

Do not commit the user's ChatGPT email, OpenAI Organization ID, API key, invoice, or account screenshot.

- [ ] **Step 3: Verify the three answer lengths**

Read only the three answer bodies and print Python len() for each. Expected: each is at most 500 characters.

- [ ] **Step 4: Commit the packet**

    git add docs/operations/tianwen-codex-for-oss-application-packet.md
    git commit -m "docs: finalize Codex for Open Source application packet"
    git push origin main

If this follows the tag, leave the tag unchanged and state that the packet is post-release documentation.

- [ ] **Step 5: User submits personal fields**

The user fills the ChatGPT account email and OpenAI Organization ID and submits the official form. Do not submit on the user's behalf without a separate explicit request at submission time.
