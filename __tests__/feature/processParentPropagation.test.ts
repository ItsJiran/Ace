import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EventBus } from '#/services/eventEngine';
import { registerSendGatewayRoute } from '#/services/aiGateway/sendGatewayRoute';
import { sendToSession as sendStreamToSession } from '#/services/aiGateway/httpClient';
import { ProcessEngine } from '#/services/processEngine';
import { KernelEngine } from '#/services/kernelEngine';
import type { AIGatewayConfig } from '#/schemas/ai_gateway';

vi.mock('#/services/aiGateway/streamHandler', () => ({
    handleSessionStreamChunk: vi.fn(() => ({ interrupted: false })),
}));

describe('Process parent propagation', () => {
    beforeEach(() => {
        (EventBus as any).routes.clear();
        KernelEngine.resetKernelSpace();

        if (!(globalThis as any).crypto) {
            (globalThis as any).crypto = {
                randomUUID: () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2),
            };
        }
    });

    it('send_gateway route forwards source process uid as parent process uid', async () => {
        const sendToSession = vi.fn(async () => undefined);

        registerSendGatewayRoute({
            createSession: vi.fn(async () => 'sess-1'),
            sendToSession,
            getActiveSDK: () => 'openai',
            getActiveModel: () => 'gpt-4o-mini',
        });

        const routeHandlers = (EventBus as any).routes.get('send_gateway') as Array<(args: any) => Promise<void>>;
        expect(routeHandlers?.length).toBeGreaterThan(0);

        await routeHandlers[0]({
            payload: { prompt: 'hello' },
            preallocated_memory: {},
            source: { process_uid: 'proc-window-parent' },
            action: 'send_gateway',
        });

        expect(sendToSession).toHaveBeenCalledWith(
            'sess-1',
            'hello',
            expect.stringContaining('system:ai_parser:test:'),
            'proc-window-parent',
        );
    });

    it('http client spawns parser subprocess under provided gateway process uid', async () => {
        const spawnSpy = vi.spyOn(ProcessEngine, 'spawnSubprocess').mockReturnValue({
            process_uid: 'proc-parser-child',
        } as any);
        const lifecycleSpy = vi.spyOn(ProcessEngine, 'updateLifecycleState').mockReturnValue(true as any);

        const readMock = vi.fn()
            .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('chunk-1') })
            .mockResolvedValueOnce({ done: true, value: undefined });

        const cancelMock = vi.fn(async () => undefined);

        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            body: {
                getReader: () => ({
                    read: readMock,
                    cancel: cancelMock,
                }),
            },
        })));

        const session = {
            sessionId: 'sess-2',
            sdk: 'openai',
            model: 'gpt-4o-mini',
            activeOutputRamKey: null,
            activeEventBuffer: '',
            isInsideEventBlock: false,
            status: 'connected',
        } as any;

        const config: AIGatewayConfig = {
            active_sdk: 'openai',
            active_model: 'gpt-4o-mini',
            sdks: {
                openai: {
                    api_key: 'k',
                    models: [],
                },
            },
        } as any;

        await sendStreamToSession(
            session,
            'hello',
            'system:test:reply',
            config,
            async () => 'http://localhost:8888',
            {
                process_uid: 'proc-gateway-parent',
            },
        );

        expect(spawnSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                parent_process_uid: 'proc-gateway-parent',
                type: 'ai_gateway:parser_stream',
                process_kind: 'ai_block',
            }),
        );

        expect(lifecycleSpy).toHaveBeenCalledWith('proc-parser-child', 'running');
        expect(lifecycleSpy).toHaveBeenCalledWith('proc-parser-child', 'done');
    });
});
