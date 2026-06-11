/**
 * SpeechClientEngine — client-side bridge for speech model events.
 *
 * Receives progress events pushed from background SpeechEngine via RPC.
 * Same pattern as AgentClientEngine.setupRpcRoutes().
 */

import { Engine } from '#/shared/engines/engine';
import { RPCEngine } from '#/shared/engines/rpc-engine';
import { EventBus } from '#/shared/engines/event-engine';

class SpeechClientEngineSingleton extends Engine {
    async boot() {}
    async setupKernelSpace() {}
    async setupKernelTerminationHook() {}

    async setupEventRoutes() {
        // Background SpeechEngine calls RPCEngine.invoke('speech.client.progress', ...) 
        // to push progress events. We receive them here and forward to EventBus.
        await RPCEngine.handle(
            'speech.client.progress',
            async ({ payload }: { payload: { tts?: any; stt?: any } }) => {
                if (payload.tts) {
                    EventBus.emit('speech:tts-progress', { payload: payload.tts }).catch(() => {});
                }
                if (payload.stt) {
                    EventBus.emit('speech:stt-progress', { payload: payload.stt }).catch(() => {});
                }
            },
        );
    }
}

export const SpeechClientEngine = new SpeechClientEngineSingleton();
