from __future__ import annotations

from collections.abc import Callable

from .ace_catalog import merge_ace_tool_catalog, normalize_ace_tools, retain_known_ace_tools
from .tool_types import (
    AceToolDescriptor,
    ContextUpdated,
    GatewayContextRecord,
    GatewayToolContext,
    GatewayToolDescriptor,
    KnownToolsUpdated,
    MemoryUpdated,
    PlanUpdated,
    EnqueueAceToolIntent,
    WaitForAceToolResult,
)
from .inspect_ace_tool import DESCRIPTOR as INSPECT_ACE_TOOL_DESCRIPTOR, create_tool as create_inspect_ace_tool
from .list_ace_tools import DESCRIPTOR as LIST_ACE_TOOLS_DESCRIPTOR, create_tool as create_list_ace_tools
from .request_ace_tool_execution import DESCRIPTOR as REQUEST_ACE_TOOL_EXECUTION_DESCRIPTOR, create_tool as create_request_ace_tool_execution
from .search_ace_tools import DESCRIPTOR as SEARCH_ACE_TOOLS_DESCRIPTOR, create_tool as create_search_ace_tools
from .suggest_missing_ace_tools import DESCRIPTOR as SUGGEST_MISSING_ACE_TOOLS_DESCRIPTOR, create_tool as create_suggest_missing_ace_tools
from .update_session_context import DESCRIPTOR as UPDATE_SESSION_CONTEXT_DESCRIPTOR, create_tool as create_update_session_context
from .update_session_memory import DESCRIPTOR as UPDATE_SESSION_MEMORY_DESCRIPTOR, create_tool as create_update_session_memory
from .update_session_plan import DESCRIPTOR as UPDATE_SESSION_PLAN_DESCRIPTOR, create_tool as create_update_session_plan

_TOOL_ENTRIES: tuple[tuple[GatewayToolDescriptor, Callable[[GatewayToolContext], Callable]], ...] = (
    (UPDATE_SESSION_PLAN_DESCRIPTOR, create_update_session_plan),
    (UPDATE_SESSION_CONTEXT_DESCRIPTOR, create_update_session_context),
    (UPDATE_SESSION_MEMORY_DESCRIPTOR, create_update_session_memory),
    (LIST_ACE_TOOLS_DESCRIPTOR, create_list_ace_tools),
    (SEARCH_ACE_TOOLS_DESCRIPTOR, create_search_ace_tools),
    (INSPECT_ACE_TOOL_DESCRIPTOR, create_inspect_ace_tool),
    (SUGGEST_MISSING_ACE_TOOLS_DESCRIPTOR, create_suggest_missing_ace_tools),
    (REQUEST_ACE_TOOL_EXECUTION_DESCRIPTOR, create_request_ace_tool_execution),
)


def build_gateway_tool_descriptors() -> list[GatewayToolDescriptor]:
    return [descriptor for descriptor, _ in _TOOL_ENTRIES]


def build_gateway_tools(
    session_uid: str,
    mirrored_ace_tools: list[AceToolDescriptor],
    known_ace_tools: list[AceToolDescriptor] | None = None,
    on_known_tools_updated: KnownToolsUpdated | None = None,
    session_plan: list[str] | None = None,
    on_plan_updated: PlanUpdated | None = None,
    context_bank: list[GatewayContextRecord] | None = None,
    on_context_updated: ContextUpdated | None = None,
    memory_bank: list[str] | None = None,
    on_memory_updated: MemoryUpdated | None = None,
    wait_for_ace_tool_result: WaitForAceToolResult | None = None,
    enqueue_ace_tool_intent: EnqueueAceToolIntent | None = None,
    allowed_tool_names: tuple[str, ...] | None = None,
) -> list[Callable]:
    context = GatewayToolContext(
        session_uid=session_uid,
        mirrored_ace_tools=mirrored_ace_tools,
        known_ace_tools=known_ace_tools if known_ace_tools is not None else [],
        session_plan=session_plan if session_plan is not None else [],
        context_bank=context_bank if context_bank is not None else [],
        memory_bank=memory_bank if memory_bank is not None else [],
        on_known_tools_updated=on_known_tools_updated,
        on_plan_updated=on_plan_updated,
        on_context_updated=on_context_updated,
        on_memory_updated=on_memory_updated,
        wait_for_ace_tool_result=wait_for_ace_tool_result,
        enqueue_ace_tool_intent=enqueue_ace_tool_intent,
    )

    allowed = set(allowed_tool_names or ())
    tools: list[Callable] = []
    for descriptor, factory in _TOOL_ENTRIES:
        if allowed and descriptor["name"] not in allowed:
            continue
        tools.append(factory(context))
    return tools


__all__ = [
    "AceToolDescriptor",
    "GatewayContextRecord",
    "GatewayToolDescriptor",
    "build_gateway_tool_descriptors",
    "build_gateway_tools",
    "merge_ace_tool_catalog",
    "normalize_ace_tools",
    "retain_known_ace_tools",
]
