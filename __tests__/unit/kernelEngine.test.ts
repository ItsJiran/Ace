import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KernelEngine } from '#/services/kernelEngine';
import { StorageEngine } from '#/services/storageEngine';

// Polyfill crypto for node/vitest environment if needed
if (!globalThis.crypto) {
    (globalThis as any).crypto = {
        randomUUID: () => Math.random().toString(36).substring(2, 11) + Math.random().toString(36).substring(2, 11)
    };
}

describe('KernelEngine (Control Plane Facade)', () => {
    beforeEach(() => {
        (StorageEngine as any).global_ram.clear();
        (StorageEngine as any).classification_ram.clear();
        (StorageEngine as any).memory_sockets.clear();
        (StorageEngine as any).parent_children.clear();
        (StorageEngine as any).child_parent.clear();
    });

    describe('Phase A: Facade Foundation', () => {
        it('should spawn a top-level process with owner_engine tracking', () => {
            const record = KernelEngine.spawnProcess('ai_session', { model_id: 'gpt-4' }, {
                owner_engine: 'aiGatewayEngine',
            });

            expect(record.process_uid).toMatch(/^proc-/);
            expect(record.status).toBe('created');
            expect(record.owner_engine).toBe('aiGatewayEngine');
            expect(record.type).toBe('ai_session');
            expect(record.metadata?.model_id).toBe('gpt-4');
        });

        it('should spawn a subprocess with parent linkage', () => {
            const parent = KernelEngine.spawnProcess('window_shell', {}, {
                owner_engine: 'windowEngine',
            });

            const child = KernelEngine.spawnSubprocess(parent.process_uid, 'task_runner', {
                owner_engine: 'eventEngine',
            });

            expect(child.parent_process_uid).toBe(parent.process_uid);
            expect(child.process_uid).not.toBe(parent.process_uid);

            const updatedParent = KernelEngine.getProcess(parent.process_uid);
            expect(updatedParent?.child_process_uids).toContain(child.process_uid);
        });

        it('should retrieve process by UID', () => {
            const spawned = KernelEngine.spawnProcess('test_process', { data: 'value' });
            const retrieved = KernelEngine.getProcess(spawned.process_uid);

            expect(retrieved).toBeDefined();
            expect(retrieved?.type).toBe('test_process');
            expect(retrieved?.metadata?.data).toBe('value');
        });

        it('should check process active status', () => {
            const process = KernelEngine.spawnProcess('test_process');
            
            expect(KernelEngine.isProcessActive(process.process_uid)).toBe(true);

            KernelEngine.terminateProcess(process.process_uid, { mode: 'force' });
            expect(KernelEngine.isProcessActive(process.process_uid)).toBe(false);
        });

        it('should update process status via KernelEngine', () => {
            const process = KernelEngine.spawnProcess('test_process');
            
            const updated = KernelEngine.updateProcessStatus(process.process_uid, 'running');
            expect(updated).toBe(true);

            const retrieved = KernelEngine.getProcess(process.process_uid);
            expect(retrieved?.status).toBe('running');
        });

        it('should update process payload', () => {
            const process = KernelEngine.spawnProcess('test_process', {}, {
                payload: { counter: 0 },
            });

            const updated = KernelEngine.updateProcessPayload(process.process_uid, { counter: 42 });
            expect(updated).toBe(true);

            const retrieved = KernelEngine.getProcess(process.process_uid);
            expect(retrieved?.payload?.counter).toBe(42);
        });

        it('should request process cancellation', () => {
            const process = KernelEngine.spawnProcess('test_process');
            
            const cancelled = KernelEngine.requestProcessCancel(process.process_uid, 'user_requested');
            expect(cancelled).toBe(true);

            const retrieved = KernelEngine.getProcess(process.process_uid);
            expect(retrieved?.cancellation_requested_at).toBeDefined();
            expect(retrieved?.termination_reason).toBe('user_requested');
        });

        it('should terminate a single process (no cascade)', () => {
            const parent = KernelEngine.spawnProcess('parent_process', {}, {
                owner_engine: 'windowEngine',
            });

            const child = KernelEngine.spawnSubprocess(parent.process_uid, 'child_process', {
                owner_engine: 'toolEngine',
            });

            KernelEngine.terminateProcess(parent.process_uid, { mode: 'force', cascade: false });

            const parentTerminated = KernelEngine.getProcess(parent.process_uid);
            expect(parentTerminated?.lifecycle_state).toBe('terminated');

            // Child should still be active
            const childActive = KernelEngine.getProcess(child.process_uid);
            expect(childActive?.lifecycle_state).not.toBe('terminated');
        });

        it('should terminate process tree with cascade', () => {
            const parent = KernelEngine.spawnProcess('parent_process', {}, {
                owner_engine: 'windowEngine',
            });

            const child1 = KernelEngine.spawnSubprocess(parent.process_uid, 'child1', {
                owner_engine: 'toolEngine',
            });

            const child2 = KernelEngine.spawnSubprocess(parent.process_uid, 'child2', {
                owner_engine: 'toolEngine',
            });

            KernelEngine.terminateProcess(parent.process_uid, { mode: 'force', cascade: true });

            const parentTerminated = KernelEngine.getProcess(parent.process_uid);
            expect(parentTerminated?.lifecycle_state).toBe('terminated');

            const child1Terminated = KernelEngine.getProcess(child1.process_uid);
            expect(child1Terminated?.lifecycle_state).toBe('terminated');

            const child2Terminated = KernelEngine.getProcess(child2.process_uid);
            expect(child2Terminated?.lifecycle_state).toBe('terminated');
        });

        it('should kill process (force terminate)', () => {
            const process = KernelEngine.spawnProcess('test_process');
            
            const killed = KernelEngine.killProcess(process.process_uid);
            expect(killed).toBe(true);

            const terminated = KernelEngine.getProcess(process.process_uid);
            expect(terminated?.lifecycle_state).toBe('terminated');
        });

        it('should terminate subtree with explicit reason', () => {
            const root = KernelEngine.spawnProcess('root');
            KernelEngine.spawnSubprocess(root.process_uid, 'child');

            const terminated = KernelEngine.terminateSubtree(root.process_uid, 'custom_reason');
            expect(terminated).toBe(true);

            const rootTerminated = KernelEngine.getProcess(root.process_uid);
            expect(rootTerminated?.termination_reason).toBe('custom_reason');
        });

        it('should register and execute termination handlers', () => {
            const handler = vi.fn();
            const unregister = KernelEngine.registerTerminationHandler('test_engine', handler);

            const process = KernelEngine.spawnProcess('test_process', {}, {
                owner_engine: 'test_engine',
            });

            KernelEngine.terminateProcess(process.process_uid, { mode: 'force' });

            expect(handler).toHaveBeenCalled();
            const call = handler.mock.calls[0][0];
            expect(call.record.process_uid).toBe(process.process_uid);
            expect(call.reason).toBeDefined();
            expect(['force_terminated', 'kernel_terminate']).toContain(call.reason);

            unregister();
        });

        it('should create runtime memory tied to process', () => {
            const process = KernelEngine.spawnProcess('memory_owner');

            const memory_uid = KernelEngine.createRuntimeMemory({
                owner_process_uid: process.process_uid,
                payload: { state: 'active' },
                retention_policy: 'drop_on_done',
            });

            expect(memory_uid).toBeDefined();
            expect(memory_uid).not.toBeNull();

            const stored = StorageEngine.readMemory(memory_uid!);
            expect(stored).toBeDefined();
            expect(stored.state).toBe('active');
        });

        it('should update runtime memory', () => {
            const process = KernelEngine.spawnProcess('memory_owner');

            const memory_uid = KernelEngine.createRuntimeMemory({
                owner_process_uid: process.process_uid,
                payload: { value: 1 },
            });

            expect(memory_uid).toBeDefined();

            const updated = KernelEngine.updateRuntimeMemory({
                owner_process_uid: process.process_uid,
                memory_uid: memory_uid!,
                payload: { value: 2 },
            });

            expect(updated).toBe(true);

            const stored = StorageEngine.readMemory(memory_uid!);
            expect(stored.value).toBe(2);
        });

        it('should return undefined for non-existent process', () => {
            const result = KernelEngine.getProcess('proc-nonexistent');
            expect(result).toBeUndefined();
        });

        it('should reject memory creation for terminated process', () => {
            const process = KernelEngine.spawnProcess('memory_owner');
            KernelEngine.terminateProcess(process.process_uid, { mode: 'force' });

            const memory_uid = KernelEngine.createRuntimeMemory({
                owner_process_uid: process.process_uid,
                payload: { state: 'should_fail' },
            });

            expect(memory_uid).toBeNull();
        });

        it('should get all processes (snapshot)', () => {
            KernelEngine.spawnProcess('process_1');
            KernelEngine.spawnProcess('process_2');
            KernelEngine.spawnProcess('process_3');

            const all = KernelEngine.getAllProcesses();
            expect(all.length).toBeGreaterThanOrEqual(3);
            expect(all.some(p => p.type === 'process_1')).toBe(true);
        });

        it('should return runtime memory metadata', () => {
            const process = KernelEngine.spawnProcess('memory_owner');

            const memory_uid = KernelEngine.createRuntimeMemory({
                owner_process_uid: process.process_uid,
                payload: { data: 'test' },
                retention_policy: 'keep_on_done',
            });

            const meta = KernelEngine.getRuntimeMemoryMeta(memory_uid!);
            expect(meta).toBeDefined();
            expect(meta?.owner_process_uid).toBe(process.process_uid);
            expect(meta?.retention_policy).toBe('keep_on_done');
        });
    });

    describe('Telemetry Integration', () => {
        it('should log debug events on kernel operations', () => {
            const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

            const process = KernelEngine.spawnProcess('telemetry_test', {}, {
                owner_engine: 'test_engine',
            });

            expect(debugSpy).toHaveBeenCalledWith(
                expect.stringContaining('[KernelEngine] spawnProcess'),
                expect.objectContaining({
                    process_uid: process.process_uid,
                    owner_engine: 'test_engine',
                }),
            );

            debugSpy.mockRestore();
        });
    });
});
