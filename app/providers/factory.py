from app.core.errors import AppError
from app.db.models import ModelConfig
from app.providers.anthropic import AnthropicProvider
from app.providers.base import LLMProvider
from app.providers.gemini import GeminiProvider
from app.providers.ollama import OllamaProvider
from app.providers.openai_compatible import OpenAICompatibleProvider


class ProviderFactory:
    _providers = {
        "openai-compatible": OpenAICompatibleProvider,
        "anthropic": AnthropicProvider,
        "gemini": GeminiProvider,
        "ollama": OllamaProvider,
    }

    @classmethod
    def from_model_config(cls, config: ModelConfig) -> LLMProvider:
        provider_cls = cls._providers.get(config.provider)
        if provider_cls is None:
            raise AppError(f"Unsupported provider: {config.provider}")
        return provider_cls(
            base_url=config.base_url,
            api_key=config.api_key,
            model=config.model,
            extra_config=config.extra_config,
        )
