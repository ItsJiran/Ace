import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KernelEngine } from '#/services/kernel-engine';
import { AISessionManager } from '#/services/aiGateway/session-manager';

describe('Kernel registry memory conventions', () => {
    beforeEach(() => {
        KernelEngine.resetKernelSpace();
    });

    it('mutateMapMemory only notifies subscribers of the targeted memory slot', () => {
        const targetListener = vi.fn();
        const otherListener = vi.fn();

        KernelEngine.registerSystemMemory('system:test:registry', new Map());
        KernelEngine.registerSystemMemory('system:test:other', { ok: true });

        KernelEngine.subscribe('system:test:registry', targetListener);
        KernelEngine.subscribe('system:test:other', otherListener);

        KernelEngine.mutateMapMemory<string, { label: string }>('system:test:registry', (draft) => {
            draft.set('entry-1', { label: 'one' });
        });

        const registry = KernelEngine.readMemory('system:test:registry') as Map<string, { label: string }>;
        expect(registry).toBeInstanceOf(Map);
        expect(registry.get('entry-1')).toEqual({ label: 'one' });
        expect(targetListener).toHaveBeenCalledTimes(1);
        expect(otherListener).not.toHaveBeenCalled();
    });

    it('stores AI sessions as registry references plus entity memory', () => {
        const session = AISessionManager.create('openai', 'gpt-5.4');

        const registry = KernelEngine.readMemory('system:ai_gateway_sessions') as Map<string, {
            session_uid: string;
            process_uid: string;
            memory_uid?: string;
        }>;
        const registryEntry = registry.get(session.session_uid);
        const storedSession = KernelEngine.readMemory(registryEntry?.memory_uid as string);

        expect(registry).toBeInstanceOf(Map);
        expect(registry.size).toBe(1);
        expect(registryEntry).toEqual({
            session_uid: session.session_uid,
            process_uid: session.process_uid,
            memory_uid: `system:ai_session:${session.session_uid}:state`,
        });
        expect(storedSession).toMatchObject({
            session_uid: session.session_uid,
            process_uid: session.process_uid,
            sdk: 'openai',
            model: 'gpt-5.4',
        });
    });

    it('removes the AI session registry entry before terminating the backing process', () => {
        const session = AISessionManager.create('openai', 'gpt-5.4');

        AISessionManager.close(session.session_uid);

        const registry = KernelEngine.readMemory('system:ai_gateway_sessions') as Map<string, unknown>;
        expect(registry.has(session.session_uid)).toBe(false);
        expect(KernelEngine.readMemory(`system:ai_session:${session.session_uid}:state`)).toBeUndefined();
        expect(KernelEngine.getProcess(session.process_uid)).toBeUndefined();
    });
});