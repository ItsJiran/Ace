import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseAIStreamChunk } from '#/services/aiParser';
import { useEventEngine } from '#/services/eventEngine';
import { useStorageEngine } from '#/services/storageEngine';
import type { Listener } from '#/schemas/events';

describe('Engine Integration Workflow', () => {
    beforeEach(() => {
        // Reset Zustand states
        useEventEngine.setState({ processRegistry: {}, mountingBuffer: {}, listeners: [] });
        useStorageEngine.setState({ ramStore: {}, classificationIndex: {} });
    });

    it('should successfully parse a stream, store payload in RAM, and dispatch UID to Event Engine', () => {
        // 1. Setup global state: A Process is ready to listen
        const mockWindowCallback = vi.fn();
        useEventEngine.getState().registerProcess('process-456', 'ready');
        useEventEngine.getState().subscribe((event) => {
            if (event.target_process_uid === 'process-456') {
                mockWindowCallback(event);
            }
        });

        // 2. The Raw AI Stream arrives from the network
        const rawStreamFromGateway = `
Here is a very long response that shouldn't clog the Event Bus.
\`\`\`event
interaction, null, process-456, null, send, chat_response
{ "text": "This is a massive hallucinated JSON block that represents 10 pages of text." }
end_event
`;

        // 3. The AI Parser deciphers the block
        const parsedResult = parseAIStreamChunk(rawStreamFromGateway);
        expect(parsedResult).toBeDefined();
        expect(parsedResult?.events.length).toBe(1);

        const aiEvent = parsedResult!.events[0];
        expect(aiEvent.is_complete).toBe(true);

        // 4. The "Integrator / Router" intercepts the heavy payload and dumps it into RAM
        const storageStart = useStorageEngine.getState();
        const ramInjectionResult = storageStart.dispatchRAMAction({
            action: 'create_memory',
            process_uid: 'global', // Gateway payload, usually global until specifically consumed
            payload: { raw_json: aiEvent.raw_payload_buffer },
            classifications: ['type:ai_response', `process:${aiEvent.headers.process_uid}`]
        });

        // Ensure the RAM engine successfully created and indexed the payload
        const storageEnd = useStorageEngine.getState();
        expect(storageEnd.ramStore[ramInjectionResult as string]).toBeDefined();
        expect(storageEnd.classificationIndex['type:ai_response']).toContain(ramInjectionResult as string);

        // 5. The "Integrator / Router" formats the lightweight payload and dispatches to the Event Bus
        const dispatchPayload: Listener = {
            event_type: 'listener',
            target_process_uid: aiEvent.headers.process_uid,
            listened_event: aiEvent.headers.sub_action || aiEvent.headers.action,
            source_uid: 'gateway',
            reaction: { reaction_type: 'forward_to_widget' },
            payload: {
                memory_uid: ramInjectionResult as string
            }
        };

        useEventEngine.getState().dispatch(dispatchPayload);

        // 6. Assert the UI Component (Window) successfully caught the lightweight ID
        expect(mockWindowCallback).toHaveBeenCalledTimes(1);

        const receivedEvent = mockWindowCallback.mock.calls[0][0] as Listener;
        expect(receivedEvent.payload.memory_uid).toBe(ramInjectionResult);

        // 7. Assert the UI Component can successfully look up the heavy data synchronously using the ID
        const resolvedPayloadFromRAM = storageEnd.ramStore[receivedEvent.payload.memory_uid!];
        expect(resolvedPayloadFromRAM.raw_json).toContain("massive hallucinated JSON block");
    });
});
