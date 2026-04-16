import type { AISession, AITurn } from '#/schemas/ai';
import { KernelEngine } from '#/services/kernelEngine';
import * as TurnRenderer from '#/services/aiGateway/turnManager';
import type { StreamRuntimeState } from './shared';

export function renderStrippedPrefix(
    session_uid: string,
    stripped_prefix: string,
    runtimeState: StreamRuntimeState,
): void {
    if (stripped_prefix === '') return;

    appendToStreamingParagraph(session_uid, stripped_prefix, runtimeState);
}

export function flushPlainTextBufferToRenderer(session_uid: string, runtimeState: StreamRuntimeState): void {
    if (runtimeState.pending_buffer === '') return;

    appendToStreamingParagraph(session_uid, runtimeState.pending_buffer, runtimeState);
}

export function resetStreamingParagraphRuntime(runtimeState: StreamRuntimeState): void {
    runtimeState.tmp_paragraph_renderer_index = -1;
    runtimeState.tmp_paragraph_memory_uid = undefined;
}

function appendToStreamingParagraph(
    session_uid: string,
    text: string,
    runtimeState: StreamRuntimeState,
): void {
    if (text === '') return;
    if (runtimeState.tmp_paragraph_renderer_index === -1 && text.trim() === '') return;

    const { memory_uid } = ensureStreamingParagraphRenderer(session_uid, runtimeState);
    const currentText = (KernelEngine.readMemory(memory_uid) as string | undefined) ?? '';
    KernelEngine.writeMemory(memory_uid, `${currentText}${text}`);
}

function ensureStreamingParagraphRenderer(
    session_uid: string,
    runtimeState: StreamRuntimeState,
): { memory_uid: string; renderer_index: number } {
    if (runtimeState.tmp_paragraph_renderer_index !== -1 && runtimeState.tmp_paragraph_memory_uid) {
        return {
            memory_uid: runtimeState.tmp_paragraph_memory_uid,
            renderer_index: runtimeState.tmp_paragraph_renderer_index,
        };
    }

    const currentSessionState = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISession;
    const currentTurn = currentSessionState.turns?.[currentSessionState.turn_index] as AITurn;
    const currentEntryIndex = currentTurn.active_entry_index as number;
    const rendererIndex = currentTurn.assistant_renderers.length;
    const memory_uid = `system:ai_session:${session_uid}:turn:${currentSessionState.turn_index}:entry:${currentEntryIndex}:renderer:${rendererIndex}:paragraph`;

    KernelEngine.batch(() => {
        KernelEngine.createMemoryIfNotExist(memory_uid, '', currentSessionState.process_uid);
        currentTurn.assistant_renderers.push(
            TurnRenderer.buildRenderer('paragraph_renderer', { memory_uid }),
        );

        KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
            ...currentSessionState,
            turns: [
                ...currentSessionState.turns.slice(0, currentSessionState.turn_index),
                { ...currentTurn },
            ],
        });
    });

    runtimeState.tmp_paragraph_renderer_index = rendererIndex;
    runtimeState.tmp_paragraph_memory_uid = memory_uid;

    return { memory_uid, renderer_index: rendererIndex };
}