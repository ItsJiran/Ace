import type { AISession, SDKProvider } from './types';

class AISessionManagerSingleton {
    private sessions = new Map<string, AISession>();

    async create(sdk: SDKProvider, model: string): Promise<string> {
        const sessionId = `sess-${crypto.randomUUID()}`;

        const session: AISession = {
            sessionId,
            sdk,
            model,
            activeEventBuffer: '',
            isInsideEventBlock: false,
            status: 'connected',
        };

        this.sessions.set(sessionId, session);
        console.log(`[AIGatewayEngine] Session ${sessionId} created for ${sdk}/${model}.`);
        return sessionId;
    }

    close(sessionId: string): void {
        if (this.sessions.has(sessionId)) {
            this.sessions.delete(sessionId);
            console.log(`[AIGatewayEngine] Session ${sessionId} closed.`);
        }
    }

    get(sessionId: string): AISession | undefined {
        return this.sessions.get(sessionId);
    }

    has(sessionId: string): boolean {
        return this.sessions.has(sessionId);
    }
}

export const AISessionManager = new AISessionManagerSingleton();
