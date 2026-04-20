"""Provider/model resolution for the LangGraph gateway runtime."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List

from models import AIModel


SUPPORTED_PROVIDERS = ("openai", "google", "anthropic")


@dataclass(frozen=True)
class ProviderBinding:
    provider: str
    api_key: str


DEFAULT_MODEL_CATALOG: Dict[str, List[AIModel]] = {
    "openai": [
        AIModel(id="gpt-4.1-mini", name="GPT-4.1 Mini", capabilities=["text", "stream", "tools"]),
        AIModel(id="gpt-4.1", name="GPT-4.1", capabilities=["text", "stream", "tools"]),
        AIModel(id="gpt-4o-mini", name="GPT-4o Mini", capabilities=["text", "stream", "tools"]),
    ],
    "google": [
        AIModel(id="gemini-2.5-flash", name="Gemini 2.5 Flash", capabilities=["text", "stream", "tools"]),
        AIModel(id="gemini-2.5-pro", name="Gemini 2.5 Pro", capabilities=["text", "stream", "tools"]),
        AIModel(id="gemini-2.0-flash", name="Gemini 2.0 Flash", capabilities=["text", "stream", "tools"]),
    ],
    "anthropic": [
        AIModel(id="claude-3-5-sonnet-latest", name="Claude 3.5 Sonnet", capabilities=["text", "stream", "tools"]),
        AIModel(id="claude-3-7-sonnet-latest", name="Claude 3.7 Sonnet", capabilities=["text", "stream", "tools"]),
        AIModel(id="claude-3-5-haiku-latest", name="Claude 3.5 Haiku", capabilities=["text", "stream", "tools"]),
    ],
}


class ModelRegistry:
    """Resolves provider bindings, model catalogs, and chat model instances."""

    def __init__(self):
        self._bindings: Dict[str, ProviderBinding] = {}

    def register_provider(self, provider: str, api_key: str) -> bool:
        if provider not in SUPPORTED_PROVIDERS:
            return False
        self._bindings[provider] = ProviderBinding(provider=provider, api_key=api_key)
        return True

    def list_registered_providers(self) -> List[str]:
        return list(self._bindings.keys())

    def unregister_provider(self, provider: str) -> bool:
        if provider not in self._bindings:
            return False
        del self._bindings[provider]
        return True

    def get_catalog(self, provider: str) -> List[AIModel]:
        return list(DEFAULT_MODEL_CATALOG.get(provider, []))

    def has_provider(self, provider: str) -> bool:
        return provider in self._bindings

    def build_chat_model(self, provider: str, model: str):
        binding = self._bindings.get(provider)
        if not binding:
            raise ValueError(f"Provider '{provider}' not registered.")

        if provider == "openai":
            from langchain_openai import ChatOpenAI

            return ChatOpenAI(model=model, api_key=binding.api_key, temperature=0)

        if provider == "google":
            from langchain_google_genai import ChatGoogleGenerativeAI

            return ChatGoogleGenerativeAI(model=model, google_api_key=binding.api_key, temperature=0)

        if provider == "anthropic":
            from langchain_anthropic import ChatAnthropic

            return ChatAnthropic(model=model, api_key=binding.api_key, temperature=0)

        raise ValueError(f"Unsupported provider '{provider}'.")