import { AIBlockLifecycleStatus, type AIBlock, type AIEntry, type AISession, type AITurn } from '#/schemas/ai';
import { KernelEngine } from '#/services/kernelEngine';
import * as TurnRenderer from '#/services/aiGateway/turnManager';
import type { StreamRuntimeState } from './shared';

export function initializeStreamingEntry(session_uid: string, prompt: string, composed_prompt: string): void {
    const newAIEntry = TurnRenderer.buildTurnEntry({
        response: '',
        prompt,
        composed_prompt,
        blocks: [],
        status: 'streaming',
    });

    const currentSessionState = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISession;
    const currentTurn = currentSessionState.turns[currentSessionState.turn_index];

    currentTurn.entries.push(newAIEntry);
    currentTurn.active_entry_index = (currentTurn.active_entry_index ?? -1) + 1;

    KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
        turns: [
            ...currentSessionState.turns.slice(0, currentSessionState.turn_index),
            { ...currentTurn },
        ],
    });
}

export function appendChunkToCurrentEntry(session_uid: string, chunk: string): void {
    const currentSessionState = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISession;
    const currentTurn = currentSessionState.turns?.[currentSessionState.turn_index] as AITurn;
    const currentEntry = currentTurn.entries?.[currentTurn.active_entry_index as number] as AIEntry;

    if (currentEntry.response == undefined) currentEntry.response = '';
    currentEntry.response += chunk;

    KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
        ...currentSessionState,
        turns: [
            ...currentSessionState.turns.slice(0, currentSessionState.turn_index),
            {
                ...currentTurn, entries: [
                    ...currentTurn.entries.slice(0, currentTurn.active_entry_index as number),
                    { ...currentEntry },
                ],
            },
        ],
    });
}

export function createStreamingBlock(session_uid: string, blockSlug: string): AIBlock {
    const { currentSessionState, currentTurn, currentEntry } = getCurrentEntryRefs(session_uid);
    const now = Date.now();

    const currentBlock = TurnRenderer.buildBlockEntry({
        session_uid,
        process_uid: currentSessionState.process_uid,
        turn_index: currentSessionState.turn_index,
        entry_index: currentTurn.active_entry_index as number,
        block_index: currentEntry.blocks ? currentEntry.blocks.length : 0,
        block_slug: blockSlug,
        lifecycle_status: AIBlockLifecycleStatus.STARTED,
        opened_at: now,
        updated_at: now,
        chunk_count: 0,
        runtime_context: {},
        payload: { content: '' },
    });

    currentEntry.blocks = [
        ...(currentEntry.blocks ? currentEntry.blocks : []),
        currentBlock,
    ];

    persistCurrentEntry(session_uid, currentSessionState, currentTurn, currentEntry);
    return currentBlock;
}

export function getActiveBlockFromRuntime(session_uid: string, runtimeState: StreamRuntimeState): AIBlock | null {
    if (!runtimeState.active_block) return null;

    const { currentEntry } = getCurrentEntryRefs(session_uid);
    const block = currentEntry.blocks?.[runtimeState.active_block.block_index] ?? null;
    return block ?? null;
}

export function appendContentToBlock(session_uid: string, block: AIBlock, chunkText: string): AIBlock {
    const now = Date.now();
    block.lifecycle_status = AIBlockLifecycleStatus.STREAMING;
    block.updated_at = now;
    block.chunk_count = (block.chunk_count ?? 0) + 1;
    block.payload.content = `${block.payload.content ?? ''}${chunkText}`;

    persistBlock(session_uid, block);
    return block;
}

export function markBlockCompleted(session_uid: string, block: AIBlock): AIBlock {
    const now = Date.now();
    block.lifecycle_status = AIBlockLifecycleStatus.COMPLETED;
    block.completed_at = now;
    block.updated_at = now;

    persistBlock(session_uid, block);
    return block;
}

export function getCurrentEntryRefs(session_uid: string): {
    currentSessionState: AISession;
    currentTurn: AITurn;
    currentEntry: AIEntry;
} {
    const currentSessionState = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISession;
    const currentTurn = currentSessionState.turns?.[currentSessionState.turn_index] as AITurn;
    const currentEntry = currentTurn.entries?.[currentTurn.active_entry_index as number] as AIEntry;

    if (!currentEntry.blocks) {
        currentEntry.blocks = [];
    }

    return { currentSessionState, currentTurn, currentEntry };
}

export function persistCurrentEntry(session_uid: string, currentSessionState: AISession, currentTurn: AITurn, currentEntry: AIEntry): void {
    KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
        ...currentSessionState,
        turns: [
            ...currentSessionState.turns.slice(0, currentSessionState.turn_index),
            {
                ...currentTurn, entries: [
                    ...currentTurn.entries.slice(0, currentTurn.active_entry_index as number),
                    { ...currentEntry },
                ],
            },
        ],
    });
}

export function persistBlock(session_uid: string, block: AIBlock): void {
    const { currentSessionState, currentTurn, currentEntry } = getCurrentEntryRefs(session_uid);
    currentEntry.blocks = [
        ...(currentEntry.blocks ?? []).slice(0, block.block_index),
        block,
        ...(currentEntry.blocks ?? []).slice(block.block_index + 1),
    ];

    persistCurrentEntry(session_uid, currentSessionState, currentTurn, currentEntry);
}