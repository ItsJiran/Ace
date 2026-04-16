from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from adapters.openai_adapter import build_openai_messages


def test_build_openai_messages_keeps_plain_prompt_as_user_message() -> None:
    messages = build_openai_messages("hello there")

    assert messages == [{"role": "user", "content": "hello there"}]


def test_build_openai_messages_splits_composed_prompt_into_system_and_user() -> None:
    prompt = """[DEFAULT CONTEXT] You are ACE Assistant.

[GENERAL CONSTRAINTS]
- Follow state.

[CURRENT STATE]
- The current active state is Reason.

[CURRENT INPUT]
halo"""

    messages = build_openai_messages(prompt)

    assert messages[0]["role"] == "system"
    assert "[CURRENT INPUT]" not in messages[0]["content"]
    assert "[CURRENT STATE]" in messages[0]["content"]
    assert messages[1] == {"role": "user", "content": "halo"}


def test_build_openai_messages_uses_continuation_fallback_when_no_current_input_exists() -> None:
    prompt = """[DEFAULT CONTEXT] You are ACE Assistant.

[CURRENT STATE]
- This is a continuation pass inside the same user turn.

[LIST PASSED OFF PROMPT]
- Continue from the previous result."""

    messages = build_openai_messages(prompt)

    assert messages[0]["role"] == "system"
    assert messages[0]["content"] == prompt
    assert messages[1] == {
        "role": "user",
        "content": "Continue based on the system instructions and current session state.",
    }