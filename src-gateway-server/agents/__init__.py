"""Agent role packages for the gateway.

Each agent owns its own prompt files, profile declaration, and tool contract.
The runtime still binds them into one DeepAgent harness per request, but the
filesystem layout now follows the intended architecture:
- agents/coordinator/*
- agents/executor/*
- agents/tools/*
"""

from .coordinator import CoordinatorAgentProfile, build_coordinator_profile
from .executor import ExecutorAgentProfile, build_executor_profile

__all__ = [
    "CoordinatorAgentProfile",
    "ExecutorAgentProfile",
    "build_coordinator_profile",
    "build_executor_profile",
]
