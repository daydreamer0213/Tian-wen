from __future__ import annotations

import httpx
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.profiles.openai import OpenAIModelProfile
from pydantic_ai.providers.deepseek import DeepSeekProvider


def deepseek_chat_model(
    model_name: str = "deepseek-v4-pro",
    *,
    thinking: bool | None = None,
    http_client: httpx.AsyncClient | None = None,
) -> OpenAIChatModel:
    return OpenAIChatModel(
        model_name,
        provider=DeepSeekProvider(http_client=http_client),
        profile=OpenAIModelProfile(openai_chat_supports_max_completion_tokens=False),
        settings={"extra_body": {"thinking": {"type": "disabled"}}} if thinking is False else None,
    )
