

import { AISessionStatus, type AISession, type AITurn } from './types';
import { PROCESS_KIND, PROCESS_STATUS } from '#/schemas/process';

import { KernelEngine } from '../kernelEngine';
// import { ParserEngine } from '../parserEngine';

import * as TurnRenderer from './turnManager';

// import { PlanningService } from '../aiContext/planningService';
// import { AIConfigManager } from './configManager';
// import { HealthProbe } from './healthProbe';
// import { sendToSession as sendStreamRequest } from './httpClient';
// import { prepareGatewaySessionRequest } from './requestPreparation';
// import { finalizeGatewaySessionResponse } from './responseFinalization';
// import { AI_FEEDBACK_LOOP_STATUS, AI_GATEWAY_PROCESS_TYPE } from './types';
// import type { ParserSessionEmitRecord, ParserSessionStopSignal } from '#/schemas/parser';
// import { PARSER_RUNTIME_EVENT } from '#/schemas/parserEventNames';

// function snapshotResponseAttemptFromMemory(input: {
//     replyToRamKey: string;
//     attemptIndex: number;
//     prompt: string;
// }): ResponseAttemptSnapshot {
//     const { replyToRamKey, attemptIndex, prompt } = input;
//     const memory = (KernelEngine.readMemory(replyToRamKey) ?? {}) as Record<string, unknown>;

//     return {
//         attempt_index: attemptIndex,
//         prompt,
//         composed_prompt: typeof memory.composed_prompt === 'string' ? memory.composed_prompt : undefined,
//         started_at: typeof memory.started_at === 'number' ? memory.started_at : Date.now(),
//         finished_at: typeof memory.finished_at === 'number' ? memory.finished_at : undefined,
//         status: typeof memory.status === 'string' ? memory.status : undefined,
//         error_message: typeof memory.error_message === 'string' ? memory.error_message : undefined,
//         text: typeof memory.text === 'string' ? memory.text : undefined,
//         raw_response: typeof memory.raw_response === 'string' ? memory.raw_response : undefined,
//         blocks: Array.isArray(memory.blocks) ? cloneSnapshotValue(memory.blocks) : undefined,
//         parser_batches: Array.isArray(memory.parser_batches) ? cloneSnapshotValue(memory.parser_batches) : undefined,
//         parser_batch_count: typeof memory.parser_batch_count === 'number' ? memory.parser_batch_count : undefined,
//         events_total: typeof memory.events_total === 'number' ? memory.events_total : undefined,
//         parser_handler_results: Array.isArray(memory.parser_handler_results) ? cloneSnapshotValue(memory.parser_handler_results) : undefined,
//         parser_stop_signals: Array.isArray(memory.parser_stop_signals) ? cloneSnapshotValue(memory.parser_stop_signals) : undefined,
//         parser_token_traces: Array.isArray(memory.parser_token_traces) ? cloneSnapshotValue(memory.parser_token_traces) : undefined,
//     };
// }

// function waitMs(ms: number): Promise<void> {
//     return new Promise((resolve) => {
//         setTimeout(resolve, ms);
//     });
// }

// async function waitForActionTerminalEvent(sessionId: string, replyToRamKey: string): Promise<ParserSessionEmitRecord | null> {
//     const startedAt = Date.now();

//     while (Date.now() - startedAt < TOOL_FEEDBACK_WAIT_TIMEOUT_MS) {
//         const runtimeState = drainParserRuntimeToResponseMemory(sessionId, replyToRamKey);
//         const terminalEvent = getLatestActionTerminalEvent(runtimeState.mergedResults);
//         if (terminalEvent) return terminalEvent;
//         await waitMs(TOOL_FEEDBACK_WAIT_INTERVAL_MS);
//     }

//     const finalState = drainParserRuntimeToResponseMemory(sessionId, replyToRamKey);
//     return getLatestActionTerminalEvent(finalState.mergedResults);
// }

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

    const { session, prompt } = input;

    // -- Check if session status is currently running. If not, we should not proceed with processing the prompt.
    // unless we already implement drifting sessions where a new prompt can be sent to an existing session even after completion, 
    // we should not allow sending prompts to non-running sessions.
    if (KernelEngine.readMemory(`system:ai_session:${session.session_uid}:state`)?.status !== AISessionStatus.STREAMING) {
        console.warn(`Session ${session.session_uid} is not in 'running' status. Current status: ${KernelEngine.readMemory(`system:ai_session:${session.session_uid}:state`)?.status}`);
        return;
    }
    
    // -- Create the default new turn for User and for Assistant (streaming)
    KernelEngine.updateMemory(`system:ai_session:${session.session_uid}:state`, {
        status : AISessionStatus.STREAMING,
        turns: [...session.turns, TurnRenderer.initTurn(prompt)],
        turn_index: session.turns.length, // Point to the newly added turn
    } as AISession);
    
    // -- Run the interaction loop for the session, which will handle the entire lifecycle of the prompt 
    // processing, including streaming updates, tool interactions, and feedback loops.

    console.log(`[AIGatewayEngine] Starting interaction loop for session ${session} with prompt: ${prompt}`);
    return;

    // Interaction loop workflow : 
    // 1. Send the prompt to the model and start streaming the response using preallocation memory asyncronously

    // try {
    
    //     while(true){

    //         // -- For each turn, we will update the active_entry_index and entries array in 
    //         // memory as we receive updates from the model.
    //         KernelEngine.updateMemory(`system:ai_session:${session.session_uid}:state`, {
    //             active_interaction_loop_attempt: (KernelEngine.readMemory(`system:ai_session:${session.session_uid}:state`)?.active_interaction_loop_attempt ?? 0) + 1,
    //         });

    //         // -- The actual processing of the prompt, including sending it to the model, 
    //         // handling streaming responses, tool interactions, etc.
            

    //     }


    // } catch (error) {
    //     console.error(`Error in interaction loop for session ${session.session_uid}:`, error);
    //     KernelEngine.updateMemory(`system:ai_session:${session.session_uid}:state`, {
    //         status: AISessionStatus.ERROR,
    //         error_payload: error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) } ,
    //     } as Partial<AISession>);
    // }


    

    // const rootProcess = parentProcessUid
    //     ? KernelEngine.spawnSubprocess(parentProcessUid, AI_GATEWAY_PROCESS_TYPE.RESPONSE_TURN, {
    //         metadata: {
    //             session_uid: sessionUid,
    //             reply_to_ram_key: replyToRamKey,
    //             prompt_preview: prompt.slice(0, 200),
    //         },
    //         process_kind: PROCESS_KIND.AI_SESSION_TURN,
    //         owner_engine: 'aiGatewayEngine',
    //     })
    //     : KernelEngine.spawnProcess(AI_GATEWAY_PROCESS_TYPE.RESPONSE_TURN, {
    //         session_uid: sessionUid,
    //         reply_to_ram_key: replyToRamKey,
    //         prompt_preview: prompt.slice(0, 200),
    //     }, {
    //         process_kind: PROCESS_KIND.AI_SESSION_TURN,
    //         owner_engine: 'aiGatewayEngine',
    //     });
    // KernelEngine.updateProcessStatus(rootProcess.process_uid, PROCESS_STATUS.RUNNING);

    // const updateResponseMemory = (payload: Record<string, unknown>) => {
    //     const updated = KernelEngine.updateRuntimeMemory({
    //         owner_process_uid: rootProcess.process_uid,
    //         memory_uid: replyToRamKey,
    //         payload,
    //     });

    //     if (!updated) {
    //         // Fallback for memory created before process ownership metadata is attached.
    //         KernelEngine.updateMemory(replyToRamKey, payload);
    //     }
    // };

    // const memoryBefore = (KernelEngine.readMemory(replyToRamKey) ?? {}) as Record<string, unknown>;
    // const existingTurns = Array.isArray(memoryBefore.response_turns)
    //     ? (memoryBefore.response_turns as ResponseTurnSnapshot[])
    //     : [];

    // const promptTurnId = `turn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    // const sessionProcessUid = `process:ai_session:${sessionId}`;
    // TurnRendererEngine.initTurn(promptTurnId, 'assistant', sessionProcessUid);
    // const currentTurn: ResponseTurnSnapshot = {
    //     turn_id: promptTurnId,
    //     original_prompt: prompt,
    //     started_at: Date.now(),
    //     attempts: [],
    // };

    // let activePrompt = prompt;
    // let continuationTurns = 0;

    // while (true) {
    //     const prepared = prepareGatewaySessionRequest({
    //         session,
    //         sessionId,
    //         prompt: activePrompt,
    //     });

    //     const streamOutcome = await sendStreamRequest(
    //         session,
    //         prepared.composed_prompt,
    //         replyToRamKey,
    //         AIConfigManager.get(),
    //         () => HealthProbe.ensure(),
    //         {
    //             process_uid: rootProcess.process_uid,
    //             original_prompt: prompt,
    //             used_contexts: prepared.used_contexts,
    //             prompt_reference: prepared.prompt_reference,
    //             response_reference: prepared.response_reference,
    //             prompt_turn_id: promptTurnId,
    //             response_attempt_index: continuationTurns + 1,
    //             response_turns_seed: [...existingTurns, currentTurn].slice(-20),
    //         },
    //     );

    //     drainParserRuntimeToResponseMemory(sessionId, replyToRamKey);

    //     finalizeGatewaySessionResponse({
    //         session,
    //         sessionId,
    //         prompt: activePrompt,
    //         reply_to_ram_key: replyToRamKey,
    //         response_reference: prepared.response_reference,
    //     });

    //     const attemptSnapshot = snapshotResponseAttemptFromMemory({
    //         replyToRamKey,
    //         attemptIndex: continuationTurns + 1,
    //         prompt: activePrompt,
    //     });
    //     currentTurn.attempts = [...currentTurn.attempts, attemptSnapshot].slice(-12);

    //     if (!streamOutcome.interrupted) {
    //         currentTurn.finished_at = Date.now();
            
    //         // Check planning context even if not interrupted by a tool
    //         const activePlan = PlanningService.getPlan(sessionId);
    //         const hasPendingPlans = activePlan.short_plan.some(t => t.status === 'pending');
    //         const shouldContinueOnlyFromPlan = !activePlan.yield_to_user && hasPendingPlans;

    //         if (shouldContinueOnlyFromPlan && continuationTurns < TOOL_FEEDBACK_LOOP_MAX_TURNS) {
    //             updateResponseMemory({
    //                 status: 'completed',
    //                 response_turns: [...existingTurns, currentTurn].slice(-20),
    //                 active_response_turn_id: promptTurnId,
    //                 active_response_attempt_index: continuationTurns + 1,
    //                 feedback_loop_status: AI_FEEDBACK_LOOP_STATUS.RUNNING,
    //                 feedback_loop_reason: 'plan_feedback_loop_continue',
    //                 feedback_loop_turn: continuationTurns,
    //                 last_feedback_at: Date.now(),
    //             });

    //             await new Promise(resolve => setTimeout(resolve, 50));
    //             activePrompt = `Turn completed but plan still has 'pending' tasks. Please execute the next task in the plan. Use the <plan> block to update its status first.`;
    //             continuationTurns++;
    //             rootProcess = KernelEngine.createProcess({
    //                 parent_uid: parentProcessUid,
    //                 kind: PROCESS_KIND.SYSTEM_BACKGROUND,
    //                 command: AI_GATEWAY_PROCESS_TYPE.TOOL_FEEDBACK_LOOP,
    //             });
    //             TurnRendererEngine.finalizeTurn(promptTurnId);
    //             continue;
    //         }

    //         updateResponseMemory({
    //             status: 'completed',
    //             response_turns: [...existingTurns, currentTurn].slice(-20),
    //             active_response_turn_id: promptTurnId,
    //             active_response_attempt_index: continuationTurns + 1,
    //             feedback_loop_status: continuationTurns > 0 ? AI_FEEDBACK_LOOP_STATUS.COMPLETED : AI_FEEDBACK_LOOP_STATUS.NONE,
    //             feedback_loop_reason: continuationTurns > 0 ? 'tool_feedback_completed' : undefined,
    //             feedback_loop_turn: continuationTurns,
    //             last_feedback_at: Date.now(),
    //         });

    //         KernelEngine.updateProcessStatus(rootProcess.process_uid, PROCESS_STATUS.DONE);
    //         TurnRendererEngine.finalizeTurn(promptTurnId);
    //         return;
    //     }

    //     if (continuationTurns >= TOOL_FEEDBACK_LOOP_MAX_TURNS) {
    //         currentTurn.finished_at = Date.now();
    //         updateResponseMemory({
    //             status: 'error',
    //             response_turns: [...existingTurns, currentTurn].slice(-20),
    //             active_response_turn_id: promptTurnId,
    //             active_response_attempt_index: continuationTurns + 1,
    //             feedback_loop_status: AI_FEEDBACK_LOOP_STATUS.INTERRUPTED,
    //             feedback_loop_reason: 'tool_feedback_loop_turn_cap_reached',
    //             feedback_loop_turn: continuationTurns,
    //             last_feedback_at: Date.now(),
    //             parser_interrupt_reason: streamOutcome.interruptReason,
    //         });
    //         KernelEngine.updateProcessStatus(rootProcess.process_uid, PROCESS_STATUS.FAILED);
    //         TurnRendererEngine.finalizeTurn(promptTurnId);
    //         return;
    //     }

    //     const terminalActionEvent = await waitForActionTerminalEvent(sessionId, replyToRamKey);
    //     if (!terminalActionEvent) {
    //         currentTurn.finished_at = Date.now();
    //         updateResponseMemory({
    //             status: 'error',
    //             response_turns: [...existingTurns, currentTurn].slice(-20),
    //             active_response_turn_id: promptTurnId,
    //             active_response_attempt_index: continuationTurns + 1,
    //             feedback_loop_status: AI_FEEDBACK_LOOP_STATUS.INTERRUPTED,
    //             feedback_loop_reason: 'tool_feedback_result_timeout',
    //             feedback_loop_turn: continuationTurns,
    //             last_feedback_at: Date.now(),
    //             parser_interrupt_reason: streamOutcome.interruptReason,
    //         });
    //         KernelEngine.updateProcessStatus(rootProcess.process_uid, PROCESS_STATUS.FAILED);
    //         TurnRendererEngine.finalizeTurn(promptTurnId);
    //         return;
    //     }

    //     hydrateActionRendererFromTerminalEvent({
    //         turnId: promptTurnId,
    //         terminalEvent: terminalActionEvent,
    //     });

    //     currentTurn.finished_at = Date.now();
        
    //     const activePlan = PlanningService.getPlan(sessionId);
    //     const hasPendingPlans = activePlan.short_plan.some(t => t.status === 'pending');
    //     const shouldContinue = !activePlan.yield_to_user && hasPendingPlans;

    //     updateResponseMemory({
    //         status: 'completed',
    //         response_turns: [...existingTurns, currentTurn].slice(-20),
    //         active_response_turn_id: promptTurnId,
    //         active_response_attempt_index: continuationTurns + 1,
    //         feedback_loop_status: shouldContinue ? AI_FEEDBACK_LOOP_STATUS.RUNNING : AI_FEEDBACK_LOOP_STATUS.INTERRUPTED,
    //         feedback_loop_reason: shouldContinue ? 'tool_feedback_loop_continue' : 'tool_feedback_paused_after_action',
    //         feedback_loop_turn: continuationTurns,
    //         last_feedback_at: Date.now(),
    //         parser_interrupt_reason: streamOutcome.interruptReason,
    //     });

    //     if (shouldContinue) {
    //         await new Promise(resolve => setTimeout(resolve, 50));
            
    //         let toolFeedBackStr = "Action completed.";
    //         if (terminalActionEvent?.payload && typeof terminalActionEvent.payload === 'object') {
    //             let jsonStr = JSON.stringify(terminalActionEvent.payload, null, 2);
    //             if (jsonStr.length > 25000) {
    //                 jsonStr = jsonStr.substring(0, 25000) + '\n... [RESULT TRUNCATED DUE TO LENGTH]';
    //             }
    //             toolFeedBackStr = `Action outcome:\n\`\`\`json\n${jsonStr}\n\`\`\``;
    //         }
            
    //         activePrompt = `${toolFeedBackStr}\n\nPlease execute the next 'pending' task in your <plan>. Use the <plan> block to update its status first.`;
    //         continuationTurns++;
    //         rootProcess = KernelEngine.createProcess({
    //             parent_uid: parentProcessUid,
    //             kind: PROCESS_KIND.SYSTEM_BACKGROUND,
    //             command: AI_GATEWAY_PROCESS_TYPE.TOOL_FEEDBACK_LOOP,
    //         });
    //         TurnRendererEngine.finalizeTurn(promptTurnId);
    //         continue;
    //     }

    //     KernelEngine.updateProcessStatus(rootProcess.process_uid, PROCESS_STATUS.DONE);
    //     TurnRendererEngine.finalizeTurn(promptTurnId);
    //     return;
    // }
}
