from __future__ import annotations

import os
import re
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
    assert "Candidate/Shadow/Promotion" in readme_en
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
        "DSH 0.1.0-rc.7",
        "no-case",
        "candidateCreated=false",
        "Candidate/Shadow/Promotion",
    ):
        assert fact in readme_en
        assert fact in readme_zh

    assert "read-only Evidence projection" in readme_en
    assert "not complete" in readme_en
    assert "Evidence 只读投影" in readme_zh
    assert "尚未完成" in readme_zh
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
    assert "Stage 3 已证明" in architecture
    assert "Candidate 仅为 `recorded`" in architecture
    assert "确定性的合成合同数据" in architecture


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
    assert "Stage 4 已证明" in architecture
    assert "成对、隔离的普通 DSH Agent" in architecture
    assert "脚本化机制证明" in architecture
    assert "INCONCLUSIVE" in architecture
    assert "零成本 scripted adapter" in architecture
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
    ):
        assert fact in handoff

    for command in (
        "pnpm --filter @tianwen/runtime-bundle... build",
        "tests/dsh-probe/natural-run-evidence-runtime.spec.ts",
        "tests/dsh-probe/natural-run-evidence-demo.spec.ts",
        "pnpm demo:natural-run-evidence",
    ):
        assert command in ci


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
