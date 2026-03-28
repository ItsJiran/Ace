import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import { ProcessEngine } from '#/services/processEngine';
import { ToolEngine } from '#/services/toolEngine';
import { RegistryEngine } from '#/services/registryEngine';
import { PipelineEngine } from '#/services/pipelineEngine';
import { EventBus } from '#/services/eventEngine';
import { StorageEngine } from '#/services/storageEngine';
import { FSEngine } from '#/services/fsEngine';
import { ShellEngine } from '#/services/shellEngine';

vi.mock('@tauri-apps/plugin-fs', () => ({
    BaseDirectory: { AppConfig: 'AppConfig' },
    writeTextFile: vi.fn(async () => undefined),
    readTextFile: vi.fn(async () => '{}'),
    exists: vi.fn(async () => true),
    mkdir: vi.fn(async () => undefined),
    readDir: vi.fn(async () => []),
    remove: vi.fn(async () => undefined),
}));

vi.mock('@tauri-apps/api/path', () => ({
    appConfigDir: vi.fn(async () => '/tmp/appconfig'),
    homeDir: vi.fn(async () => '/tmp/home'),
    join: vi.fn(async (...parts: string[]) => parts.join('/')),
    normalize: vi.fn(async (value: string) => value),
}));

vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(async () => ({ stdout: 'ok', stderr: '', exit_code: 0, success: true })),
}));

describe('Process spawn pattern across engines', () => {
    beforeEach(() => {
        (StorageEngine as any).global_ram.clear();
        (StorageEngine as any).classification_ram.clear();
        (StorageEngine as any).memory_sockets.clear();
        (StorageEngine as any).parent_children.clear();
        (StorageEngine as any).child_parent.clear();
        (EventBus as any).routes.clear();

        if (!(globalThis as any).crypto) {
            (globalThis as any).crypto = {
                randomUUID: () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2),
            };
        }

        (globalThis as any).window = (globalThis as any).window || {};
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete (globalThis as any).window.ACE;
    });

    it('spawns tracked process for ToolEngine.execute with parent linkage', async () => {
        const trackSpy = vi
            .spyOn(ProcessEngine, 'track')
            .mockImplementation(async (_type, _meta, _fn, _options) => ({ ok: true }));

        vi.spyOn(ToolEngine, 'validate').mockReturnValue({});
        vi.spyOn(RegistryEngine, 'getDomainEntry').mockReturnValue({
            entry: {
                implementation: {
                    handler: vi.fn(async () => ({ ok: true })),
                },
            },
        } as any);

        await ToolEngine.execute('itsjiran/ace-system', 'dummy_tool', { foo: 'bar' }, { parent_process_uid: 'proc-parent-1' } as any);

        expect(trackSpy).toHaveBeenCalledTimes(1);
        const call = trackSpy.mock.calls[0];
        expect(call[0]).toBe('tool:itsjiran/ace-system:dummy_tool');
        expect(call[3]).toMatchObject({
            parent_process_uid: 'proc-parent-1',
            process_kind: 'tool_run',
            owner_engine: 'toolEngine',
        });
    });

    it('spawns tracked process for PipelineEngine.run when tracked=true', async () => {
        const trackSpy = vi
            .spyOn(ProcessEngine, 'track')
            .mockImplementation(async (_type, _meta, _fn, _options) => ({ pipeline: 'ok' } as any));

        const pipeline = new PipelineEngine<any, any>('test-pipeline');
        pipeline.addStep({
            name: 'noop',
            execute: async (input) => input,
        });

        await pipeline.run({ input: true }, { tracked: true, parent_process_uid: 'proc-parent-2' });

        expect(trackSpy).toHaveBeenCalledTimes(1);
        const call = trackSpy.mock.calls[0];
        expect(call[0]).toBe('pipeline:test-pipeline');
        expect(call[3]).toMatchObject({
            parent_process_uid: 'proc-parent-2',
            process_kind: 'pipeline_run',
            owner_engine: 'pipelineEngine',
        });
    });

    it('spawns tracked process for FSEngine tracked operations', async () => {
        const trackMock = vi.fn(async () => ({ ok: true }));
        (globalThis as any).window.ACE = {
            process: {
                track: trackMock,
            },
        };

        await FSEngine.trackedRead('a.txt', { parent_process_uid: 'proc-parent-3' });

        expect(trackMock).toHaveBeenCalledTimes(1);
        const fsCall = (trackMock.mock.calls as unknown[][])[0] ?? [];
        expect(fsCall[0]).toBe('fs:read_file');
        expect(fsCall[3]).toMatchObject({
            parent_process_uid: 'proc-parent-3',
            process_kind: 'fs_task',
            owner_engine: 'fsEngine',
        });
    });

    it('spawns tracked process for ShellEngine.run with parent process', async () => {
        const trackMock = vi.fn(async () => ({ stdout: 'ok', stderr: '', exit_code: 0, success: true }));
        (globalThis as any).window.ACE = {
            process: {
                track: trackMock,
            },
        };

        await ShellEngine.run('echo', {
            args: ['hello'],
            parent_process_uid: 'proc-parent-4',
        });

        expect(trackMock).toHaveBeenCalledTimes(1);
        const shellCall = (trackMock.mock.calls as unknown[][])[0] ?? [];
        expect(shellCall[0]).toBe('shell:echo');
        expect(shellCall[3]).toMatchObject({
            parent_process_uid: 'proc-parent-4',
            process_kind: 'shell_task',
            owner_engine: 'shellEngine',
        });
    });

    it('keeps EventBus fire-and-forget while handler can spawn process (window-style pattern)', async () => {
        const trackSpy = vi
            .spyOn(ProcessEngine, 'track')
            .mockImplementation(async (_type, _meta, _fn, _options) => {
                await _fn('proc-child-window');
                return undefined;
            });

        const windowActionHandler = vi.fn(async ({ source, action }: any) => {
            const sourceProcessUid = typeof source?.process_uid === 'string' ? source.process_uid : undefined;
            await ProcessEngine.track(
                `window:${action}`,
                { source_process_uid: sourceProcessUid },
                async () => undefined,
                {
                    parent_process_uid: sourceProcessUid,
                    process_kind: 'window_task',
                    owner_engine: 'windowEngine',
                },
            );
        });

        EventBus.registerProcessRoute('open_window', windowActionHandler);

        EventBus.emit({
            event_type: 'interaction',
            action: 'open_window',
            payload: { window: 'demo' },
            process_uid: 'proc-parent-window',
        });

        await Promise.resolve();
        await Promise.resolve();

        expect(windowActionHandler).toHaveBeenCalledTimes(1);
        expect(trackSpy).toHaveBeenCalledWith(
            'window:open_window',
            expect.objectContaining({ source_process_uid: 'proc-parent-window' }),
            expect.any(Function),
            expect.objectContaining({
                parent_process_uid: 'proc-parent-window',
                process_kind: 'window_task',
                owner_engine: 'windowEngine',
            }),
        );
    });
});
