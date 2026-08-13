from __future__ import annotations

import pytest
from pydantic_ai.models import infer_model


def test_deepseek_v4_pro_resolves_through_the_native_provider(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Break caught: dropping the OpenAI-compatible extra leaves documented DeepSeek support uninstallable."""
    monkeypatch.setenv("DEEPSEEK_API_KEY", "offline-contract-key")

    model = infer_model("deepseek:deepseek-v4-pro")

    assert model.model_id == "deepseek:deepseek-v4-pro"
    assert model.provider is not None
    assert model.provider.base_url == "https://api.deepseek.com"
