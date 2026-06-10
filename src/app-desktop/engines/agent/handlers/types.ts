/**
 * Shared context passed to stream event handlers.
 */
import type { DeltaToMessageConverter } from '../../ai/utils/delta-to-message';
import type { AgentClientThreadEphemeralItem, AgentClientThreadRuntimeState } from '#/shared/schemas/agent-client-ephemeral';
import type { AgentTurnResponseElement } from '#/shared/schemas/agent-thread-state';
import type { AgentStreamAnyEvent } from '#/shared/schemas/agent-stream-events';

export interface StreamHandlerContext {
    converters: Map<string, DeltaToMessageConverter>;
    getConverter(threadUid: string): DeltaToMessageConverter;
    clearConverter(threadUid: string): void;
    getEphemeral(threadUid: string): AgentClientThreadEphemeralItem[];
    updateEphemeral(threadUid: string, items: AgentClientThreadEphemeralItem[]): Promise<void>;
    removeEphemeralItem(threadUid: string, uid: string, type: 'tool' | 'messages'): Promise<void>;
    updateRuntime(threadUid: string, patch: Partial<AgentClientThreadRuntimeState>): Promise<void>;
    appendSettledResponse(threadUid: string, response: AgentTurnResponseElement): Promise<void>;
    emitDebug(threadUid: string, event: AgentStreamAnyEvent, meta?: { result?: string; error?: string; snapshot?: Record<string, unknown> }): void;
    readThreadFromMemory(threadUid: string): any;
    syncCurrentThreadFromBackground(threadUid: string): Promise<any>;
}
