import { KernelEngine } from '../../services/kernel-engine';
import { KernelState } from '../kernel-engine/kernel-state';

import { PROCESS_KIND } from '#/schemas/process';
import { AIAutonomousFollowUpLoopStatus, AISessionStatus } from '#/schemas/ai';
import type { AISessionRuntime, SDKProvider } from '#/schemas/ai';
import type { KernelAISessionEntry } from '../kernel-engine/types';

// + ======== Session Management Orchestration ============== +

// NOTE : Future development need for kernel state management and process orchestration 
// may arise as we expand session capabilities (e.g. subprocesses for tool calls, 
// shared memory for context, etc.). For now, this manager focuses on session creation 
// and termination, with direct interactions to KernelEngine for process 
// management and state persistence.

class AISessionManagerSingleton {
    private static readonly SESSION_REGISTRY_KEY = 'system:ai_gateway_sessions';


    // + ======== Session Management Orchestration ============== +

    get(sessionUID: string): AISessionRuntime | undefined {
        const aiSessionEntry = KernelState.ai_gateway_sessions.get(sessionUID) as KernelAISessionEntry | undefined;

        if (!aiSessionEntry) {
            console.warn(`[AISessionManager] No session found with ID ${sessionUID}`);
            return undefined;
        }

        return KernelEngine.readMemory( aiSessionEntry.memory_uid as string ) as AISessionRuntime | undefined;
    }

    has(sessionUID: string): boolean {
        const aiSessionEntry = KernelState.ai_gateway_sessions.get(sessionUID) as KernelAISessionEntry | undefined;
        return !!aiSessionEntry;
    }

    list(): AISessionRuntime[] {
        const sessions: AISessionRuntime[] = [];
        for (const aiSessionEntry of KernelState.ai_gateway_sessions.values() as Iterable<KernelAISessionEntry>) {
            const sessionState = KernelEngine.readMemory( aiSessionEntry.memory_uid as string ) as AISessionRuntime | undefined;
            if (sessionState) {
                sessions.push(sessionState);
            }
        }
        return sessions;
    }

    list_sessions_id(): string[] {
        return Array.from(KernelState.ai_gateway_sessions.values()).map(entry => entry.session_uid);
    }

    // + ============== Session Management API ============== +

    create(sdk?: SDKProvider | undefined, model?: string | undefined): AISessionRuntime {

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
            owner_engine: 'ai-gateway-engine',
        });

        // Create session in AISessionManager and spawn a new process for it.
        const session: AISessionRuntime = {
            thread_id: sessionUID,
            session_uid: sessionUID,
            process_uid: processUid,

            sdk,
            model,

            status: AISessionStatus.IDLE,
            state: 'reasoning',
            state_cycle_index: 0,
            autonomous_follow_up_loop_status: AIAutonomousFollowUpLoopStatus.NONE,

            turn_index: 0,
            turns : [],

            plan: [],
            context : [],
            context_start_index: 0,
            context_end_index: 0,
            context_records: [],
            long_term_storage: {
                root_dir: `com.ace.assistant/ai/${sessionUID}`,
                memories_dir: `com.ace.assistant/ai/${sessionUID}/memories`,
                history_dir: `com.ace.assistant/ai/${sessionUID}/history`,
                artifacts_dir: `com.ace.assistant/ai/${sessionUID}/artifacts`,
            },

            active_agent: 'coordinator',
            mirrored_ace_tools: [],
            known_ace_tools: [],
        };

        // Persist registry metadata separately from the full session state.
        // The registry is a lightweight index; the entity memory holds the full session payload.
        KernelEngine.batch(() => {
            KernelEngine.createMemory(session, processUid, sessionStateMemory);
            KernelEngine.mutateMapMemory<string, KernelAISessionEntry>(
                AISessionManagerSingleton.SESSION_REGISTRY_KEY,
                (draft) => {
                    draft.set(session.session_uid, {
                        session_uid: session.session_uid,
                        process_uid: session.process_uid,
                        memory_uid: sessionStateMemory,
                    });
                },
            );
        });

        console.log(`[AIGatewayEngine] Session ${session.session_uid} created for ${sdk}/${model} under process ${processUid}.`);
        return session;
    }

    close(sessionId: string): void {
        const sessionEntry = KernelState.ai_gateway_sessions.get(sessionId) as KernelAISessionEntry | undefined;
        const sessionStateMemory = sessionEntry?.memory_uid ?? `system:ai_session:${sessionId}:state`;
        const sessionState = KernelEngine.readMemory(sessionStateMemory) as AISessionRuntime | undefined;

        // Remove the session from the system registry first so any termination hooks
        // see a consistent "already detached" registry view.
        if (sessionEntry) {
            KernelEngine.mutateMapMemory<string, KernelAISessionEntry>(
                AISessionManagerSingleton.SESSION_REGISTRY_KEY,
                (draft) => {
                    draft.delete(sessionId);
                },
            );
        }
        
        if (sessionState?.process_uid) {
            KernelEngine.terminateProcess(sessionState.process_uid);
        } else if (sessionEntry?.memory_uid) {
            KernelEngine.deleteMemory(sessionEntry.memory_uid);
        }

        console.log(`[AIGatewayEngine] Session ${sessionState?.session_uid} closed and process terminated.`);
    }
}

export const AISessionManager = new AISessionManagerSingleton();
