import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseAIStreamChunk } from '#/services/aiParser';
import { EventBus } from '#/services/eventEngine';
import { KernelEngine } from '#/services/kernelEngine';
import { RegistryEngine } from '#/services/registryEngine';
import type { Interaction } from '#/schemas/events';

describe('Feature: Gateway Stream -> Event Bus -> Process Exec -> Storage Socket Workflow', () => {
    let testProcessUid: string;

    beforeEach(() => {
        (EventBus as any).routes.clear();
        KernelEngine.resetKernelSpace();
        testProcessUid = KernelEngine.spawnProcess('test').process_uid;

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

        const reactComponentRenderSpy = vi.fn();
        const createdMemoryUids: string[] = [];

        const mockToolExecutor = vi.fn().mockImplementation((interaction: Interaction) => {
            const memoryUid = KernelEngine.createMemory({ raw_json: interaction.payload.text }, testProcessUid) as string;
            createdMemoryUids.push(memoryUid);
            const unsubscribe = KernelEngine.subscribe(memoryUid, reactComponentRenderSpy);
            KernelEngine.updateMemory(memoryUid, { delivered: true });
            unsubscribe();
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

        expect(mockToolExecutor).toHaveBeenCalledTimes(1);
        expect(reactComponentRenderSpy).toHaveBeenCalledTimes(1);
        const memoryId = createdMemoryUids[0];
        expect(memoryId).toBeDefined();
        const massivePayloadData = KernelEngine.readMemory(memoryId);
        expect(massivePayloadData.raw_json).toBe("massive block");
    });
});
