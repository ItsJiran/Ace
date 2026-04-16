"""OpenAI provider adapter."""

import asyncio
import aiohttp
from typing import List
from adapters.base_adapter import BaseProviderAdapter
from models import AIModel, ModelsResponse, TestResponseResult


COMPOSED_PROMPT_MARKERS = (
    "[DEFAULT CONTEXT]",
    "[GENERAL CONSTRAINTS]",
    "[CURRENT STATE]",
    "[PARSER REGISTRY OVERVIEW]",
)


def build_openai_messages(
    prompt: str,
    fallback_user_prompt: str = "Continue based on the system instructions and current session state.",
) -> List[dict[str, str]]:
    normalized_prompt = (prompt or "").strip()

    if normalized_prompt == "":
        return [{"role": "user", "content": fallback_user_prompt}]

    if not any(marker in normalized_prompt for marker in COMPOSED_PROMPT_MARKERS):
        return [{"role": "user", "content": normalized_prompt}]

    system_prompt = normalized_prompt
    user_prompt = ""

    if "[CURRENT INPUT]" in normalized_prompt:
        system_prompt, current_input = normalized_prompt.split("[CURRENT INPUT]", 1)
        system_prompt = system_prompt.strip()
        user_prompt = current_input.strip()

    messages: List[dict[str, str]] = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})

    messages.append({"role": "user", "content": user_prompt or fallback_user_prompt})
    return messages


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
                    "messages": build_openai_messages(prompt or "ping", fallback_user_prompt="ping"),
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

    async def stream_response(self, model: str, prompt: str):
        """Stream a completion from OpenAI token-by-token."""
        import json
        if not self.validate_api_key():
            yield f"[error: OpenAI API key not configured]"
            return

        stream_timeout = aiohttp.ClientTimeout(total=120)
        try:
            async with aiohttp.ClientSession(timeout=stream_timeout) as session:
                headers = {
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                }
                payload = {
                    "model": model or "gpt-4o-mini",
                    "messages": build_openai_messages(prompt),
                    "stream": True,
                }
                async with session.post(
                    f"{self.base_url}/chat/completions",
                    json=payload,
                    headers=headers,
                ) as response:
                    if response.status != 200:
                        text = await response.text()
                        yield f"[error: OpenAI {response.status} - {text[:200]}]"
                        return

                    async for raw_line in response.content:
                        line = raw_line.decode("utf-8").rstrip("\n")
                        if not line.startswith("data: "):
                            continue
                        data = line[6:]
                        if data == "[DONE]":
                            break
                        try:
                            obj = json.loads(data)
                            token = obj["choices"][0]["delta"].get("content", "")
                            if token:
                                yield token
                        except (json.JSONDecodeError, KeyError, IndexError):
                            continue
        except asyncio.TimeoutError:
            yield "[error: OpenAI stream timed out]"
        except Exception as e:
            yield f"[error: {str(e)}]"
