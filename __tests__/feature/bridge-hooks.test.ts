import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KernelEngine } from '#/services/kernel-engine';
import {
    initializeBridgeHooks,
    registerProcessContextHook,
} from '#/services/bridge-hooks';

function getBridgeHooks() {
    return ((globalThis as any).window?.ACE?.hooks ?? {}) as {
        useProcessContext?: () => { process_uid?: string; parent_process_uid?: string };
        spawnSubprocessWithContext?: (
            type: string,
            options?: {
                parent_process_uid?: string;
                metadata?: Record<string, any>;
                owner_engine?: string;
                payload?: Record<string, any>;
            },
        ) => any;
        createMemoryWithContext?: (
            payload: Record<string, any>,
            options?: {
                owner_process_uid?: string;
                memory_scope?: 'process' | 'session' | 'durable';
                retention_policy?: 'drop_on_done' | 'drop_on_cancel' | 'keep_on_done' | 'promote_to_context';
                classifications?: string[];
            },
        ) => string | null;
    };
}

describe('BridgeHooks (Phase E)', () => {
    beforeEach(() => {
        (globalThis as any).window = (globalThis as any).window || {};
        (globalThis as any).window.ACE = {};
        vi.restoreAllMocks();
    });

    afterEach(() => {
        delete (globalThis as any).window?.ACE;
        vi.restoreAllMocks();
    });

    it('registers bridge hooks into window.ACE during initialization', () => {
        initializeBridgeHooks();

        const hooks = getBridgeHooks();
        expect(typeof hooks.useProcessContext).toBe('function');
        expect(typeof hooks.spawnSubprocessWithContext).toBe('function');
        expect(typeof hooks.createMemoryWithContext).toBe('function');
    });

    it('useProcessContext falls back to KernelEngine current context when no React hook is registered', () => {
        vi.spyOn(KernelEngine, 'getCurrentProcessContext').mockReturnValue('proc-fallback');

        initializeBridgeHooks();
        const hooks = getBridgeHooks();

        const context = hooks.useProcessContext?.();

        expect(context).toEqual({
            process_uid: 'proc-fallback',
            parent_process_uid: undefined,
        });
    });

    it('useProcessContext returns context from registered React hook', () => {
        registerProcessContextHook(() => ({
            process_uid: 'proc-react',
            parent_process_uid: 'proc-parent',
        }));

        initializeBridgeHooks();
        const hooks = getBridgeHooks();

        const context = hooks.useProcessContext?.();

        expect(context).toEqual({
            process_uid: 'proc-react',
            parent_process_uid: 'proc-parent',
        });
    });

    it('useProcessContext falls back when registered hook throws', () => {
        registerProcessContextHook(() => {
            throw new Error('outside React render');
        });
        vi.spyOn(KernelEngine, 'getCurrentProcessContext').mockReturnValue('proc-safe-fallback');

        initializeBridgeHooks();
        const hooks = getBridgeHooks();

        const context = hooks.useProcessContext?.();

        expect(context).toEqual({
            process_uid: 'proc-safe-fallback',
            parent_process_uid: undefined,
        });
    });

    it('spawnSubprocessWithContext injects parent from current process context when missing', () => {
        vi.spyOn(KernelEngine, 'getCurrentProcessContext').mockReturnValue('proc-parent-auto');
        const spawnSpy = vi.spyOn(KernelEngine, 'spawnSubprocess').mockReturnValue({
            process_uid: 'proc-child',
        } as any);

        initializeBridgeHooks();
        const hooks = getBridgeHooks();

        const result = hooks.spawnSubprocessWithContext?.('tool:run', {
            metadata: { from: 'test' },
            owner_engine: 'tool-engine',
            payload: { a: 1 },
        });

        expect(spawnSpy).toHaveBeenCalledWith('proc-parent-auto', 'tool:run', {
            metadata: { from: 'test' },
            owner_engine: 'tool-engine',
            payload: { a: 1 },
        });
        expect(result).toEqual({ process_uid: 'proc-child' });
    });

    it('spawnSubprocessWithContext prefers explicit parent_process_uid over fallback', () => {
        vi.spyOn(KernelEngine, 'getCurrentProcessContext').mockReturnValue('proc-parent-fallback');
        const spawnSpy = vi.spyOn(KernelEngine, 'spawnSubprocess').mockReturnValue({
            process_uid: 'proc-explicit',
        } as any);

        initializeBridgeHooks();
        const hooks = getBridgeHooks();

        hooks.spawnSubprocessWithContext?.('pipeline:run', {
            parent_process_uid: 'proc-parent-explicit',
        });

        expect(spawnSpy).toHaveBeenCalledWith('proc-parent-explicit', 'pipeline:run', {
            metadata: undefined,
            owner_engine: undefined,
            payload: undefined,
        });
    });

    it('spawnSubprocessWithContext returns null and warns when no parent exists', () => {
        vi.spyOn(KernelEngine, 'getCurrentProcessContext').mockReturnValue(undefined);
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        initializeBridgeHooks();
        const hooks = getBridgeHooks();

        const result = hooks.spawnSubprocessWithContext?.('tool:run');

        expect(result).toBeNull();
        expect(warnSpy).toHaveBeenCalled();
    });

    it('createMemoryWithContext injects owner from current process context when missing', () => {
        vi.spyOn(KernelEngine, 'getCurrentProcessContext').mockReturnValue('proc-owner-auto');
        const createMemorySpy = vi.spyOn(KernelEngine, 'createRuntimeMemory').mockReturnValue('mem-1');

        initializeBridgeHooks();
        const hooks = getBridgeHooks();

        const result = hooks.createMemoryWithContext?.(
            { value: 42 },
            {
                classifications: ['system:test'],
                memory_scope: 'process',
                retention_policy: 'drop_on_done',
            },
        );

        expect(createMemorySpy).toHaveBeenCalledWith({
            owner_process_uid: 'proc-owner-auto',
            payload: { value: 42 },
            memory_scope: 'process',
            retention_policy: 'drop_on_done',
            classifications: ['system:test'],
        });
        expect(result).toBe('mem-1');
    });

    it('createMemoryWithContext returns null and warns when no owner exists', () => {
        vi.spyOn(KernelEngine, 'getCurrentProcessContext').mockReturnValue(undefined);
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        initializeBridgeHooks();
        const hooks = getBridgeHooks();

        const result = hooks.createMemoryWithContext?.({ test: true });

        expect(result).toBeNull();
        expect(warnSpy).toHaveBeenCalled();
    });

    it('createMemoryWithContext returns null when KernelEngine.createRuntimeMemory throws', () => {
        vi.spyOn(KernelEngine, 'getCurrentProcessContext').mockReturnValue('proc-owner');
        vi.spyOn(KernelEngine, 'createRuntimeMemory').mockImplementation(() => {
            throw new Error('simulated failure');
        });
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        initializeBridgeHooks();
        const hooks = getBridgeHooks();

        const result = hooks.createMemoryWithContext?.({ test: true });

        expect(result).toBeNull();
        expect(errorSpy).toHaveBeenCalled();
    });
});
