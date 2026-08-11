from importlib.metadata import version


def test_exact_dependency_versions() -> None:
    assert version("pydantic-ai-slim") == "2.18.0"
    assert version("pydantic-ai-harness") == "0.13.0"
