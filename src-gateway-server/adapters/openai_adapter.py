"""OpenAI provider adapter."""

import asyncio
import aiohttp
from adapters.base_adapter import BaseProviderAdapter
from models import AIModel, ModelsResponse, TestResponseResult


class OpenAIAdapter(BaseProviderAdapter):
    """Adapter for OpenAI API."""

    provider_id = "openai"
    provider_name = "OpenAI"

    def __init__(self, api_key: str):
        super().__init__(api_key)
        self.base_url = "https://api.openai.com/v1"
        self.timeout = aiohttp.ClientTimeout(total=9)

    async def fetch_models(self) -> ModelsResponse:
        """Fetch available models from OpenAI."""
        if not self.validate_api_key():
            return ModelsResponse(
                ok=False,
                error_message="OpenAI API key not configured."
            )

        try:
            async with aiohttp.ClientSession(timeout=self.timeout) as session:
                headers = {
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                }
                async with session.get(
                    f"{self.base_url}/models",
                    headers=headers
                ) as response:
                    if response.status != 200:
                        text = await response.text()
                        return ModelsResponse(
                            ok=False,
                            error_message=f"OpenAI API error: {response.status} - {text}"
                        )

                    data = await response.json()
                    models = []
                    for item in data.get("data", []):
                        # Filter to only OpenAI chat models (gpt-*)
                        if "gpt-" in item.get("id", ""):
                            models.append(AIModel(
                                id=item["id"],
                                name=item.get("id"),  # Use ID as display name
                                capabilities=["text", "tools"] if "gpt-" in item["id"] else ["text"],
                            ))

                    return ModelsResponse(ok=True, models=models)

        except asyncio.TimeoutError:
            return ModelsResponse(
                ok=False,
                error_message="OpenAI API request timed out (9s)"
            )
        except Exception as e:
            return ModelsResponse(
                ok=False,
                error_message=f"OpenAI fetch_models error: {str(e)}"
            )

    async def test_response(self, model: str, prompt: str) -> TestResponseResult:
        """Test a completion with OpenAI."""
        if not self.validate_api_key():
            return TestResponseResult(
                ok=False,
                error_message="OpenAI API key not configured."
            )

        try:
            import time
            start_time = time.time()

            async with aiohttp.ClientSession(timeout=self.timeout) as session:
                headers = {
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                }
                payload = {
                    "model": model or "gpt-3.5-turbo",
                    "messages": [{"role": "user", "content": prompt or "ping"}],
                    "max_tokens": 64,
                }

                async with session.post(
                    f"{self.base_url}/chat/completions",
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
                            error_message=f"OpenAI API error: {response.status}"
                        )

                    data = await response.json()
                    response_text = data.get("choices", [{}])[0].get("message", {}).get("content", "")

                    return TestResponseResult(
                        ok=True,
                        response=response_text,
                        latency_ms=latency_ms,
                        status_code=response.status,
                    )

        except asyncio.TimeoutError:
            return TestResponseResult(
                ok=False,
                error_message="OpenAI API request timed out (9s)"
            )
        except Exception as e:
            return TestResponseResult(
                ok=False,
                error_message=f"OpenAI test_response error: {str(e)}"
            )
