/**
 * SpeechClientEngine — listens for speech progress events from background.
 *
 * Pattern: EventBus.listen() in setupEventRoutes(), same as KeybindEngine.
 */

import { Engine } from '#/shared/engines/engine';
import { EventBus } from '#/shared/engines/event-engine';

class SpeechClientEngineSingleton extends Engine {
    async boot() {}
    async setupKernelSpace() {}
    async setupKernelTerminationHook() {}

    async setupEventRoutes() {
        console.log('[SpeechClient] Setting up event routes...');

        EventBus.listen('speech:tts-progress', (ctx: any) => {
            console.log('[SpeechClient] tts-progress:', ctx.payload?.progress + '%', ctx.payload?.status);
        });

        EventBus.listen('speech:stt-progress', (ctx: any) => {
            console.log('[SpeechClient] stt-progress:', ctx.payload?.progress + '%', ctx.payload?.status);
        });

        console.log('[SpeechClient] Event routes ready.');
    }
}

export const SpeechClientEngine = new SpeechClientEngineSingleton();
