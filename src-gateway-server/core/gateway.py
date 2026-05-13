"""Gateway facade managing the DeepAgents runtime."""

from models import ModelsResponse, TestResponseResult
from core.deepagent_runtime import DeepAgentRuntime
from core.model_registry import ModelRegistry, SUPPORTED_PROVIDERS


class GatewayFacade:
    """Compatibility facade that now delegates to DeepAgents."""

    SUPPORTED_SDKS = list(SUPPORTED_PROVIDERS)

    def __init__(self):
        self._model_registry = ModelRegistry()
        self._agent_runtime = DeepAgentRuntime(self._model_registry)

    def load_adapter(self, sdk: str, api_key: str) -> bool:
        return self._model_registry.register_provider(sdk, api_key)

    def unload_adapter(self, sdk: str) -> bool:
        return self._model_registry.unregister_provider(sdk)

    def get_loaded_adapters(self) -> list[str]:
        return self._model_registry.list_registered_providers()

    def is_adapter_loaded(self, sdk: str) -> bool:
        return self._model_registry.has_provider(sdk)

    async def fetch_models(self, sdk: str) -> ModelsResponse:
        if sdk not in self.SUPPORTED_SDKS:
            return ModelsResponse(ok=False, error_message=f"Unsupported SDK: {sdk}")

        try:
            return ModelsResponse(ok=True, models=await self._model_registry.fetch_catalog(sdk))
        except Exception as exc:
            return ModelsResponse(ok=False, models=[], error_message=str(exc))

    async def test_response(self, sdk: str, model: str, prompt: str, session_uid: str | None = None) -> TestResponseResult:
        if not self._model_registry.has_provider(sdk):
            return TestResponseResult(
                ok=False,
                error_message=f"SDK '{sdk}' not loaded. Load it first with an API key.",
            )

        return await self._agent_runtime.test_response(sdk, model, prompt, session_uid)

    async def stream_response(self, sdk: str, model: str, prompt: str, session_uid: str | None = None):
        if not self._model_registry.has_provider(sdk):
            yield f"[error: SDK '{sdk}' not loaded. Load it first with an API key.]"
            return

        async for chunk in self._agent_runtime.stream_response(sdk, model, prompt, session_uid):
            yield chunk

    def build_stream_headers(self, sdk: str, model: str, prompt: str, session_uid: str | None = None) -> dict[str, str]:
        return self._agent_runtime.build_stream_headers(sdk, model, prompt, session_uid)
