"""Data Transfer Objects (DTOs) for the gateway server."""

from dataclasses import dataclass, field
from typing import Any, Optional, List


@dataclass
class AIModel:
    """Represents an AI model from a provider."""
    id: str
    name: str
    context_window: Optional[int] = None
    capabilities: List[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'name': self.name,
            'context_window': self.context_window,
            'capabilities': self.capabilities,
        }


@dataclass
class ModelsResponse:
    """Response from fetching available models."""
    ok: bool
    models: List[AIModel] = field(default_factory=list)
    error_message: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            'ok': self.ok,
            'models': [m.to_dict() for m in self.models],
            'error_message': self.error_message,
        }


@dataclass
class TestResponseResult:
    """Response from testing a completion."""
    ok: bool
    response: str = ""
    latency_ms: int = 0
    status_code: Optional[int] = None
    error_message: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            'ok': self.ok,
            'response': self.response,
            'latency_ms': self.latency_ms,
            'status_code': self.status_code,
            'error_message': self.error_message,
        }


@dataclass
class HealthResponse:
    """Health check response."""
    ok: bool
    gateway_name: str = "ace-deepagent-gateway-server"
    gateway_contract_version: str = "2.0.0"
    base_url: str = ""
    port: Optional[int] = None
    loaded_adapters: List[str] = field(default_factory=list)
    error_message: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            'ok': self.ok,
            'gateway_name': self.gateway_name,
            'gateway_contract_version': self.gateway_contract_version,
            'base_url': self.base_url,
            'port': self.port,
            'loaded_adapters': self.loaded_adapters,
            'error_message': self.error_message,
        }
