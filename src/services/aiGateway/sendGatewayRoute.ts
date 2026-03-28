import { EventBus } from '../eventEngine';
import { StorageEngine } from '../storageEngine';
import type { SDKProvider } from './types';

export function registerSendGatewayRoute(input: {
    createSession: (sdk: SDKProvider, model: string) => Promise<string>;
    sendToSession: (sessionId: string, prompt: string, replyToRamKey: string, parentProcessUid?: string) => Promise<void>;
    getActiveSDK: () => SDKProvider | null;
    getActiveModel: () => string | null;
}) {
    EventBus.registerProcessRoute('send_gateway', async ({ payload, preallocated_memory, source }) => {
        const prompt = typeof payload?.prompt === 'string' ? payload.prompt.trim() : '';
        const replyToRamKey =
            typeof preallocated_memory?.reply_to_ram_key === 'string'
                ? preallocated_memory.reply_to_ram_key
                : typeof payload?.reply_to_ram_key === 'string'
                    ? payload.reply_to_ram_key
                    : `system:ai_parser:test:${Date.now()}`;

        if (!prompt) {
            StorageEngine.dispatchRAMAction({
                action: 'create_memory',
                memory_uid: replyToRamKey,
                payload: {
                    prompt,
                    text: '',
                    raw_response: '',
                    parser_batches: [],
                    status: 'error',
                    error_message: 'Prompt is required for send_gateway.',
                    finished_at: Date.now(),
                },
                classifications: ['system:dev', 'system:ai_parser'],
            });
            return;
        }

        const preferredSdk =
            typeof preallocated_memory?.sdk === 'string'
                ? (preallocated_memory.sdk as SDKProvider)
                : (input.getActiveSDK() ?? 'openai');

        const preferredModel =
            typeof preallocated_memory?.model === 'string'
                ? preallocated_memory.model
                : (input.getActiveModel() ?? 'gpt-4o-mini');

        const sessionId =
            typeof preallocated_memory?.session_id === 'string'
                ? preallocated_memory.session_id
                : await input.createSession(preferredSdk, preferredModel);

        const parentProcessUid =
            typeof preallocated_memory?.parent_process_uid === 'string'
                ? preallocated_memory.parent_process_uid
                : typeof source?.process_uid === 'string'
                    ? source.process_uid
                    : undefined;

        await input.sendToSession(sessionId, prompt, replyToRamKey, parentProcessUid);
    });
}