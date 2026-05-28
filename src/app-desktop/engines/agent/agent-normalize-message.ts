import type { BaseMessage } from '@langchain/core/messages';



export type AgentMessage = {

}

export type AgentMessagesTurn = AgentMessage[];

export function normalizeAgentMessage(message : BaseMessage) : AgentMessagesTurn {
    // message.kwargs
    return [];
}