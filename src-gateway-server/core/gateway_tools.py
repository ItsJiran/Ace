"""Compatibility facade for gateway-defined agent tools.

The runtime and tests still import this module, but the actual source of truth
now lives under `agents/tools/*` so tools can be declared and maintained next to
agent-owned contracts instead of one monolithic core module.
"""

from agents.tools import (
    AceToolDescriptor,
    GatewayToolDescriptor,
    build_gateway_tool_descriptors,
    build_gateway_tools,
    merge_ace_tool_catalog,
    normalize_ace_tools,
    retain_known_ace_tools,
)

__all__ = [
    "AceToolDescriptor",
    "GatewayToolDescriptor",
    "build_gateway_tool_descriptors",
    "build_gateway_tools",
    "merge_ace_tool_catalog",
    "normalize_ace_tools",
    "retain_known_ace_tools",
]
