"""Agent role packages for the gateway.

The gateway now runs a single backend-owned ACE agent profile.
Supporting tools still live under agents/tools/*.
"""

from .coordinator import CoordinatorAgentProfile, build_coordinator_profile

__all__ = [
    "CoordinatorAgentProfile",
    "build_coordinator_profile",
]
