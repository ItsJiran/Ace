"""Agent role scaffolds for the gateway.

These profiles are intentionally lightweight for now. The current runtime still
uses one active DeepAgent path, but this folder defines the role split we want
for the next iteration:
- coordinator: classify, plan, and hand off
- executor: execute the response/tool path and package user-facing output
"""

from .coordinator import CoordinatorAgentProfile, build_coordinator_profile
from .executor import ExecutorAgentProfile, build_executor_profile

__all__ = [
    "CoordinatorAgentProfile",
    "ExecutorAgentProfile",
    "build_coordinator_profile",
    "build_executor_profile",
]
