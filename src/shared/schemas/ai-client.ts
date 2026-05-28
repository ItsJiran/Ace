/**
 * This schemas file defines the type for the resolving of event that receied from the ai-stream-event in the client side
 * and mapping it into ephemeral messages payload that can be rendered in the UI, and also the type for the tool event that can 
 * be used to render the event in the UI. 
 */

import { AgentThread } from "./ai";

export interface AgentClientThread extends AgentThread {
    // This is the ephemeral state that only exist in the client side, which is used to
    // render the thread state in the UI, and will not be synced to the backend.
    
    // this is the uid for the ephemeral memory that used in the thread, which can be used to link the ephemeral memory with the thread. 
    ephemeral_memory_uid?: string; 
    runtime_memory_uid?: string;
}

export type AgentClientThreadRuntimeState = {
    // essentialty this mean is streaming
    is_streaming: boolean;
    last_event?: string;
    last_error?: string;
    active_node?: string;
};


// Ephemeral stream is the stream that is used to render the streaming state in the UI, such as the tool state and the lifecycle state, 
// which will be cleared once the stream is finished / completed / disrupted.

export type AgentClientThreadEphemeralBufferType = AgentClientThreadEphemeralItem[];


export interface AgentClientThreadEphemeralBase {
    uid: string;
    type: AgentClientThreadEphemeralKind;
    event: string;
    node?: string;
    content: any;
    created_at: number;
    updated_at: number;
}

export type AgentClientThreadEphemeralKind = 'messages' | 'tool' | 'step' | 'lifecycle';

export interface AgentClientThreadEphemeralMessage extends AgentClientThreadEphemeralBase {
    type: 'messages';
    content : Array<string>; // index : seq, value : content delta,
}

export interface AgentClientThreadEphemeralTool extends AgentClientThreadEphemeralBase {
    type: 'tool';
}

export interface AgentClientThreadEphemeralStep extends AgentClientThreadEphemeralBase {
    type: 'step';
}

export interface AgentClientThreadEphemeralLifecycle extends AgentClientThreadEphemeralBase {
    type: 'lifecycle';
}

export type AgentClientThreadEphemeralItem =
    | AgentClientThreadEphemeralMessage
    | AgentClientThreadEphemeralTool
    | AgentClientThreadEphemeralStep
    | AgentClientThreadEphemeralLifecycle;