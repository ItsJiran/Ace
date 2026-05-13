"""Provider/model resolution for the DeepAgents gateway runtime."""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from typing import Dict, List
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from models import AIModel


SUPPORTED_PROVIDERS = ("openai", "google", "anthropic")


@dataclass(frozen=True)
class ProviderBinding:
    provider: str
    api_key: str


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

    async def fetch_catalog(self, provider: str) -> List[AIModel]:
        binding = self._bindings.get(provider)
        if not binding:
            raise ValueError(f"Provider '{provider}' not registered.")

        fetcher = {
            "openai": self._fetch_openai_catalog,
            "google": self._fetch_google_catalog,
            "anthropic": self._fetch_anthropic_catalog,
        }.get(provider)

        if fetcher is None:
            raise ValueError(f"Unsupported provider '{provider}'.")

        try:
            return await asyncio.to_thread(fetcher, binding.api_key)
        except Exception as exc:
            raise RuntimeError(f"Failed to fetch live model catalog for provider '{provider}'.") from exc

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

    def _fetch_openai_catalog(self, api_key: str) -> List[AIModel]:
        request = Request(
            "https://api.openai.com/v1/models",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            method="GET",
        )
        try:
            with urlopen(request, timeout=15) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise RuntimeError(f"OpenAI model listing failed with HTTP {exc.code}: {detail}") from exc
        except URLError as exc:
            raise RuntimeError(f"OpenAI model listing failed: {exc.reason}") from exc

        models = [
            AIModel(id=item["id"], name=self._humanize_model_name(item["id"]), capabilities=["text", "stream", "tools"])
            for item in payload.get("data", [])
            if isinstance(item, dict) and isinstance(item.get("id"), str) and self._is_supported_chat_model("openai", item["id"])
        ]
        return self._sort_and_dedupe_models(models)

    def _fetch_google_catalog(self, api_key: str) -> List[AIModel]:
        from google import genai

        client = genai.Client(api_key=api_key)
        response = client.models.list()
        models = [
            AIModel(
                id=item.name,
                name=self._humanize_model_name(getattr(item, "display_name", None) or item.name),
                context_window=getattr(item, "input_token_limit", None),
                capabilities=["text", "stream", "tools"],
            )
            for item in response
            if self._is_supported_chat_model("google", item.name)
        ]
        return self._sort_and_dedupe_models(models)

    def _fetch_anthropic_catalog(self, api_key: str) -> List[AIModel]:
        from anthropic import Anthropic

        client = Anthropic(api_key=api_key)
        response = client.models.list()
        models = [
            AIModel(
                id=item.id,
                name=self._humanize_model_name(getattr(item, "display_name", None) or item.id),
                capabilities=["text", "stream", "tools"],
            )
            for item in getattr(response, "data", [])
            if self._is_supported_chat_model("anthropic", item.id)
        ]
        return self._sort_and_dedupe_models(models)

    def _sort_and_dedupe_models(self, models: List[AIModel]) -> List[AIModel]:
        deduped: Dict[str, AIModel] = {}
        for model in models:
            deduped[model.id] = model
        return sorted(deduped.values(), key=lambda model: model.name.lower())

    def _is_supported_chat_model(self, provider: str, model_id: str) -> bool:
        normalized = model_id.lower()

        blocked_keywords = (
            "audio",
            "embedding",
            "image",
            "moderation",
            "realtime",
            "search",
            "transcribe",
            "tts",
            "vision-preview",
            "whisper",
        )
        if any(keyword in normalized for keyword in blocked_keywords):
            return False

        if provider == "openai":
            return normalized.startswith(("gpt-", "o1", "o3", "o4"))
        if provider == "google":
            return "gemini" in normalized
        if provider == "anthropic":
            return normalized.startswith("claude")
        return True

    def _humanize_model_name(self, model_id: str) -> str:
        return model_id.replace("models/", "").replace("-", " ").title()