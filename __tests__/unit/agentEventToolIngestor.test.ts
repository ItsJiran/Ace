import { beforeEach, describe, expect, it, vi } from 'vitest';

import { pumpPendingGatewayToolIntents } from '#/services/aiGateway/sub-services/interactionParserLoop/agentEventToolIngestor';
import { EventBus } from '#/services/eventEngine';
import { HealthProbe } from '#/services/aiGateway/healthProbe';
import { KernelEngine } from '#/services/kernelEngine';

describe('agentEventToolIngestor', () => {
    beforeEach(() => {
        KernelEngine.resetKernelSpace();
        (EventBus as any).routes.clear();
    });

    it('fetches pending gateway tool intents over http and dispatches execute_tool', async () => {
        const process = KernelEngine.spawnProcess('ai_session_test');
        const emitSpy = vi.spyOn(EventBus, 'emit').mockImplementation(() => {});
        vi.spyOn(HealthProbe, 'ensure').mockResolvedValue('http://127.0.0.1:8888');
        vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: true,
            json: async () => ({
                intents: [{
                    request_id: 'ace-tool-request:123',
                    package_ref: 'itsjiran/ace-system',
                    tool_slug: 'fs-tool',
                    payload: { path: 'README.md' },
                }],
            }),
        } as Response);

        KernelEngine.writeMemory('system:ai_session:session-123:state', {
            process_uid: process.process_uid,
            turn_index: 0,
            turns: [{ assistant_renderers: [], entries: [] }],
            context_records: [],
            known_ace_tools: [],
        });

        const abortController = new AbortController();
        const pumpPromise = pumpPendingGatewayToolIntents('session-123', abortController.signal);
        await Promise.resolve();
        abortController.abort();
        await pumpPromise;

        expect(emitSpy).toHaveBeenCalledWith(expect.objectContaining({
            action: 'execute_tool',
            process_uid: process.process_uid,
            payload: expect.objectContaining({
                request_id: 'ace-tool-request:123',
                package_ref: 'itsjiran/ace-system',
                tool_slug: 'fs-tool',
                payload: { path: 'README.md' },
                source: 'gateway_tool_http_intent',
            }),
            preallocated_memory: expect.objectContaining({
                session_id: 'session-123',
                gateway_tool_request_id: 'ace-tool-request:123',
            }),
        }));
    });
});