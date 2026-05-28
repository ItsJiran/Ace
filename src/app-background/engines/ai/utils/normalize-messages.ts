import {
    AgentChatTurn,
    AgentThreadAIMessage,
    AgentThreadToolMessage,
} from '#/shared/schemas/agent-thread-state';

function extractTextContent(content: any): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content
            .map((block) => (typeof block === 'object' ? block.text || block.data || '' : block))
            .join('');
    }
    return '';
}

export default (rawMessages: any[]): AgentChatTurn[] => {
    if (!Array.isArray(rawMessages)) return [];

    const turns: AgentChatTurn[] = [];
    let currentTurn: AgentChatTurn | null = null;

    const ensureTurn = (msgId: string) => {
        if (!currentTurn) {
            currentTurn = {
                turn_id: `auto-${msgId}`,
                human: { uid: 'dummy', content: '', timestamp: Date.now() },
                responses: [],
            };
        }
    };

    for (const msg of rawMessages) {
        if (!msg) continue;

        const kwargs = msg.kwargs || {};
        const msgId = kwargs.id || (Array.isArray(msg.id) ? msg.id[msg.id.length - 1] : 'unknown');
        const className = Array.isArray(msg.id) ? msg.id[msg.id.length - 1] : '';
        const msgType = msg.type;

        if (className === 'HumanMessage' || msgType === 'human') {
            if (currentTurn) {
                turns.push(currentTurn);
            }

            currentTurn = {
                turn_id: msgId,
                human: {
                    uid: msgId,
                    content: extractTextContent(kwargs.content || msg.content),
                    timestamp: Date.now(),
                },
                responses: [],
            };
        } else if (className === 'AIMessage' || msgType === 'ai') {
            ensureTurn(msgId);
            const usage = kwargs.usage_metadata || {};

            const aiMsg: AgentThreadAIMessage = {
                type: 'AIMessage',
                uid: msgId,
                content: extractTextContent(kwargs.content || msg.content),
                tool_calls:
                    Array.isArray(kwargs.tool_calls) && kwargs.tool_calls.length > 0
                        ? kwargs.tool_calls
                        : null,
                token_usage: kwargs.usage_metadata
                    ? {
                          input: usage.input_tokens || 0,
                          output: usage.output_tokens || 0,
                          total: usage.total_tokens || 0,
                      }
                    : null,
                timestamp: Date.now(),
            };

            currentTurn?.responses.push(aiMsg);
        } else if (className === 'ToolMessage' || msgType === 'tool') {
            ensureTurn(msgId);

            const toolMsg: AgentThreadToolMessage = {
                type: 'ToolMessage',
                uid: msgId,
                tool_name: kwargs.name || msg.name || 'unknown_tool',
                tool_call_id: kwargs.tool_call_id || msg.tool_call_id || '',
                content: extractTextContent(kwargs.content || msg.content),
                timestamp: Date.now(),
            };

            currentTurn?.responses.push(toolMsg);
        }
    }

    if (currentTurn) {
        turns.push(currentTurn);
    }

    return turns;
}
