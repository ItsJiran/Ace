import { EventBus } from '../eventEngine';
import { KernelEngine } from '../kernelEngine';
import { AI_GATEWAY_ROUTE_ACTION, AI_RESPONSE_STATUS } from './types';
import type { SDKProvider } from './types';

export function registerSendGatewayRoute(input: {
    createSession: (sdk: SDKProvider, model: string, parentProcessUid?: string) => Promise<string>;
    sendToSession: (sessionId: string, prompt: string, replyToRamKey: string, parentProcessUid?: string) => Promise<void>;
    getActiveSDK: () => SDKProvider | null;
    getActiveModel: () => string | null;
}) {
    EventBus.registerProcessRoute(AI_GATEWAY_ROUTE_ACTION.SEND_GATEWAY, async ({ payload, preallocated_memory, source }) => {
        const prompt = typeof payload?.prompt === 'string' ? payload.prompt.trim() : '';
        const replyToRamKey =
            typeof preallocated_memory?.reply_to_ram_key === 'string'
                ? preallocated_memory.reply_to_ram_key
                : typeof payload?.reply_to_ram_key === 'string'
                    ? payload.reply_to_ram_key
                    : `system:ai_parser:test:${Date.now()}`;

        if (!prompt) {
            KernelEngine.writeMemory(replyToRamKey, {
                prompt,
                text: '',
                raw_response: '',
                parser_batches: [],
                status: AI_RESPONSE_STATUS.ERROR,
                error_message: 'Prompt is required for send_gateway.',
                finished_at: Date.now(),
            }, parentProcessUid);
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

        const parentProcessUid =
            typeof preallocated_memory?.parent_process_uid === 'string'
                ? preallocated_memory.parent_process_uid
                : typeof source?.process_uid === 'string'
                    ? source.process_uid
                    : undefined;

        const sessionId =
            typeof preallocated_memory?.session_id === 'string'
                ? preallocated_memory.session_id
                : await input.createSession(preferredSdk, preferredModel, parentProcessUid);

        // Pre-allocate the Turn Memory tied securely to the Session Process
        const sessionProcessUid = `process:ai_session:${sessionId}`;
        
        KernelEngine.createRuntimeMemory({
            owner_process_uid: sessionProcessUid,
            owner_session_id: sessionId,
            memory_uid: replyToRamKey,
            payload: {
                session_id: sessionId,
                status: 'pending',
                prompt,
                started_at: Date.now(),
            }
        });

        // Register this Turn inside the Master Session State array
        const masterStateKey = `system:ai_session:${sessionId}:state`;
        const sessionState = KernelEngine.readMemory(masterStateKey) || {};
        const existingTurns = Array.isArray(sessionState.turn_memory_uids) ? sessionState.turn_memory_uids : [];
        if (!existingTurns.includes(replyToRamKey)) {
            KernelEngine.updateMemory(masterStateKey, {
                ...sessionState,
                turn_memory_uids: [...existingTurns, replyToRamKey]
            });
        }

        await input.sendToSession(sessionId, prompt, replyToRamKey, parentProcessUid);
    });
}