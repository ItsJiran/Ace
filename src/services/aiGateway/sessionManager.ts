import { KernelEngine } from '../../services/kernelEngine';
import { PROCESS_KIND, PROCESS_STATUS } from '#/schemas/process';
import { AI_GATEWAY_PROCESS_TYPE, AI_SESSION_STATUS } from './types';
import type { AISession, AISessionSnapshot, SDKProvider } from './types';

class AISessionManagerSingleton {
    private sessions = new Map<string, AISession>();

    async create(sdk: SDKProvider, model: string): Promise<string> {
        const sessionId = `sess-${crypto.randomUUID()}`;
        const processUid = `process:ai_session:${sessionId}`;

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
        }, processUid, `system:ai_session:${sessionId}:state`);

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
}

export const AISessionManager = new AISessionManagerSingleton();
