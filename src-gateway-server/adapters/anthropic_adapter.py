"""Anthropic Claude provider adapter."""

import asyncio
import aiohttp
from adapters.base_adapter import BaseProviderAdapter
from models import AIModel, ModelsResponse, TestResponseResult


class AnthropicAdapter(BaseProviderAdapter):
    """Adapter for Anthropic Claude API."""

    provider_id = "anthropic"
    provider_name = "Anthropic Claude"

    def __init__(self, api_key: str):
        super().__init__(api_key)
        self.base_url = "https://api.anthropic.com/v1"
        self.timeout = aiohttp.ClientTimeout(total=9)
        # Current Anthropic API version (may need updates)
        self.api_version = "2024-01-15"

    async def fetch_models(self) -> ModelsResponse:
        """Fetch available models from Anthropic.
        
        Note: Anthropic doesn't provide a public models list endpoint.
        We return a hardcoded list of known available models.
        """
        if not self.validate_api_key():
            return ModelsResponse(
                ok=False,
                error_message="Anthropic API key not configured."
            )

        # Anthropic doesn't provide a models endpoint, so we use known models
        try:
            models = [
                AIModel(id="claude-3-opus-20240229", name="Claude 3 Opus", capabilities=["text", "vision"]),
                AIModel(id="claude-3-sonnet-20240229", name="Claude 3 Sonnet", capabilities=["text", "vision"]),
                AIModel(id="claude-3-haiku-20240307", name="Claude 3 Haiku", capabilities=["text", "vision"]),
                AIModel(id="claude-2.1", name="Claude 2.1", capabilities=["text"]),
                AIModel(id="claude-2", name="Claude 2", capabilities=["text"]),
            ]
            return ModelsResponse(ok=True, models=models)

        except Exception as e:
            return ModelsResponse(
                ok=False,
                error_message=f"Anthropic fetch_models error: {str(e)}"
            )

    async def test_response(self, model: str, prompt: str) -> TestResponseResult:
        """Test a message with Anthropic Claude."""
        if not self.validate_api_key():
            return TestResponseResult(
                ok=False,
                error_message="Anthropic API key not configured."
            )

        try:
            import time
            start_time = time.time()

            async with aiohttp.ClientSession(timeout=self.timeout) as session:
                headers = {
                    "x-api-key": self.api_key,
                    "anthropic-version": self.api_version,
                    "Content-Type": "application/json",
                }
                payload = {
                    "model": model or "claude-3-sonnet-20240229",
                    "max_tokens": 64,
                    "messages": [{"role": "user", "content": prompt or "ping"}],
                }

                async with session.post(
                    f"{self.base_url}/messages",
                    json=payload,
                    headers=headers
                ) as response:
                    latency_ms = int((time.time() - start_time) * 1000)

                    if response.status != 200:
                        text = await response.text()
                        return TestResponseResult(
                            ok=False,
                            latency_ms=latency_ms,
                            status_code=response.status,
                            error_message=f"Anthropic API error: {response.status}"
                        )

                    data = await response.json()
                    response_text = ""
                    try:
                        content = data.get("content", [])
                        if content and isinstance(content, list):
                            response_text = content[0].get("text", "")
                    except (KeyError, IndexError, TypeError):
                        pass

                    return TestResponseResult(
                        ok=True,
                        response=response_text,
                        latency_ms=latency_ms,
                        status_code=response.status,
                    )

        except asyncio.TimeoutError:
            return TestResponseResult(
                ok=False,
                error_message="Anthropic API request timed out (9s)"
            )
        except Exception as e:
            return TestResponseResult(
                ok=False,
                error_message=f"Anthropic test_response error: {str(e)}"
            )
