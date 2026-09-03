from __future__ import annotations

import os
import re
import textwrap
import tomllib
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[2]
PUBLIC_DOCUMENTS = (
    "README.md",
    "README.zh-CN.md",
    "CONTRIBUTING.md",
    "SECURITY.md",
)
REQUIRED_ROOT_FILES = (*PUBLIC_DOCUMENTS, "LICENSE")
MARKDOWN_LINK = re.compile(r"(?<!!)\[[^\]]+\]\(([^)]+)\)")
IGNORED_TREES = {".git", ".venv", "node_modules"}
PERSONAL_PATH_PREFIXES = (
    r"D:\Guo\zuochong\AGi",
    r"C:\Users\Administrator",
)


def read_public_document(name: str) -> str:
    path = ROOT / name
    assert path.is_file(), f"missing public document: {name}"
    return path.read_text(encoding="utf-8")


def relative_markdown_links(markdown: str) -> list[str]:
    targets: list[str] = []
    for raw_target in MARKDOWN_LINK.findall(markdown):
        target = raw_target.strip().split(maxsplit=1)[0].strip("<>")
        if target.startswith(("http://", "https://", "mailto:", "#")):
            continue
        path = unquote(target.split("#", maxsplit=1)[0])
        if path:
            targets.append(path)
    return targets


def test_required_public_surface_and_positioning() -> None:
    assert all((ROOT / name).is_file() for name in REQUIRED_ROOT_FILES)

    readme_en = read_public_document("README.md")
    assert "learning control plane" in readme_en
    assert "DSH" in readme_en
    assert "pnpm demo:research-preview" in readme_en
    assert "pnpm demo:explicit-correction" in readme_en
    assert "Stage 7 remains complete" in readme_en
    assert "No naturally triggered product Candidate has passed a real" in readme_en
    assert "paired B/C evaluation yet." in readme_en
    assert "isolated Shadow" in readme_en
    assert "standing authorization" in readme_en
    assert "Promotion, Rollback, and progress in the main" in readme_en
    assert "Explicit negative feedback with a concrete note can create a durable Signal/Ticket." in readme_en
    assert "Positive and note-free negative feedback create no Ticket." in readme_en
    assert "Candidate status is only `recorded`" in readme_en
    assert "completed autonomous learning" not in readme_en

    with (ROOT / "pyproject.toml").open("rb") as handle:
        pyproject = tomllib.load(handle)
    assert pyproject["project"]["description"] == "An auditable learning control plane for long-running agents."


def test_bilingual_documents_share_the_proven_preview_facts() -> None:
    readme_en = read_public_document("README.md")
    readme_zh = read_public_document("README.zh-CN.md")

    for fact in (
        "DSH 0.1.1-rc.2",
        "no-case",
        "candidateCreated=false",
        "paired B/C",
        "Shadow",
        "Promotion",
        "Rollback",
    ):
        assert fact in readme_en
        assert fact in readme_zh

    assert "read-only Evidence projection" in readme_en
    assert "Stage 7 remains complete" in readme_en
    assert "single-user product evidence" in readme_en
    assert "product-wired E2E with no injected verdict" in readme_en
    assert "Evidence 只读投影" in readme_zh
    assert "Stage 7 仍已完成" in readme_zh
    assert "单用户产品证据" in readme_zh
    assert "不注入 verdict 的产品接线 E2E" in readme_zh
    assert "带有具体说明的显式负面反馈可以创建持久化 Signal/Ticket。" in readme_zh
    assert "正面反馈和没有说明的负面反馈都不会创建 Ticket。" in readme_zh
    assert "Candidate 状态仅为 `recorded`（已记录）" in readme_zh
    assert "Alpha 是实验与评测资产，不是第二套产品运行时。" in readme_zh


def test_ci_runs_both_zero_cost_demos() -> None:
    ci = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
    assert "pnpm demo:research-preview" in ci
    assert "pnpm demo:explicit-correction" in ci


def test_repeated_outcome_public_facts_and_ci() -> None:
    readme_en = read_public_document("README.md")
    readme_zh = read_public_document("README.zh-CN.md")
    ci = (ROOT / ".github" / "workflows" / "ci.yml").read_text(
        encoding="utf-8"
    )

    assert "pnpm demo:repeated-outcome" in readme_en
    assert "pnpm demo:repeated-outcome" in readme_zh
    assert "first ordinary reusable failure records only a Signal" in readme_en
    assert "synthetic contract fixture" in readme_en
    assert "第一次普通可复用失败只记录 Signal" in readme_zh
    assert "合成合同夹具" in readme_zh
    for command in (
        "tests/dsh-probe/outcome-intake.spec.ts",
        "tests/dsh-probe/outcome-intake-runtime.spec.ts",
        "tests/dsh-probe/repeated-outcome-demo.spec.ts",
        "pnpm demo:repeated-outcome",
    ):
        assert command in ci


def test_governed_skill_candidate_public_facts_and_limits() -> None:
    readme_en = read_public_document("README.md")
    readme_zh = read_public_document("README.zh-CN.md")
    architecture = (ROOT / "docs" / "tianwen-architecture-overview-v2.md").read_text(
        encoding="utf-8"
    )

    for document in (readme_en, readme_zh, architecture):
        for concept in ("Case", "Attribution", "Lesson", "Candidate", "DSH"):
            assert concept in document
        for frozen_stage in ("Evaluation", "Shadow", "Promotion"):
            assert frozen_stage in document

    assert "pnpm demo:governed-skill-candidate" in readme_en
    assert "Candidate status is only `recorded`" in readme_en
    assert "deterministic synthetic contract data" in readme_en
    assert "not registered for ordinary Runs, shadowed, or promoted" in readme_en
    assert "not autonomous production learning" in readme_en
    assert "Candidate 状态仅为 `recorded`（已记录）" in readme_zh
    assert "确定性的合成合同数据" in readme_zh
    assert "不会注册到普通 Run，也不会进入 Shadow 或 Promotion" in readme_zh
    assert "不是生产自主学习" in readme_zh
    assert "受治理 Skill Candidate 机制" in architecture
    assert "Candidate 和 Evaluation 仍是 scripted/controlled mechanism proof" in architecture


def test_paired_skill_evaluation_public_facts_and_ci() -> None:
    readme_en = read_public_document("README.md")
    readme_zh = read_public_document("README.zh-CN.md")
    architecture = (ROOT / "docs" / "tianwen-architecture-overview-v2.md").read_text(
        encoding="utf-8"
    )
    ci = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")

    assert "pnpm demo:paired-skill-evaluation" in readme_en
    assert "paired isolated normal DSH Agents" in readme_en
    assert "scripted mechanism proof" in readme_en
    assert "rejects a non-scripted Provider before it creates an evaluation Agent" in readme_en
    assert "not DSH Policy/permission proof" in readme_en
    assert "INCONCLUSIVE" in readme_en
    assert "not installed, routed, shadowed, promoted, or rejected" in readme_en
    assert "成对、隔离的普通 DSH Agent" in readme_zh
    assert "脚本化机制证明" in readme_zh
    assert "非 scripted Provider 会在创建评测 Agent 前被拒绝" in readme_zh
    assert "不会安装、路由、进入 Shadow、Promotion 或 Reject" in readme_zh
    assert "成对 Evaluation 记录" in architecture
    assert "INCONCLUSIVE" in architecture
    assert "Shadow、Promotion" in architecture
    for command in (
        "tests/dsh-probe/skill-evaluation.spec.ts",
        "tests/dsh-probe/skill-evaluation-runtime.spec.ts",
        "tests/dsh-probe/paired-skill-evaluation-demo.spec.ts",
        "pnpm demo:paired-skill-evaluation",
    ):
        assert command in ci


def test_governed_skill_shadow_eligibility_handoff_and_ci() -> None:
    handoff = (ROOT / "docs" / "operations" / "tianwen-stage5-skill-shadow-eligibility-handoff.md").read_text(
        encoding="utf-8"
    )
    ci = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")

    for fact in (
        "DSH `0.1.0-rc.7` remains the only product Agent Runtime",
        "Stage 5 implements only the eligibility slice",
        "no-eligible-shadow",
        (
            "Natural Shadow routing, five qualified natural Runs, Active Pointer, "
            "Promotion, and rollback remain unimplemented and unproven"
        ),
        "Scripted evidence is not efficacy evidence",
        "No Candidate is registered for ordinary traffic",
        "0 Provider requests, 0 paid tokens, 0 CNY, 0 Docker, and 0 user data",
        "Artifact, Dynamic Cordis, and Champion paths are not used for activation, routing, or state change",
        "Python Alpha, RepoTaskRuntime, and AlphaRuntime are not used",
    ):
        assert fact in handoff

    for command in (
        "tests/dsh-probe/skill-shadow.spec.ts",
        "tests/dsh-probe/skill-shadow-eligibility-demo.spec.ts",
        "pnpm demo:shadow-eligibility",
    ):
        assert command in ci


def test_governed_skill_promotion_readiness_handoff_and_ci() -> None:
    handoff = " ".join(
        (
            ROOT
            / "docs"
            / "operations"
            / "tianwen-stage6-skill-promotion-readiness-handoff.md"
        ).read_text(encoding="utf-8").split()
    )
    ci = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")

    for fact in (
        "DSH `0.1.0-rc.7` remains the only product Agent Runtime",
        "Stage 6 implements only the pure Promotion readiness refusal slice",
        "no-promotion-readiness",
        (
            "Natural Shadow, five qualified natural Runs, Active Pointer, exact human "
            "Promotion approval, Promotion, and product rollback remain unimplemented and unproven"
        ),
        "The 60 CNY development budget is not a Promotion ApprovalReceipt",
        "scripted evidence is mechanism evidence, not efficacy or stability evidence",
        "Candidate traffic, pointers, Promotions, and rollbacks remain zero",
        "0 Provider requests, 0 paid tokens, 0 CNY, 0 Docker, and 0 user data",
        "Artifact, Dynamic Cordis, and global Champion paths are not used for activation, routing, or state change",
        "Python Alpha, RepoTaskRuntime, and AlphaRuntime are not used",
    ):
        assert fact in handoff

    for command in (
        "tests/dsh-probe/skill-promotion.spec.ts",
        "tests/dsh-probe/skill-promotion-readiness-demo.spec.ts",
        "pnpm demo:promotion-readiness",
    ):
        assert command in ci


def test_natural_run_evidence_handoff_and_ci() -> None:
    handoff = " ".join(
        (
            ROOT
            / "docs"
            / "operations"
            / "tianwen-stage7-natural-run-evidence-trial-handoff.md"
        ).read_text(encoding="utf-8").split()
    )
    ci = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")

    for fact in (
        "DSH `0.1.0-rc.7` remains the only product Agent Runtime",
        "zero-cost fixture proves only the mechanism",
        "met/no-case",
        (
            "No configured-Provider natural receipt is claimed until one actually runs "
            "once through the normal configured DSH path"
        ),
        (
            "does not manufacture a Ticket, Case, Candidate, live B/C Evaluation, "
            "Shadow, Active Pointer, Promotion, Reject, or rollback"
        ),
        "Exact CNY billing is unavailable and non-bearing",
        "no price polling, price snapshot, budget store, reservation, or request gate",
        "0 Provider network requests, 0 paid tokens, 0 exact CNY, 0 Docker, 0 external database, and 0 user data",
        "Python Alpha, RepoTaskRuntime, AlphaRuntime, Artifact, Dynamic Cordis, or the global Champion",
        "first real attempt was pre-Turn, zero Provider, and unresolved",
        "classified failure receipts contain only fixed codes, IDs, and zero counters",
        "raw child output remains suppressed",
        (
            "No retry, second Runtime, logger, store, price lookup, budget subsystem, "
            "Candidate, Evaluation, Shadow, or Promotion was added"
        ),
        "future receipt identifies a subsystem, not an underlying library or OS cause",
        "one self-contained filesystem incumbent parent is projected as a pure-text scoped snapshot",
        "`path`, `resourceBase`, and `metadata` are excluded from the frozen parent and safe outputs",
        "Candidate remains unregistered",
        "Multi-file or sidecar filesystem parents stop before binding",
    ):
        assert fact in handoff

    for command in (
        "pnpm --filter @tianwen/runtime-bundle... build",
        "tests/dsh-probe/natural-run-evidence-runtime.spec.ts",
        "tests/dsh-probe/natural-run-evidence-demo.spec.ts",
        "pnpm demo:natural-run-evidence",
    ):
        assert command in ci


def test_controlled_skill_lifecycle_public_evidence_boundaries() -> None:
    readme_en = read_public_document("README.md")
    readme_zh = read_public_document("README.zh-CN.md")
    architecture = (ROOT / "docs" / "tianwen-architecture-overview-v2.md").read_text(
        encoding="utf-8"
    )

    for fact in (
        "The Stage 7 project-owner natural task and official installer/status proof remain complete.",
        (
            "The five-task B/C, blind evaluator, isolated Shadow, and "
            "Promotion/Rollback product mechanisms are implemented and covered "
            "by a product-wired E2E with no injected verdict."
        ),
        "A fresh official installed configured-DeepSeek controlled lifecycle has now returned `passed`.",
        "`naturalUserEvidence=not-claimed`",
        "`externalUserEvidence=not-claimed`",
        "pnpm vitest run tests/dsh-migration/explicit-correction-product.e2e.spec.ts",
    ):
        assert fact in readme_en

    for fact in (
        "Stage 7 项目所有者自然任务和官方 installer/status 证明仍已完成。",
        (
            "五任务 B/C、盲态 evaluator、隔离 Shadow 与 Promotion/Rollback "
            "产品机制已经实现，并由不注入 verdict 的产品接线 E2E 覆盖。"
        ),
        "一个全新的官方已安装 configured-DeepSeek 受控生命周期现已返回 `passed`。",
        "`naturalUserEvidence=not-claimed`",
        "`externalUserEvidence=not-claimed`",
        "pnpm vitest run tests/dsh-migration/explicit-correction-product.e2e.spec.ts",
    ):
        assert fact in readme_zh

    for fact in (
        "0-external-Provider scripted 全链夹具",
        "官方已安装 configured-DeepSeek 受控生命周期",
        "返回 `passed`",
        "naturalUserEvidence=not-claimed",
        "externalUserEvidence=not-claimed",
    ):
        assert fact in architecture


def test_controlled_real_activity_22_records_formal_success() -> None:
    handoff_path = (
        ROOT
        / "docs"
        / "operations"
        / "tianwen-v0.1-controlled-real-activity-22-handoff.md"
    )
    assert handoff_path.is_file(), "missing controlled real activity-22 handoff"
    handoff = " ".join(handoff_path.read_text(encoding="utf-8").split())

    for fact in (
        "7d8344810f216c2275f4d307bd0674886027827b",
        "32883408309",
        "tianwen.controlled-real-skill-lifecycle.v1",
        "status=passed",
        "25 formal Sessions",
        "seedRuns=2",
        "evaluationArms=10",
        "evaluators=5",
        "shadowRuns=5",
        "transitions=3",
        "70 model-request events",
        "72 tool-call events",
        "20 acceptance Evidence",
        "7 failed unavailable-tool results",
        "B@rev1 → C@rev2 → B@rev3 → C@rev4",
        "tianwen-offline/phase2-smoke",
        "Provider-account request count remains unknown",
        "naturalUserEvidence=not-claimed",
        "externalUserEvidence=not-claimed",
    ):
        assert fact in handoff

    for forbidden in (
        "DEEPSEEK_API_KEY=",
        "session:controlled-real:activity-22:",
        "raw prompt",
        "raw reasoning",
    ):
        assert forbidden not in handoff


def test_controlled_real_operation_public_readiness_boundaries() -> None:
    readme_en = read_public_document("README.md")
    readme_zh = read_public_document("README.zh-CN.md")
    architecture = (ROOT / "docs" / "tianwen-architecture-overview-v2.md").read_text(
        encoding="utf-8"
    )
    normalized_readme_en, normalized_readme_zh, normalized_architecture = (
        " ".join(document.split()) for document in (readme_en, readme_zh, architecture)
    )

    common_facts = ("HMR", "controlled-lifecycle", "Activity-22")
    expected_by_document = {
        "README.md": (
            "DSH/HMR shutdown-lifecycle repair",
            "Model activation and its confirming status remain product setup",
            "Provider-account request counts",
        ),
        "README.zh-CN.md": (
            "DSH/HMR 的关闭生命周期修复",
            "模型激活及其确认 status 仍属于产品准备",
            "Provider 账户请求计数",
        ),
        "architecture": (
            "DSH/HMR shutdown lifecycle 修复",
            "模型激活和确认 status 是产品 setup",
            "Provider-account 实际请求数没有独立事实源",
        ),
    }
    documents = {
        "README.md": normalized_readme_en,
        "README.zh-CN.md": normalized_readme_zh,
        "architecture": normalized_architecture,
    }
    missing = {
        name: [fact for fact in (*common_facts, *expected_by_document[name]) if fact not in text]
        for name, text in documents.items()
    }
    assert not any(missing.values()), missing

    for document in (normalized_readme_en, normalized_readme_zh, normalized_architecture):
        for overbroad_claim in (
            "Production does not register `ScriptedAdapter`",
            "scripted adapters exist only in tests",
            "production runner 不注册 `ScriptedAdapter`",
            "生产 runner 不注册 `ScriptedAdapter`",
            "scripted adapter 只存在于测试",
            "activity-01 remains unconsumed",
            "activity-01 尚未消费",
            "activity-01 product defect",
            "activity-01 产品缺陷",
            "activity-01 Provider failure",
            "activity-01 Provider 失败",
            "real Provider lifecycle succeeded",
            "真实 Provider lifecycle 已成功",
        ):
            assert overbroad_claim not in document


def test_controlled_real_activity_01_handoff_records_failure_and_recovery_boundary() -> None:
    handoff_path = (
        ROOT
        / "docs"
        / "operations"
        / "tianwen-v0.1-controlled-real-activity-01-handoff.md"
    )
    assert handoff_path.is_file(), "missing controlled real activity-01 handoff"
    handoff = " ".join(handoff_path.read_text(encoding="utf-8").split())

    for fact in (
        "ddaeffc0c486454cb923d9e31461b248be12475b",
        "32653721315", "pre-invocation-shell-launch-failure",
        "officialLauncherEntered=false", "activityConsumed=false",
        "official `main()` usage parser", "exit 2", "activity-01 is consumed",
        "missing `--model`", "not a product defect", "not a Provider defect",
        "lifecycle invocation=0", "closed roles=0/25",
        "tianwen-offline/phase2-smoke", "modelRequestsDelta=0",
        "Provider-account actual requests=unknown (none-observed)",
        "tool-body actual executions=unknown (none-observed)",
        "model use --model deepseek-v4-pro --data-dir ABSOLUTE_PRODUCT_ROOT --json",
        "historical checkpoint", "new product root", "new evidence root",
        "new operation root", "20 new workspaces", "25 new Sessions",
        "activity-02 remains unconsumed", "Two readiness checkers",
        "inspectionComplete=false", "independent zero-state attestation",
        "sole current authority", "Task 4D", "product-native fail-closed preflight",
        "reviewed", "authority SHA", "controlled integration",
        "automatic exact-main push attempt 1",
        "Python", "TypeScript", "installer-windows", "no retry",
        "naturalUserEvidence=not-claimed", "externalUserEvidence=not-claimed",
    ):
        assert fact in handoff

    for forbidden in (
        "activity-01 remains unconsumed", "real Provider lifecycle succeeded",
        "activity-01 product defect", "activity-01 Provider failure",
        "session:controlled-real:activity-02:", "DEEPSEEK_API_KEY=",
    ):
        assert forbidden not in handoff


def test_controlled_skill_lifecycle_handoff_records_mechanics_and_limits() -> None:
    handoff_path = (
        ROOT
        / "docs"
        / "operations"
        / "tianwen-v0.1-controlled-skill-lifecycle-handoff.md"
    )
    assert handoff_path.is_file(), "missing controlled Skill lifecycle handoff"
    handoff = " ".join(handoff_path.read_text(encoding="utf-8").split())

    for fact in (
        "original-defect",
        "adjacent-transfer",
        "preserved-regression",
        "raw-extraction-counterexample",
        "safety-boundary",
        "25 formal roles",
        "65 local scripted requests",
        "45 tool bodies",
        "0 external Provider requests",
        "20 Run fact sets",
        "3 Signals",
        "one Ticket, one Case, one Attribution, one Lesson, and one Candidate",
        "five objective records and five blind evaluator observations",
        "60/60",
        "isolated-test Shadow pass",
        "B@rev1 → C@rev2 → B@rev3 → C@rev4",
        "terminal replay",
        "task-package-mismatch",
        "0 Agent, 0 ledger mutation, 0 Provider request, and 0 tool body",
        "0 files and 0 logical bytes",
        "naturalUserEvidence=not-claimed",
        "externalUserEvidence=not-claimed",
        "configured DeepSeek controlled lifecycle has not run",
        "activity-local anonymous fingerprints",
        "historical checkpoints rather than current capability lists",
        "standing authorization",
        "feature exact-SHA → controlled main integration → exact-main CI → one formal real Provider lifecycle",
    ):
        assert fact in handoff


def test_controlled_real_operation_readiness_handoff_records_limits() -> None:
    handoff_path = (
        ROOT
        / "docs"
        / "operations"
        / "tianwen-v0.1-controlled-real-operation-readiness-handoff.md"
    )
    assert handoff_path.is_file(), "missing controlled real operation readiness handoff"
    raw_handoff = handoff_path.read_text(encoding="utf-8")
    handoff = " ".join(raw_handoff.split())

    for heading in (
        "## 1. Conclusion and evidence boundary",
        "## 2. Implementation audit trail",
        "## 3. What the scripted full-chain proves",
        "## 4. Installed ingress readiness and preserved validation history",
        "## 5. Evidence labels, receipt and privacy",
        "## 6. Feature gates / exact verification",
        "## 7. Next boundary: 9A6-R2 then 9B",
    ):
        assert heading in raw_handoff

    for fact in (
        "4819fd768b6e250df4a8492ec03c006f44794023",
        "c85d4cbd8a3f2cb8a285cfbe261fdc4ef0f91b9b",
        "df628cee8f5c619ab58b9ba62de79c66e35e8b68",
        "3f3d8ce9a4e102eb79d1f964504d7f0aa61362a1",
        "9da1f45843cc92ca011b94b3344c1a8581dadd78",
        "ce3521f26e08d3fbf2f435fd869c9d64e8ed8b3d",
        "7042a7d84712d499671b464251d0f09ec898fcf6",
        "67ce961487f93734230c06c1624f44573703691f",
        (
            "current controlled-real-operation runner spec: 25 formal Sessions, "
            "65 local scripted model requests, 65 tool bodies, 20 acceptance Evidence, "
            "evaluation pass 80/80, and 0 external Provider requests"
        ),
        (
            "older controlled-skill-lifecycle demo: 25 formal Sessions, "
            "65 local scripted requests, 45 tool bodies, evaluation pass 60/60, "
            "and 0 external Provider requests"
        ),
        "tianwen-v0.1-controlled-skill-lifecycle-handoff.md",
        "pnpm manifest asynchronous key ordering",
        "UV_THREADPOOL_SIZE=1",
        "canonical real path",
        "DSH-owned Session/Evolution roots",
        "child exit + stdout end + stderr end",
        "kill once and fail closed",
        "post-R3",
        "manifest revalidation",
        "missing credential",
        "selection-mismatch",
        "R4",
        "R5",
        "R6",
        "about 4.9 seconds",
        "The corrected ten-minute official E2E was not rerun",
        "focused contract",
        "18/18",
        (
            "For this controlled lifecycle, real DeepSeek requests: 0; real controlled "
            "lifecycle runs: 0. No real-provider success has been demonstrated for this "
            "controlled lifecycle."
        ),
        (
            "The installed controlled-lifecycle one-shot runner does not import or "
            "register `ScriptedAdapter`; the scripted adapter used by this fixture "
            "is supplied only by tests."
        ),
        "The operation receipt and this readiness handoff exclude operation-specific raw paths",
        "TIANWEN_CONTROLLED_INSTALLED_E2E=1",
        "default is skip",
        "Python, TypeScript, and installer-windows",
        "run `32635033552`, event `push`, attempt 1",
        "Python and installer-windows succeeded; TypeScript failed",
        "Windows-owned command and Runtime Bundle specs were placed on Ubuntu",
        "not evidence of a Runtime, Agent, or lifecycle semantic defect",
        "The failed run will not be rerun",
        "Ubuntu keeps the seven controlled mechanism specs and the controlled-real runner spec",
        (
            "installer-windows owns the installer, controlled-lifecycle command, and "
            "Runtime Bundle specs after a recursive Runtime Bundle build"
        ),
        "real Provider activity remains 0",
        "new repair exact SHA and a new exact-main CI push run attempt 1",
        "run `32639440639`, event `push`, attempt 1",
        "Python and TypeScript succeeded; installer-windows failed",
        "recursive Runtime Bundle build succeeded",
        "1 failed / 103 passed",
        "installer and controlled command specs passed",
        "Windows checkout text used CRLF while the test template used LF",
        (
            "not evidence of a Runtime, Agent, lifecycle, or installer product "
            "semantic defect"
        ),
        "run `32639440639` will not be rerun or dispatched",
        "new automatic exact-main push run attempt 1",
        "naturalUserEvidence=not-claimed",
        "externalUserEvidence=not-claimed",
        "pre-integration readiness snapshot", "18/18 publication",
        "0 stderr bytes", "0 stdout bytes", "It was not rerun",
        "Formal `activity-01` remains unconsumed",
        "f7a89783097c83404576cb62b77949186e9fbca4",
        "1b323c498a6fa177975fdd852738d9738995c604",
        "canonical real file identity", "llm-deepseek retryPolicy=normal/0",
        "Only session-title-llm is disabled", "ordinary Profile remains DSH normal/2",
        "0 Agent, 0 model request, and 0 durable ledger",
        "receipt-certified", "durable-observed", "unknown",
        "Provider-account actual request count remains unknown",
        "tool-body actual execution count remains unknown",
        "15 tasks, 20 workspaces, and 25 Sessions",
        "source=configured-provider-capable", "environment=development-only",
        "defect=synthetic-defect",
        "`scripted-fixture` is only the exercised source of the existing mechanism fixture",
        "not a label on the future formal operation manifest or receipt",
        "permanent gate order", "reviewed feature",
        "automatic exact-main push attempt 1", "new formal product root",
        "packet freeze", "exactly one real lifecycle",
    ):
        assert fact in handoff

    assert "real Provider succeeded" not in handoff
    assert "all four official installed E2E cases passed" not in handoff
    assert "Production does not register `ScriptedAdapter`" not in handoff
    assert "scripted adapters exist only in tests" not in handoff
    assert "Current external counts are exact" not in handoff
    assert "Public documentation and receipts exclude" not in handoff
    assert (
        "keeps the controlled runner, command, and Runtime Bundle specs together "
        "in the TypeScript focused step"
    ) not in handoff


def test_controlled_skill_lifecycle_ci_contract() -> None:
    ci = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
    typescript_match = re.search(
        r"(?ms)^  typescript:\n(?P<job>.*?)(?=^  [A-Za-z0-9_-]+:\n|\Z)",
        ci,
    )
    assert typescript_match, "missing typescript job"
    typescript_job = typescript_match.group("job")

    controlled_vitest = (
        "pnpm exec vitest run "
        "tests/dsh-probe/controlled-skill-evaluation.spec.ts "
        "tests/dsh-probe/controlled-skill-evaluation-runtime.spec.ts "
        "tests/dsh-probe/controlled-skill-shadow.spec.ts "
        "tests/dsh-probe/controlled-skill-shadow-runtime.spec.ts "
        "tests/dsh-probe/controlled-skill-activation.spec.ts "
        "tests/dsh-probe/controlled-skill-activation-runtime.spec.ts "
        "tests/dsh-probe/controlled-real-skill-lifecycle-runner.spec.ts "
        "tests/dsh-migration/controlled-lifecycle-profile.spec.ts "
        "tests/dsh-migration/explicit-correction-product.e2e.spec.ts"
    )

    violations: list[str] = []
    for command in (
        "tests/dsh-probe/controlled-skill-evaluation.spec.ts",
        "tests/dsh-probe/controlled-skill-evaluation-runtime.spec.ts",
        "tests/dsh-probe/controlled-skill-shadow.spec.ts",
        "tests/dsh-probe/controlled-skill-shadow-runtime.spec.ts",
        "tests/dsh-probe/controlled-skill-activation.spec.ts",
        "tests/dsh-probe/controlled-skill-activation-runtime.spec.ts",
        "tests/dsh-probe/controlled-real-skill-lifecycle-runner.spec.ts",
        "tests/dsh-migration/controlled-lifecycle-profile.spec.ts",
        "tests/dsh-migration/explicit-correction-product.e2e.spec.ts",
    ):
        if command not in typescript_job:
            violations.append(f"missing Ubuntu controlled contract: {command}")
    for forbidden in (
        "tests/dsh-migration/controlled-lifecycle-command.spec.ts",
        "tests/dsh-migration/runtime-bundle.spec.ts",
        "tests/dsh-migration/tianwen-installer.spec.ts",
    ):
        if forbidden in typescript_job:
            violations.append(f"Windows-owned spec remains in Ubuntu: {forbidden}")

    job_prelude, steps_marker, typescript_steps = typescript_job.partition(
        "    steps:\n"
    )
    assert steps_marker, "missing typescript steps"
    runs_on = [
        line.strip()
        for line in job_prelude.splitlines()
        if line.strip().startswith("runs-on:")
    ]
    assert runs_on == ["runs-on: ubuntu-latest"]
    fixture_root = "${{ runner.temp }}/tianwen-v0.1-eval-fixtures"
    if "TIANWEN_DSH_PROBE_ROOT" in job_prelude or "runner.temp" in job_prelude:
        violations.append("controlled fixture root remains at TypeScript job level")
    for command in (controlled_vitest,):
        expected_step = (
            f"      - run: {command}\n"
            "        env:\n"
            f"          TIANWEN_DSH_PROBE_ROOT: {fixture_root}"
        )
        if expected_step not in typescript_steps:
            violations.append(f"missing step-level controlled fixture root: {command}")

    for forbidden in (
        "TIANWEN_CONTROLLED_INSTALLED_E2E",
        "TIANWEN_DSH_PHASE2_STARTUP",
    ):
        if forbidden in ci:
            violations.append(f"automatic CI enables long installed E2E: {forbidden}")
    installer_match = re.search(
        r"(?ms)^  installer-windows:\n(?P<job>.*?)(?=^  [A-Za-z0-9_-]+:\n|\Z)",
        ci,
    )
    assert installer_match, "missing installer-windows job"
    if "tests/dsh-migration/controlled-lifecycle-profile.spec.ts" in installer_match.group("job"):
        violations.append("controlled Profile spec moved into installer-windows")
    assert not violations, "; ".join(violations)


def test_managed_rc6_install_migration_handoff() -> None:
    handoff = " ".join(
        (
            ROOT
            / "docs"
            / "operations"
            / "tianwen-rc6-rc7-managed-install-migration-handoff.md"
        ).read_text(encoding="utf-8").split()
    )

    for fact in (
        "DSH `0.1.0-rc.7` remains the only product Agent Runtime",
        "only the two complete installer-produced managed rc.6 layouts",
        "Arbitrary versions, partial, mixed, and modified installations remain unsupported",
        "Session and Evolution bytes are preserved",
        "not a second Runtime or a migration framework",
        "0 Provider requests, 0 paid tokens, 0 Docker, and no new Profile",
        "Stage 7 Task 8 remains pending until main CI is green and the real product migration completes",
    ):
        assert fact in handoff


def test_installer_safe_failure_stage_receipt_handoff_and_ci() -> None:
    handoff = " ".join(
        (
            ROOT
            / "docs"
            / "operations"
            / "tianwen-rc6-rc7-managed-install-migration-handoff.md"
        ).read_text(encoding="utf-8").split()
    )
    ci = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")

    assert "tests/dsh-migration/tianwen-installer.spec.ts" in ci
    for fact in (
        "non-persistent closed safe receipt",
        "does not preserve raw child diagnostics",
        "does not prove durable-data equality",
        "reports its stage and stops",
        "only successful migration can precede the separately authorized same Goal/manifest configured-Provider resume",
        "installer-internal",
        "node --run install:tianwen -- --data-dir D:\\DevData\\tianwen --json",
        "ordinary pnpm lifecycle presentation is not a machine-readable transport",
        "direct installer-source invocation",
        "pnpm wrapper transport",
        "raw JSON scanning",
        "raw-output retention",
        "schema changes",
    ):
        assert fact in handoff


def test_installer_build_output_isolation_handoff() -> None:
    handoff = " ".join(
        (
            ROOT
            / "docs"
            / "operations"
            / "tianwen-rc6-rc7-managed-install-migration-handoff.md"
        ).read_text(encoding="utf-8").split()
    )

    for fact in (
        "crossed a pnpm hardlink into the installed Profile before Profile backup",
        "isolates the fixed generated build outputs before the first build",
        "independent file identity from the workspace",
        "raw-equal",
        "raw double-pack comparison remains unchanged",
        "supervisor authorization boundary, not a persisted product degraded marker",
        "0 Provider, Goal, or model activity",
        "repository-root LICENSE is the authoritative publication source",
        "fifteen-file predecessor is accepted",
        "sixteen-file detached publication is a success postcondition",
    ):
        assert fact in handoff


def test_goal_status_spec_runs_in_typescript_focused_contract() -> None:
    ci = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
    typescript_match = re.search(
        r"(?ms)^  typescript:\n(?P<job>.*?)(?=^  [A-Za-z0-9_-]+:\n|\Z)",
        ci,
    )
    assert typescript_match, "missing typescript job"
    assert "tests/dsh-migration/goal-status.spec.ts" in typescript_match.group("job")


def test_installer_windows_job_isolated_from_ubuntu_vitest_contract() -> None:
    ci = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
    job_match = re.search(
        r"(?ms)^  installer-windows:\n(?P<job>.*?)(?=^  [A-Za-z0-9_-]+:\n|\Z)",
        ci,
    )
    assert job_match, "missing installer-windows job"
    installer_job = textwrap.dedent(job_match.group("job")).strip()
    profile_concurrent_command = "node tests/dsh-migration/profile-concurrent-boot.mjs"
    installer_command = "pnpm exec vitest run tests/dsh-migration/tianwen-installer.spec.ts"
    windows_vitest_command = (
        "pnpm exec vitest run tests/dsh-migration/tianwen-installer.spec.ts "
        "tests/dsh-migration/controlled-lifecycle-command.spec.ts "
        "tests/dsh-migration/runtime-bundle.spec.ts "
        "tests/dsh-migration/one-shot-profile-lifecycle.spec.ts "
        "tests/dsh-migration/learn-loop-host.spec.ts"
    )
    expected_installer_job = textwrap.dedent(
        """\
        runs-on: windows-latest
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
          - run: pnpm --filter @tianwen/runtime-bundle... build
          - name: Run installer contract
            shell: pwsh
            run: |
              $mappedDrive = $false
              if (-not (Test-Path -LiteralPath 'D:\\')) {
                & subst.exe D: $env:RUNNER_TEMP
                if ($LASTEXITCODE -ne 0) { throw 'temporary D: mapping failed' }
                $mappedDrive = $true
              }
              $testExit = 0
              try {
                New-Item -ItemType Directory -Force -Path 'D:\\DevData' | Out-Null
                {profile_concurrent_command}
                if ($LASTEXITCODE -ne 0) { throw 'Profile concurrent cold-boot check failed' }
                {windows_vitest_command}
                $testExit = $LASTEXITCODE
              } finally {
                if ($mappedDrive) { & subst.exe D: /D }
              }
              exit $testExit"""
        .replace("{profile_concurrent_command}", profile_concurrent_command)
        .replace("{windows_vitest_command}", windows_vitest_command),
    ).strip()
    assert installer_job == expected_installer_job

    typescript_match = re.search(
        r"(?ms)^  typescript:\n(?P<job>.*?)(?=^  [A-Za-z0-9_-]+:\n|\Z)",
        ci,
    )
    assert typescript_match, "missing typescript job"
    typescript_job = typescript_match.group("job")
    for windows_owned_spec in (
        profile_concurrent_command,
        installer_command.split("pnpm exec vitest run ", maxsplit=1)[1],
        "tests/dsh-migration/controlled-lifecycle-command.spec.ts",
        "tests/dsh-migration/runtime-bundle.spec.ts",
        "tests/dsh-migration/one-shot-profile-lifecycle.spec.ts",
        "tests/dsh-migration/learn-loop-host.spec.ts",
    ):
        assert windows_owned_spec not in typescript_job
    assert "tests/dsh-probe/controlled-real-skill-lifecycle-runner.spec.ts" not in installer_job

    amended_workflow = ci.lower()
    for forbidden in PERSONAL_PATH_PREFIXES:
        assert forbidden.lower() not in amended_workflow
    assert not re.search(r"(?i)(?:TODO|TBD|FIXME|PLACEHOLDER|REPLACE_ME)", ci)


def test_one_shot_profile_lifecycle_repair_public_facts() -> None:
    readme_en = " ".join(read_public_document("README.md").split()).lower()
    readme_zh = " ".join(read_public_document("README.zh-CN.md").split()).lower()
    architecture = " ".join(
        (ROOT / "docs" / "tianwen-architecture-overview-v2.md")
        .read_text(encoding="utf-8")
        .split()
    ).lower()
    handoff_path = (
        ROOT
        / "docs"
        / "operations"
        / "tianwen-v0.1-one-shot-profile-lifecycle-repair-handoff.md"
    )
    assert handoff_path.is_file(), "missing one-shot Profile lifecycle repair handoff"
    handoff = " ".join(handoff_path.read_text(encoding="utf-8").split()).lower()

    for document, atoms in (
        (
            readme_en,
            (
                "dsh/hmr", "watcher-readiness", "owns", "deepseek", "model-use receipt",
                "persisted", "exit 13", "historically consumed", "offline recovery", "succeeded",
                "controlled-lifecycle", "invocation=0",
                "model activation", "product setup", "do not consume a formal activity",
                "does not claim real provider success", "historical classifications", "not rewritten",
                "activity-22", "returned `passed`",
            ),
        ),
        (
            readme_zh,
            (
                "dsh/hmr", "watcher readiness", "拥有", "deepseek", "model-use receipt",
                "已持久化", "exit 13", "仍已消费", "offline 恢复", "均成功", "controlled-lifecycle",
                "invocation=0", "模型激活",
                "不消费正式 activity", "不声称真实 provider 成功", "历史分类", "不被改写",
                "activity-22", "返回 `passed`",
            ),
        ),
        (
            architecture,
            (
                "dsh/hmr", "watcher readiness", "负责", "deepseek", "model-use receipt",
                "已持久化", "exit 13", "仍已消费", "offline 恢复", "均成功", "controlled-lifecycle",
                "invocation=0", "模型激活",
                "不消费正式 activity", "历史分类", "不被改写",
                "activity-22", "返回 `passed`",
            ),
        ),
        (
            handoff,
            (
                "dsh/hmr", "deepseek", "receipt", "persisted", "exit 13", "before lifecycle",
                "historically consumed", "offline recovery", "succeeded", "controlled-lifecycle",
                "invocation remained 0",
                "hmr watcher readiness", "model activation", "does not consume a formal activity",
                "first future", "consumes", "does not claim real provider success", "classifications",
                "remain unchanged",
            ),
        ),
    ):
        for atom in atoms:
            assert atom in document
        for activity in ("activity-01", "activity-02", "activity-03"):
            assert activity in document


def test_architecture_lists_current_controlled_lifecycle_evidence_first() -> None:
    architecture_path = ROOT / "docs" / "tianwen-architecture-overview-v2.md"
    raw_architecture = architecture_path.read_text(encoding="utf-8")
    architecture = " ".join(raw_architecture.split())

    assert "## 当前状态（2026-09-01）" in raw_architecture
    current_handoff = "tianwen-v0.1-controlled-real-activity-22-handoff.md"
    historical_activity_authorities = "Activity-01、Activity-02 和 Activity-03"
    assert current_handoff in architecture
    assert historical_activity_authorities in architecture
    assert architecture.index(current_handoff) < architecture.index(
        historical_activity_authorities
    )


def test_relative_links_in_public_documents_exist() -> None:
    for name in PUBLIC_DOCUMENTS:
        document = read_public_document(name)
        for target in relative_markdown_links(document):
            assert (ROOT / target).exists(), f"broken link in {name}: {target}"


def test_current_markdown_has_no_personal_path_prefixes() -> None:
    for directory, directories, filenames in os.walk(ROOT):
        directories[:] = [name for name in directories if name not in IGNORED_TREES]
        for filename in filenames:
            if not filename.endswith(".md"):
                continue
            path = Path(directory, filename)
            text = path.read_text(encoding="utf-8")
            for prefix in PERSONAL_PATH_PREFIXES:
                assert prefix not in text, f"personal path prefix in {path.relative_to(ROOT)}"
