from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from agents import build_coordinator_profile
from agents.runtime_contract import AgentCurrentContext


def test_coordinator_profile_owns_tools_and_prompt_injection() -> None:
    profile = build_coordinator_profile()

    config = profile.build_invocation_config(AgentCurrentContext(
        user_prompt='Find the right tool for reading project files.',
        planning=['Understand the request'],
        context=['Repo is loaded in ACE.'],
        memory=['User prefers agentic workflow.'],
        orchestrator_plan=['Inspect capability', 'Request execution'],
        mirrored_ace_tools=[],
        known_ace_tools=[],
    ))

    assert profile.tools == (
        'update_session_plan',
        'update_session_context',
        'update_session_memory',
        'list_ace_tools',
        'search_ace_tools',
        'inspect_ace_tool',
        'suggest_missing_ace_tools',
        'request_ace_tool_execution',
    )
    assert config.tools == profile.tools
    assert config.memory == ['User prefers agentic workflow.']
    assert config.debug_payload['gateway_agent_memory_mode'] == 'deepagent_memory'
    assert 'Agent decision policy:' in config.system_prompt
    assert 'Runtime constraints:' in config.system_prompt
    assert 'Coordinator ACE catalog snapshot:' in config.system_prompt
    assert 'update_session_context' in config.system_prompt
    assert 'update_session_memory' in config.system_prompt
    assert 'list_ace_tools' in config.system_prompt
    assert 'search_ace_tools' in config.system_prompt
    assert 'inspect_ace_tool' in config.system_prompt
    assert 'request_ace_tool_execution' in config.system_prompt
    assert 'If the current plan is already correct and the needed tool is already visible' in config.system_prompt
    assert 'continue forward instead of restarting orchestration from scratch' in config.system_prompt
    assert 'Complete all gateway-tool calls you already know are required for the current pass in the same request whenever possible' in config.system_prompt
    assert 'Gateway discovery/execution-intent tools already append structured session context automatically' in config.system_prompt
    assert 'Memory snapshot:' not in config.system_prompt
    assert 'Coordinator tool contract:' not in config.system_prompt
    assert 'Current ACE tool state:' not in config.system_prompt
    assert 'handoff' not in config.system_prompt.lower()
    assert 'executor' not in config.system_prompt.lower()
