"""Base adapter interface for AI SDK providers."""

from abc import ABC, abstractmethod
from typing import List, Tuple
from models import AIModel, ModelsResponse, TestResponseResult


class BaseProviderAdapter(ABC):
    """Abstract base class for provider adapters."""

    provider_id: str = ""
    provider_name: str = ""

    def __init__(self, api_key: str):
        """Initialize adapter with API key."""
        self.api_key = api_key

    @abstractmethod
    async def fetch_models(self) -> ModelsResponse:
        """Fetch available models from the provider."""
        pass

    @abstractmethod
    async def test_response(self, model: str, prompt: str) -> TestResponseResult:
        """Test a completion with the given model and prompt."""
        pass

    def validate_api_key(self) -> bool:
        """Validate that API key is set."""
        return bool(self.api_key and len(self.api_key.strip()) > 0)
