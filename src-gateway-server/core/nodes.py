"""Compatibility facade for legacy imports of runtime snapshot helpers.

The original `nodes.py` mixed multiple active responsibilities:
- runtime snapshot construction for headers and stream events
- runtime activity event normalization

Those implementations now live in focused modules:
- `core.runtime_snapshot`
- `core.runtime_activity`

This facade keeps existing imports stable while the codebase migrates.
"""

from .runtime_activity import GatewayActivityEvent, build_activity_event
from .runtime_snapshot import (
    GatewayRuntimeSnapshot,
    GatewayTodoItem,
    GatewayTurnRecord,
    RuntimeStepSpec,
    RuntimeTransitionSpec,
    STEP_SPECS,
    TRANSITION_SPECS,
    agent_step,
    build_runtime_events,
    build_runtime_headers,
    build_runtime_snapshot,
    context_step,
    finalize_step,
    intake_step,
    memory_step,
    planning_step,
)

__all__ = [
    "GatewayActivityEvent",
    "GatewayRuntimeSnapshot",
    "GatewayTodoItem",
    "GatewayTurnRecord",
    "RuntimeStepSpec",
    "RuntimeTransitionSpec",
    "STEP_SPECS",
    "TRANSITION_SPECS",
    "agent_step",
    "build_runtime_events",
    "build_runtime_headers",
    "build_runtime_snapshot",
    "build_activity_event",
    "context_step",
    "finalize_step",
    "intake_step",
    "memory_step",
    "planning_step",
]
