import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseAIStreamChunk } from '#/services/aiParser';
import { EventBus } from '#/services/eventEngine';
import { StorageEngine } from '#/services/storageEngine';
import { RegistryEngine } from '#/services/registryEngine';
import type { Interaction } from '#/schemas/events';

describe('Feature: Gateway Stream -> Event Bus -> Process Exec -> Storage Socket Workflow', () => {
    beforeEach(() => {
        (EventBus as any).routes.clear();
        (StorageEngine as any).global_ram.clear();
        (StorageEngine as any).classification_ram.clear();
        (StorageEngine as any).memory_sockets.clear();

        RegistryEngine.registerPackage({
            manifest: {
                namespace: 'itsjiran/ace-system',
                package_name: 'itsjiran/ace-system',
                version: '1.0.0',
                owner_scope: 'core',
                source_scope: 'core',
            },
            domains: {
                parsers: {},
            },
        });
    });

    it('should register parser modules used by this flow', async () => {
        RegistryEngine.registerPackageModules('itsjiran/ace-system', {
            '/src/core/packages/system/parsers/EventBlock.ts': await import('#/core/packages/system/parsers/EventBlock'),
        });

        const parsed = parseAIStreamChunk('<event>\ninteraction, null, process-1, null, send, chat_response\n{}\nend_event\n</event>');
        expect(parsed.events.length).toBe(1);
    });

    it('should route an AI Stream block to the EventBus, trigger a Mock Process, and verify the Storage sockets fire', async () => {
        RegistryEngine.registerPackageModules('itsjiran/ace-system', {
            '/src/core/packages/system/parsers/EventBlock.ts': await import('#/core/packages/system/parsers/EventBlock'),
        });

        // 1. Setup the "React Component" (The Observability Socket)
        const reactComponentRenderSpy = vi.fn();
        StorageEngine.subscribe('type:ai_response', reactComponentRenderSpy);

        // 2. Setup the "Background Tool Process" (The Commander listening to the EventBus)
        const mockToolExecutor = vi.fn().mockImplementation((interaction: Interaction) => {
            // The Tool Executor executes the tool safely, and drops the raw data payload into Global RAM
            StorageEngine.dispatchRAMAction({
                action: 'create_memory',
                process_uid: 'test_tool_executor',
                payload: { raw_json: interaction.payload.text },
                classifications: ['type:ai_response']
            });
        });
        EventBus.registerProcessRoute('send:chat_response', mockToolExecutor);

        // 3. The raw AI stream chunk arrives from the Gateway network socket
        const rawStreamFromGateway = `
    <event>
    interaction, null, process-456, null, send, chat_response
    { "text": "This is a massive hallucinated JSON block that represents 10 pages of text." }
    end_event
    </event>`;

        // 4. The Parser strictly decipher the block into an InteractionSchema
        const parsedResult = parseAIStreamChunk(rawStreamFromGateway);
        expect(parsedResult).toBeDefined();

        const aiEvent = parsedResult!.events[0];

        // 5. The Gateway drops the parsed Interaction Ticket onto the EventBus
        EventBus.emit({
            event_type: 'interaction',
            action: aiEvent.headers.action as 'send',
            sub_action: aiEvent.headers.sub_action,
            payload: { text: "massive block" }
        });

        // 6. Assertions!
        // A. Ensure the EventBus successfully caught the request and routed it to the specific Process
        expect(mockToolExecutor).toHaveBeenCalledTimes(1);

        // B. Ensure the Process successfully generated the memory payload, and the O(1) React socket fired!
        expect(reactComponentRenderSpy).toHaveBeenCalledTimes(1);

        // C. Fetch the final payload directly from RAM to prove it works
        const memoryArray = StorageEngine.readClassification('type:ai_response');
        expect(memoryArray).toBeDefined();

        const memoryId = memoryArray![0];
        const massivePayloadData = StorageEngine.readMemory(memoryId);
        expect(massivePayloadData.raw_json).toBe("massive block");
    });
});
