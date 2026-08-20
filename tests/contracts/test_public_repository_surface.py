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
    assert "Candidate/Shadow/Promotion" in readme_en
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
    assert "Alpha 是实验与评测资产，不是第二套产品运行时。" in readme_zh


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
