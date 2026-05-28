/**
 * This schemas file defines the type for the resolving of event that receied from the agent-stream-event in the client side
 * and mapping it into ephemeral messages payload that can be rendered in the UI, and also the type for the tool event that can
 * be used to render the event in the UI.
 */

export type AgentClientThreadRuntimeState = {
    is_streaming: boolean;
    last_event?: string;
    last_error?: string;
    active_node?: string;
};

export type AgentClientThreadEphemeralBufferType = AgentClientThreadEphemeralItem[];

export type AgentClientThreadEphemeralItem =
    | AgentClientThreadEphemeralMessage
    | AgentClientThreadEphemeralTool
    | AgentClientThreadEphemeralStep;

export interface AgentClientThreadEphemeralBase {
    uid: string;
    type: AgentClientThreadEphemeralKind;
    event: string;
    node?: string;
    content: any;
    created_at: number;
    updated_at: number;
}

export type AgentClientThreadEphemeralKind = 'messages' | 'tool' | 'step';

export interface AgentClientThreadEphemeralMessage extends AgentClientThreadEphemeralBase {
    type: 'messages';
    content: Array<string>; // index : seq, value : content delta,
}

export interface AgentClientThreadEphemeralTool extends AgentClientThreadEphemeralBase {
    type: 'tool';
}

export interface AgentClientThreadEphemeralStep extends AgentClientThreadEphemeralBase {
    type: 'step';
}
