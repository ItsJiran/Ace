import { KernelEngine } from '../../services/kernelEngine';
import { KernelState } from '../kernelEngine/kernelState';

import { PROCESS_KIND } from '#/schemas/process';
import { AI_FEEDBACK_LOOP_STATUS, AI_SESSION_STATUS } from './types';
import type { AISession, SDKProvider } from './types';
import { AIGatewayEngine } from '../aiGatewayEngine';
import type { KernelAISessionEntry } from '../kernelEngine/types';

// + ======== Session Management Orchestration ============== +

// NOTE : Future development need for kernel state management and process orchestration 
// may arise as we expand session capabilities (e.g. subprocesses for tool calls, 
// shared memory for context, etc.). For now, this manager focuses on session creation 
// and termination, with direct interactions to KernelEngine for process 
// management and state persistence.

class AISessionManagerSingleton {


    // + ======== Session Management Orchestration ============== +

    get(sessionUID: string): AISession | undefined {
        const aiSessionEntry = KernelState.ai_gateway_sessions.get(sessionUID) as KernelAISessionEntry | undefined;

        if (!aiSessionEntry) {
            console.warn(`[AISessionManager] No session found with ID ${sessionUID}`);
            return undefined;
        }

        return KernelEngine.readMemory( aiSessionEntry.memory_uid as string ) as AISession | undefined;
    }

    has(sessionUID: string): boolean {
        const aiSessionEntry = KernelState.ai_gateway_sessions.get(sessionUID) as KernelAISessionEntry | undefined;
        return !!aiSessionEntry;
    }

    list(): AISession[] {
        const sessions: AISession[] = [];
        for (const aiSessionEntry of KernelState.ai_gateway_sessions.values() as Iterable<KernelAISessionEntry>) {
            const sessionState = KernelEngine.readMemory( aiSessionEntry.memory_uid as string ) as AISession | undefined;
            if (sessionState) {
                sessions.push(sessionState);
            }
        }
        return sessions;
    }

    list_sessions_id(): string[] {
        return Object.values(KernelState.ai_gateway_sessions).map(entry => entry.session_uid) as string[];
    }

    // + ============== Session Management API ============== +

    create(sdk: SDKProvider, model: string): AISession {

        // Generate unique session ID and associated process
        const sessionUID = `${crypto.randomUUID()}`;
        const sessionStateMemory = `system:ai_session:${sessionUID}:state`;
        const processUid = `process:ai_session:${sessionUID}`;

        // Note: Since we use custom predefined process UIDs, we might not cleanly support generic `spawnSubprocess`
        // without explicitly modifying process hierarchy in Kernel. But for AI sessions, mapping is enough right now.
        KernelEngine.spawnProcess('ai:session:instance', {
            session_uid: sessionUID,
            session_state_memory: sessionStateMemory,
        }, {
            process_uid: processUid,
            process_kind: PROCESS_KIND.AI_SESSION,
            owner_engine: 'aiGatewayEngine',
        });

        // Create session in AISessionManager and spawn a new process for it.
        const session: AISession = {
            session_uid: sessionUID,
            process_uid: processUid,
            sdk,
            model,

            status: AI_SESSION_STATUS.CONNECTED,
            feedback_loop_status: AI_FEEDBACK_LOOP_STATUS.NONE,

            turn_index: 0,
            turns : [],

            plan: [],
            context : [],

            history : [],
            history_start_index: 0,
            history_end_index: 0,
        };

        // Persist session state in global memory for retrieval and UI subscription.  
        // This is the source of truth for list session exists.
        KernelEngine.writeMemory( 'system:ai_gateway_sessions', {
            session_uid: session.session_uid,
            process_uid: session.process_uid,
            memory_uid: sessionStateMemory,
        } as KernelAISessionEntry, sessionStateMemory);
        
        // Also create a dedicated memory block for session state that UIs can subscribe to for 
        // real-time updates.
        KernelEngine.createMemory(session, processUid, sessionStateMemory);

        console.log(`[AIGatewayEngine] Session ${session.session_uid} created for ${sdk}/${model} under process ${processUid}.`);
        return session;
    }

    close(sessionId: string): void {
        const sessionState = KernelEngine.readMemory( `system:ai_session:${sessionId}:state` ) as AISession | undefined;
        
        if (sessionState?.process_uid) {
            KernelEngine.terminateProcess(sessionState.process_uid);
        }

        console.log(`[AIGatewayEngine] Session ${sessionState?.session_uid} closed and process terminated.`);
    }
}

export const AISessionManager = new AISessionManagerSingleton();
