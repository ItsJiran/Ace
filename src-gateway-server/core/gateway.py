"""Gateway facade managing all provider adapters."""

from typing import Dict, Optional
from adapters.base_adapter import BaseProviderAdapter
from adapters.openai_adapter import OpenAIAdapter
from adapters.google_adapter import GoogleAdapter
from adapters.anthropic_adapter import AnthropicAdapter
from models import ModelsResponse, TestResponseResult


class GatewayFacade:
    """Orchestrates all provider adapters and routes requests appropriately."""

    # Supported SDK providers
    SUPPORTED_SDKS = ["openai", "google", "anthropic"]

    def __init__(self):
        """Initialize gateway with empty adapter registry."""
        self._adapters: Dict[str, BaseProviderAdapter] = {}

    def load_adapter(self, sdk: str, api_key: str) -> bool:
        """Load a provider adapter with the given API key.
        
        Args:
            sdk: Provider ID ("openai", "google", "anthropic")
            api_key: API key for the provider
            
        Returns:
            True if adapter loaded successfully, False otherwise
        """
        if sdk not in self.SUPPORTED_SDKS:
            return False

        try:
            if sdk == "openai":
                self._adapters[sdk] = OpenAIAdapter(api_key)
            elif sdk == "google":
                self._adapters[sdk] = GoogleAdapter(api_key)
            elif sdk == "anthropic":
                self._adapters[sdk] = AnthropicAdapter(api_key)
            return True
        except Exception:
            return False

    def unload_adapter(self, sdk: str) -> bool:
        """Unload a provider adapter.
        
        Args:
            sdk: Provider ID
            
        Returns:
            True if adapter was unloaded, False if not loaded
        """
        if sdk in self._adapters:
            del self._adapters[sdk]
            return True
        return False

    def get_loaded_adapters(self) -> list[str]:
        """Get list of currently loaded adapter SDKs.
        
        Returns:
            List of loaded SDK IDs
        """
        return list(self._adapters.keys())

    def is_adapter_loaded(self, sdk: str) -> bool:
        """Check if an adapter is loaded.
        
        Args:
            sdk: Provider ID
            
        Returns:
            True if the adapter is loaded and ready
        """
        return sdk in self._adapters

    async def fetch_models(self, sdk: str) -> ModelsResponse:
        """Fetch models for the given SDK.
        
        Args:
            sdk: Provider ID ("openai", "google", "anthropic")
            
        Returns:
            ModelsResponse with models or error message
        """
        if sdk not in self._adapters:
            return ModelsResponse(
                ok=False,
                error_message=f"SDK '{sdk}' not loaded. Load it first with an API key."
            )

        adapter = self._adapters[sdk]
        return await adapter.fetch_models()

    async def test_response(self, sdk: str, model: str, prompt: str) -> TestResponseResult:
        """Test a completion with the given SDK.
        
        Args:
            sdk: Provider ID ("openai", "google", "anthropic")
            model: Model ID to test
            prompt: Prompt to send
            
        Returns:
            TestResponseResult with response or error info
        """
        if sdk not in self._adapters:
            return TestResponseResult(
                ok=False,
                error_message=f"SDK '{sdk}' not loaded. Load it first with an API key."
            )

        adapter = self._adapters[sdk]
        return await adapter.test_response(model, prompt)

    async def stream_response(self, sdk: str, model: str, prompt: str):
        """Stream a completion token-by-token for the given SDK.

        Args:
            sdk: Provider ID ("openai", "google", "anthropic")
            model: Model ID
            prompt: Prompt to send

        Yields:
            Raw text chunks from the provider
        """
        if sdk not in self._adapters:
            yield f"[error: SDK '{sdk}' not loaded. Load it first with an API key.]"
            return

        adapter = self._adapters[sdk]
        async for chunk in adapter.stream_response(model, prompt):
            yield chunk
