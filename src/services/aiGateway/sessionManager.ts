import { KernelEngine } from '../../services/kernelEngine';
import { PROCESS_KIND, PROCESS_STATUS } from '#/schemas/process';
import { AI_GATEWAY_PROCESS_TYPE, AI_SESSION_STATUS } from './types';
import type { AISession, AISessionSnapshot, SDKProvider } from './types';

// Session Lifecycle API
class AISessionManagerSingleton {

    constructor() {
        // On initialization, we can scan existing processes to populate sessions if needed.
        // For simplicity, we'll assume sessions are only created through this manager.
    }

    // Map list of
    private sessions = new Map<string, AISession>();
    

    // + ======== Session Management Orchestration ============== +

    get(sessionId: string): AISession | undefined {
        return this.sessions.get(sessionId);
    }

    has(sessionId: string): boolean {
        return this.sessions.has(sessionId);
    }

    list(): AISessionSnapshot[] {
        return Array.from(this.sessions.values()).map((session) => ({
            sessionId: session.sessionId,
            sdk: session.sdk,
            model: session.model,
            status: session.status,
            activeOutputRamKey: session.activeOutputRamKey,
            isInsideEventBlock: session.isInsideEventBlock,
            activeEventBufferLength: session.activeEventBuffer.length,
            protocol_state: session.lastProtocolState ?? session.currentProtocolState,
        }));
    }

    // + ============== Session Management API ============== +

    create(sdk: SDKProvider, model: string): string {
        const sessionId = `sess-${crypto.randomUUID()}`;
        const sessionStateMemory = `system:ai_session:${sessionId}:state`;
        const processUid = `process:ai_session:${sessionId}`;

        // Note: Since we use custom predefined process UIDs, we might not cleanly support generic `spawnSubprocess`
        // without explicitly modifying process hierarchy in Kernel. But for AI sessions, mapping is enough right now.
        KernelEngine.spawnProcess(AI_GATEWAY_PROCESS_TYPE.SESSION, {
            session_id: sessionId,
            sdk,
            model,
        }, {
            process_uid: processUid,
            process_kind: PROCESS_KIND.AI_SESSION,
            owner_engine: 'aiGatewayEngine',
            payload: {
                status: PROCESS_STATUS.RUNNING,
                live_state: 'connected',
                session_id: sessionId,
                sdk,
                model,
            },
        });

        // Create session in AISessionManager and spawn a new process for it.
        const session: AISession = {
            sessionId,
            sdk,
            model,
            activeEventBuffer: '',
            isInsideEventBlock: false,
            status: AI_SESSION_STATUS.CONNECTED,
            processUid,
        };

        this.sessions.set(sessionId, session);
        
        KernelEngine.createMemory({
            session_id: sessionId,
            sdk,
            model,
            status: session.status,
            turn_memory_uids: [],
        }, processUid, sessionStateMemory);

        console.log(`[AIGatewayEngine] Session ${sessionId} created for ${sdk}/${model} under process ${processUid}.`);
        return sessionId;
    }

    close(sessionId: string): void {
        const session = this.sessions.get(sessionId);
        if (session) {
            if (session.processUid) {
                KernelEngine.killProcess(session.processUid);
            }
            this.sessions.delete(sessionId);
            console.log(`[AIGatewayEngine] Session ${sessionId} closed and process terminated.`);
        }
    }
}

export const AISessionManager = new AISessionManagerSingleton();
