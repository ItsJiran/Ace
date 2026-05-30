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

// + ----------------- Base Tool Message -----------------

export interface AgentThreadToolMessage {
    type: 'ToolMessage';
    uid: string;
    tool_name: string;
    tool_call_id: string;
    content: string;
    timestamp: number;
    /** Discriminator populated by normalize-messages so renderers can branch by category. */
    tool_kind?: AgentThreadToolMessageKind;
    /** Parsed structured payload populated by normalize-messages based on tool_name. */
    parsed?: Record<string, unknown>;
}

// + ----------------- Detailed Tool Message Subtypes -----------------
// Pattern mirrors AgentClientThreadEphemeralItem — a base with a kind discriminator
// that lets renderers branch on tool category without sniffing tool_name strings.

export type AgentThreadToolMessageKind = 'filesystem' | 'window' | 'error' | 'generic';

export interface AgentThreadToolMessageBase {
    type: 'ToolMessage';
    uid: string;
    tool_name: string;
    tool_call_id: string;
    content: string;
    timestamp: number;
    tool_kind: AgentThreadToolMessageKind;
    /** Parsed payload — populated in normalize-messages based on tool_name. */
    parsed?: Record<string, unknown>;
}

export interface AgentThreadFilesystemToolMessage extends AgentThreadToolMessageBase {
    tool_kind: 'filesystem';
    tool_name: string;
    parsed?: {
        path?: string;
        paths?: string[];
        entries?: unknown[];
        stdout?: string;
        stderr?: string;
        cwd?: string;
        command?: string;
        match_count?: number;
        file_count?: number;
    };
}

export interface AgentThreadWindowToolMessage extends AgentThreadToolMessageBase {
    tool_kind: 'window';
    tool_name: string;
    parsed?: {
        action?: string;
        window_uid?: string;
        window_count?: number;
        windows?: Record<string, unknown>[];
    };
}

export interface AgentThreadErrorToolMessage extends AgentThreadToolMessageBase {
    tool_kind: 'error';
    tool_name: string;
    parsed?: {
        error?: string;
        message?: string;
        stderr?: string;
        stdout?: string;
        stack?: string;
    };
}

export interface AgentThreadGenericToolMessage extends AgentThreadToolMessageBase {
    tool_kind: 'generic';
}

export type AgentThreadToolMessageDetailed =
    | AgentThreadFilesystemToolMessage
    | AgentThreadWindowToolMessage
    | AgentThreadErrorToolMessage
    | AgentThreadGenericToolMessage;

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
