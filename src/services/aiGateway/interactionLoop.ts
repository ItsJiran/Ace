

/**
 * Session Interaction Loop — Flow Overview
 *
 * Summary:
 * - `executeSessionInteractionLoop(session, prompt)`
 *   -> validate and set session state to `STREAMING`
 *   -> create a new turn and start background processing via `sendPromptToGateway(...)`
 *   -> main loop waits for `AISessionBus` events (response 'stop') to end
 *
 * Background handler (`sendPromptToGateway`):
 * - posts request to gateway and streams response
 * - reads chunks, appends to `tmp_chunk_buffer` and uses `streamParseBuffer()`
 * - updates session state in `KernelEngine` memory as:
 *     - append `AIEntry` to current `turn.entries`
 *     - update `currentEntry.response` & `assistant_renderers`
 *     - append parsed blocks to `currentEntry.blocks`
 * - for each parsed block:
 *     - find parser handler via `RegistryEngine.getParserBlock(...)`
 *     - execute handler (may dispatch events back to `AISessionBus`)
 * - on stream completion: mark `currentEntry.status = 'completed'` and dispatch 'stop'
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
 * sendPromptToGateway() (background)
 *    |
 *    v
 * Gateway --> streaming chunks --> streamParseBuffer()
 *    |                                   |
 *    v                                   v
 * updateMemory (entries, renderers)   extracted blocks -> RegistryEngine -> handlers
 *    |                                   |
 *    v                                   v
 * AISessionBus events <----------------- handler responses
 *    |
 *    v
 * on 'stop' -> updateMemory(state -> IDLE)
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

import { AIAutonomousFollowUpLoopStatus, AISessionStatus, type AISession } from '#/schemas/ai';

import { KernelEngine } from '../kernelEngine';
import * as TurnRenderer from './turnManager';
import { sendPromptToGateway, AISessionBlockBus } from './sub-services/interactionParserLoop';
import type { AIPromptKind } from './promptBuilder';

// + ============== Session Management API ============== +
// Note: This is a simplified process management approach for AI sessions. 
// Each session spawns a main process that owns the session state memory and 
// handles the interaction loop. Subprocesses can be spawned for individual 
// turns or tool interactions, but they are not strictly required to be children of the 
// main session process in the kernel hierarchy.

export interface SessionInteractionLoopInput {
    session: AISession;
    prompt: string;
}

// Note : Future improvement since we already passing the session object, we can just directly update the session memory in the interaction loop without 
// needing to read it again at the beginning of each loop. We just need to make sure to keep the session object updated with the latest state from memory 
// at the end of each loop iteration. This way we can avoid redundant memory reads and have a more efficient loop.

export async function executeSessionInteractionLoop(input: SessionInteractionLoopInput): Promise<void> {

    console.log(`[AIGatewayEngine] Starting interaction loop for session ${input.session.session_uid} with prompt: ${input.prompt}`);

    const { session, prompt } = input;
    let nextPrompt = prompt;
    let nextPromptKind: AIPromptKind = 'user_prompt';

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
        state: 'Reason',
        termination_requested: false,
        // we always set refresh context index for every turn from newest to latest
        context_start_index: Math.max(0, KernelEngine.readMemory(`system:ai_session:${session.session_uid}:state`)?.context?.length - 15),
        context_end_index: (KernelEngine.readMemory(`system:ai_session:${session.session_uid}:state`)?.context?.length ?? 0) - 1 + 1,

        // history window is tracked by turn index because history summaries are keyed by turn
        history_start_index: Math.max(0, session.turns.length - 15),
        history_end_index: session.turns.length,

        turns: [...session.turns, TurnRenderer.initTurn(prompt)],
        turn_index: session.turns.length, // Point to the newl y added turn
        autonomous_follow_up_loop_status: AIAutonomousFollowUpLoopStatus.ACTIVE,
    } as AISession);

    // -- Run the interaction loop for the session, which will handle the entire lifecycle of the prompt 
    // processing, including streaming updates, tool interactions, and autonomous follow-up loops.

    try {

        while (KernelEngine.readMemory(`system:ai_session:${session.session_uid}:state`)?.status === AISessionStatus.STREAMING) {

            // 1. Prepare the listener promise FIRST
            const loopPromise = new Promise((resolve) => {
                AISessionBlockBus.addEventListener(`system:ai_session:${session.session_uid}:response`,
                    (e: any) => resolve(e.detail),
                    { once: true }
                );
            });

            // -- For each turn, we will update the active_entry_index and entries array in 
            // memory as we receive updates from the model.
            KernelEngine.updateMemory(`system:ai_session:${session.session_uid}:state`, {
                active_interaction_loop_attempt: (KernelEngine.readMemory(`system:ai_session:${session.session_uid}:state`)?.active_interaction_loop_attempt ?? 0) + 1,
            });

            // -- Send prompt 
            // For the sake of this example, let's assume we have a function processPrompt 
            // that handles the entire processing of the prompt and returns when the response is complete.
            await sendPromptToGateway(
                nextPrompt,
                session.session_uid,
                nextPromptKind,
                session.sdk,
                session.model,
            );

            // -- Since we fire and forget the processing in the background, we can just wait till all the parse
            // works are done and the response is finalized. In a real implementation, we would likely have more complex 
            // logic here to handle streaming updates, tool interactions, and autonomous follow-up loops in real-time.
            console.log(`[AIGatewayEngine] Waiting for interaction loop to complete for session ${session.session_uid}...`);
            const loopResponse = await loopPromise;

            if (KernelEngine.readMemory(`system:ai_session:${session.session_uid}:state`)?.autonomous_follow_up_loop_status === AIAutonomousFollowUpLoopStatus.INTERRUPTED) {
                KernelEngine.updateMemory(`system:ai_session:${session.session_uid}:state`, {
                    status: AISessionStatus.IDLE,
                    active_abort_controller: undefined,
                } as AISession);
                console.log(`[AIGatewayEngine] Interaction loop for session ${session.session_uid} completed and marked as IDLE.`);
                return; // Exit the loop and end the function since the session is now idle.
            }

            // -- Once the processing is complete, we can update the session state 
            // to reflect the final response and mark it as idle.
            if (loopResponse === 'stop') {
                KernelEngine.updateMemory(`system:ai_session:${session.session_uid}:state`, {
                    status: AISessionStatus.IDLE,
                    autonomous_follow_up_loop_status: AIAutonomousFollowUpLoopStatus.COMPLETED,
                    active_abort_controller: undefined,
                } as AISession);
                console.log(`[AIGatewayEngine] Interaction loop for session ${session.session_uid} completed and marked as IDLE.`);
                return; // Exit the loop and end the function since the session is now idle.
            } else if (loopResponse === 'continue') {
                nextPrompt = '';
                nextPromptKind = 'autonomous_follow_up';
                console.log(`[AIGatewayEngine] Interaction loop requested to CONTINUE for session ${session.session_uid}. Initiating new entry.`);
            } else {
                console.warn(`[AIGatewayEngine] Interaction loop for session ${session.session_uid} received unexpected event data: ${loopResponse}`);
            }
        }

    } catch (error) {
        console.error(`Error in interaction loop for session ${session.session_uid}:`, error);

        KernelEngine.updateMemory(`system:ai_session:${session.session_uid}:state`, {
            status: AISessionStatus.ERROR,
            autonomous_follow_up_loop_status: AIAutonomousFollowUpLoopStatus.COMPLETED,
            active_abort_controller: undefined,
            error_payload: error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) },
        } as Partial<AISession>);
    }
}

