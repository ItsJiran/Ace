

/**
 * Session Interaction Loop — Flow Overview
 *
 * Summary:
 * - `executeSessionInteractionLoop(session, prompt)`
 *   -> validate and set session state to `STREAMING`
 *   -> create a new turn
 *   -> complete immediately with a local placeholder response while runtime integration is disabled
 *
 * ASCII Diagram:
 *
 *   User
 *    |
 *    v
 * executeSessionInteractionLoop()
 *    |
 *    v
 * updateMemory(state -> STREAMING)   <---- kernel memory (frequent reads/writes)
 *    |
 *    v
 * completeDisabledRuntimeTurn()
 *    |
 *    v
 * updateMemory(entries, renderers, state -> IDLE)
 *
 * Notes:
 * - The implementation performs frequent read/update cycles on `KernelEngine` memory
 *   to keep a canonical, synchronized session state across components (UI, registry, etc).
 */

// NOTE: The current implementation intentionally calls `KernelEngine.readMemory` and
// `KernelEngine.updateMemory` repeatedly for every streaming chunk. This simplifies
// synchronization across processes and components, but it can increase memory usage
// and I/O when many AI sessions are active. Consider batching updates, using an
// in-memory session object with periodic persistence, or sending diffs instead of
// full session snapshots to reduce overhead.

import { AIAutonomousFollowUpLoopStatus, AIResponseStatus, AISessionStatus, type AISessionRuntime } from '#/schemas/ai';
import { KernelEngine } from '../kernel-engine';
import * as TurnRenderer from './turn-manager';

// + ============== Session Management API ============== +
// Note: This is a simplified process management approach for AI sessions. 
// Each session spawns a main process that owns the session state memory and 
// handles the interaction loop. Subprocesses can be spawned for individual 
// turns or tool interactions, but they are not strictly required to be children of the 
// main session process in the kernel hierarchy.

export interface SessionInteractionLoopInput {
    session: AISessionRuntime;
    prompt: string;
    promptKind?: 'user_prompt' | 'autonomous_follow_up';
}

// Note : Future improvement since we already passing the session object, we can just directly update the session memory in the interaction loop without 
// needing to read it again at the beginning of each loop. We just need to make sure to keep the session object updated with the latest state from memory 
// at the end of each loop iteration. This way we can avoid redundant memory reads and have a more efficient loop.

export async function executeSessionInteractionLoop(input: SessionInteractionLoopInput): Promise<void> {

    console.log(`[AIGatewayEngine] Starting interaction loop for session ${input.session.session_uid} with prompt: ${input.prompt}`);

    const { session, prompt, promptKind = 'user_prompt' } = input;

    // -- Check if session status is currently running. If not, we should not proceed with processing the prompt.
    // unless we already implement drifting sessions where a new prompt can be sent to an existing session even after completion, 
    // we should not allow sending prompts to non-running sessions.
    if (KernelEngine.readMemory(`system:ai_session:${session.session_uid}:state`)?.status == AISessionStatus.STREAMING) {
        console.warn(`
            Session ${session.session_uid} is already in 'streaming' status. 
            Current status: ${KernelEngine.readMemory(`system:ai_session:${session.session_uid}:state`)?.status}`
        );
        return;
    }

    // -- Create the default new turn for User and for Assistant (streaming)
    KernelEngine.updateMemory(`system:ai_session:${session.session_uid}:state`, {
        status: AISessionStatus.STREAMING,
        state: 'reasoning',
        state_cycle_index: 0,
        termination_requested: false,
        // we always set refresh context index for every turn from newest to latest
        context_start_index: Math.max(0, KernelEngine.readMemory(`system:ai_session:${session.session_uid}:state`)?.context?.length - 15),
        context_end_index: (KernelEngine.readMemory(`system:ai_session:${session.session_uid}:state`)?.context?.length ?? 0) - 1 + 1,

        turns: [...session.turns, TurnRenderer.initTurn(prompt)],
        turn_index: session.turns.length, // Point to the newl y added turn
        autonomous_follow_up_loop_status: AIAutonomousFollowUpLoopStatus.ACTIVE,
    } as AISessionRuntime);

    try {
        KernelEngine.updateMemory(`system:ai_session:${session.session_uid}:state`, {
            active_interaction_loop_attempt: (KernelEngine.readMemory(`system:ai_session:${session.session_uid}:state`)?.active_interaction_loop_attempt ?? 0) + 1,
        } as Partial<AISessionRuntime>);

        completeDisabledRuntimeTurn(session.session_uid, prompt, promptKind);

        if (KernelEngine.readMemory(`system:ai_session:${session.session_uid}:state`)?.autonomous_follow_up_loop_status === AIAutonomousFollowUpLoopStatus.INTERRUPTED) {
            KernelEngine.updateMemory(`system:ai_session:${session.session_uid}:state`, {
                status: AISessionStatus.IDLE,
                active_abort_controller: undefined,
            } as AISessionRuntime);
            console.log(`[AIGatewayEngine] Graph run for session ${session.session_uid} completed and marked as IDLE.`);
            return;
        }

        KernelEngine.updateMemory(`system:ai_session:${session.session_uid}:state`, {
            status: AISessionStatus.IDLE,
            autonomous_follow_up_loop_status: AIAutonomousFollowUpLoopStatus.COMPLETED,
            active_abort_controller: undefined,
        } as AISessionRuntime);
        console.log(`[AIGatewayEngine] Graph run for session ${session.session_uid} completed and marked as IDLE.`);
        return;

    } catch (error) {
        console.error(`Error in interaction loop for session ${session.session_uid}:`, error);

        KernelEngine.updateMemory(`system:ai_session:${session.session_uid}:state`, {
            status: AISessionStatus.ERROR,
            autonomous_follow_up_loop_status: AIAutonomousFollowUpLoopStatus.COMPLETED,
            active_abort_controller: undefined,
            error_payload: error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) },
        } as Partial<AISessionRuntime>);
    }
}

function completeDisabledRuntimeTurn(
    sessionUid: string,
    prompt: string,
    promptKind: SessionInteractionLoopInput['promptKind'],
): void {
    const sessionState = KernelEngine.readMemory(`system:ai_session:${sessionUid}:state`) as AISessionRuntime | undefined;
    if (!sessionState) {
        throw new Error(`Session ${sessionUid} not found while completing disabled runtime turn.`);
    }

    const currentTurn = sessionState.turns[sessionState.turn_index];
    if (!currentTurn) {
        throw new Error(`Turn ${sessionState.turn_index} not found for session ${sessionUid}.`);
    }

    const placeholderResponse = [
        'AI runtime integration is temporarily disabled.',
        'UI components are still active, but this thread no longer sends prompts to any backend runtime.',
        `Prompt kind: ${promptKind ?? 'user_prompt'}.`,
        prompt.trim() ? `Captured prompt: ${prompt.trim()}` : undefined,
    ].filter((line): line is string => Boolean(line)).join('\n\n');

    const entry = TurnRenderer.buildTurnEntry({
        response: placeholderResponse,
        prompt,
        composed_prompt: prompt,
        status: AIResponseStatus.COMPLETED,
    });

    const nextTurn = {
        ...currentTurn,
        status: AIResponseStatus.COMPLETED,
        active_entry_index: currentTurn.entries.length,
        entries: [...currentTurn.entries, entry],
        assistant_renderers: [
            ...(currentTurn.assistant_renderers ?? []),
            TurnRenderer.buildRenderer('paragraph_renderer', 'system', { text: placeholderResponse }),
        ],
    };

    KernelEngine.updateMemory(`system:ai_session:${sessionUid}:state`, {
        ...sessionState,
        turns: [
            ...sessionState.turns.slice(0, sessionState.turn_index),
            nextTurn,
        ],
        status: AISessionStatus.IDLE,
        state: 'finalizing',
        active_abort_controller: undefined,
        termination_requested: false,
        autonomous_follow_up_loop_status: AIAutonomousFollowUpLoopStatus.COMPLETED,
    } as AISessionRuntime);
}

