from __future__ import annotations

from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.profiles.openai import OpenAIModelProfile
from pydantic_ai.providers.deepseek import DeepSeekProvider


def deepseek_chat_model(model_name: str = "deepseek-v4-pro") -> OpenAIChatModel:
    return OpenAIChatModel(
        model_name,
        provider=DeepSeekProvider(),
        profile=OpenAIModelProfile(openai_chat_supports_max_completion_tokens=False),
    )
