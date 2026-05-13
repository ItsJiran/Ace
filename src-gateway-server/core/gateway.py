"""Gateway facade managing the LangGraph runtime."""

from models import ModelsResponse, TestResponseResult
from core.graph_runtime import GraphRuntime
from core.model_registry import ModelRegistry, SUPPORTED_PROVIDERS


class GatewayFacade:
    """Compatibility facade that now delegates to LangGraph."""

    SUPPORTED_SDKS = list(SUPPORTED_PROVIDERS)

    def __init__(self):
        self._model_registry = ModelRegistry()
        self._graph_runtime = GraphRuntime(self._model_registry)

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

        return ModelsResponse(ok=True, models=self._model_registry.get_catalog(sdk))

    async def test_response(self, sdk: str, model: str, prompt: str) -> TestResponseResult:
        if not self._model_registry.has_provider(sdk):
            return TestResponseResult(
                ok=False,
                error_message=f"SDK '{sdk}' not loaded. Load it first with an API key.",
            )

        return await self._graph_runtime.test_response(sdk, model, prompt)

    async def stream_response(self, sdk: str, model: str, prompt: str, session_uid: str | None = None):
        if not self._model_registry.has_provider(sdk):
            yield f"[error: SDK '{sdk}' not loaded. Load it first with an API key.]"
            return

        async for chunk in self._graph_runtime.stream_response(sdk, model, prompt, session_uid):
            yield chunk

    def build_stream_headers(self, sdk: str, model: str, prompt: str, session_uid: str | None = None) -> dict[str, str]:
        return self._graph_runtime.build_stream_headers(sdk, model, prompt, session_uid)
