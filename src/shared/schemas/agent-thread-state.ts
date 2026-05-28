import { AgentThreadStateType } from './ai';

export interface AgentThreadHumanMessage {
    uid: string;
    content: string;
    timestamp: number;
}

export interface AgentThreadAIMessage {
    type: 'AIMessage';
    uid: string;
    content: string;
    tool_calls: Array<{
        name: string;
        args: Record<string, any>;
        id: string;
    }> | null;
    token_usage: {
        input: number;
        output: number;
        total: number;
    } | null;
    timestamp: number;
}

export interface AgentThreadToolMessage {
    type: 'ToolMessage';
    uid: string;
    tool_name: string;
    tool_call_id: string;
    content: string;
    timestamp: number;
}

export type AgentTurnResponseElement = AgentThreadAIMessage | AgentThreadToolMessage;

export interface AgentChatTurn {
    turn_id: string;
    human: AgentThreadHumanMessage;
    responses: AgentTurnResponseElement[];
}

export interface AgentClientThreadStateType extends Omit<AgentThreadStateType, 'messages'> {
    messages: AgentChatTurn[];
}

// future notes : move agent thread here...
