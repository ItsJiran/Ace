"""Google Gemini provider adapter."""

import asyncio
import aiohttp
from adapters.base_adapter import BaseProviderAdapter
from models import AIModel, ModelsResponse, TestResponseResult


class GoogleAdapter(BaseProviderAdapter):
    """Adapter for Google Gemini API."""

    provider_id = "google"
    provider_name = "Google Gemini"

    def __init__(self, api_key: str):
        super().__init__(api_key)
        self.base_url = "https://generativelanguage.googleapis.com/v1beta"
        self.timeout = aiohttp.ClientTimeout(total=9)

    async def fetch_models(self) -> ModelsResponse:
        """Fetch available models from Google."""
        if not self.validate_api_key():
            return ModelsResponse(
                ok=False,
                error_message="Google API key not configured."
            )

        try:
            async with aiohttp.ClientSession(timeout=self.timeout) as session:
                async with session.get(
                    f"{self.base_url}/models",
                    params={"key": self.api_key}
                ) as response:
                    if response.status != 200:
                        text = await response.text()
                        return ModelsResponse(
                            ok=False,
                            error_message=f"Google API error: {response.status} - {text}"
                        )

                    data = await response.json()
                    models = []
                    for item in data.get("models", []):
                        model_name = item.get("name", "").replace("models/", "")
                        # Filter to only generative AI models
                        if any(x in model_name for x in ["gemini", "palm"]):
                            models.append(AIModel(
                                id=model_name,
                                name=model_name,
                                capabilities=["text", "multimodal"],
                            ))

                    return ModelsResponse(ok=True, models=models)

        except asyncio.TimeoutError:
            return ModelsResponse(
                ok=False,
                error_message="Google API request timed out (9s)"
            )
        except Exception as e:
            return ModelsResponse(
                ok=False,
                error_message=f"Google fetch_models error: {str(e)}"
            )

    async def test_response(self, model: str, prompt: str) -> TestResponseResult:
        """Test a generation with Google."""
        if not self.validate_api_key():
            return TestResponseResult(
                ok=False,
                error_message="Google API key not configured."
            )

        try:
            import time
            start_time = time.time()

            async with aiohttp.ClientSession(timeout=self.timeout) as session:
                headers = {
                    "Content-Type": "application/json",
                }
                payload = {
                    "contents": [{
                        "parts": [{"text": prompt or "ping"}]
                    }],
                    "generationConfig": {
                        "maxOutputTokens": 64,
                    }
                }
                model_param = model or "gemini-pro"

                async with session.post(
                    f"{self.base_url}/models/{model_param}:generateContent",
                    json=payload,
                    params={"key": self.api_key},
                    headers=headers
                ) as response:
                    latency_ms = int((time.time() - start_time) * 1000)

                    if response.status != 200:
                        text = await response.text()
                        return TestResponseResult(
                            ok=False,
                            latency_ms=latency_ms,
                            status_code=response.status,
                            error_message=f"Google API error: {response.status}"
                        )

                    data = await response.json()
                    response_text = ""
                    try:
                        candidates = data.get("candidates", [])
                        if candidates:
                            content = candidates[0].get("content", {})
                            parts = content.get("parts", [])
                            if parts:
                                response_text = parts[0].get("text", "")
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
                error_message="Google API request timed out (9s)"
            )
        except Exception as e:
            return TestResponseResult(
                ok=False,
                error_message=f"Google test_response error: {str(e)}"
            )

    async def stream_response(self, model: str, prompt: str):
        """Stream a completion from Google Gemini token-by-token."""
        import json
        if not self.validate_api_key():
            yield "[error: Google API key not configured]"
            return

        stream_timeout = aiohttp.ClientTimeout(total=120)
        model_id = model or "gemini-pro"
        url = f"{self.base_url}/models/{model_id}:streamGenerateContent"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
        }
        try:
            async with aiohttp.ClientSession(timeout=stream_timeout) as session:
                async with session.post(
                    url,
                    json=payload,
                    params={"key": self.api_key, "alt": "sse"},
                    headers={"Content-Type": "application/json"},
                ) as response:
                    if response.status != 200:
                        text = await response.text()
                        yield f"[error: Google {response.status} - {text[:200]}]"
                        return

                    async for raw_line in response.content:
                        line = raw_line.decode("utf-8").rstrip("\n")
                        if not line.startswith("data: "):
                            continue
                        data = line[6:]
                        try:
                            obj = json.loads(data)
                            candidates = obj.get("candidates", [])
                            if candidates:
                                parts = candidates[0].get("content", {}).get("parts", [])
                                if parts:
                                    token = parts[0].get("text", "")
                                    if token:
                                        yield token
                        except (json.JSONDecodeError, KeyError, IndexError):
                            continue
        except asyncio.TimeoutError:
            yield "[error: Google stream timed out]"
        except Exception as e:
            yield f"[error: {str(e)}]"
