/**
 * Phase E Tests: Long-Running Process Cancellation Hardening
 *
 * Tests for:
 * 1. Cancellation token creation and lifecycle  
 * 2. Process-linked cancellation tokens
 * 3. Graceful vs. force termination with tokens
 * 4. Bridge hook integration with cancellation
 * 5. Auto-injection of cancellation tokens
 */

import { describe, it, expect, vi } from 'vitest';
import { createCancellationToken, CancelledError, withCancellation, withTimeout } from '#/services/cancellation-token';
import { ProcessEngine } from '#/services/process-engine';
import { KernelEngine } from '#/services/kernel-engine';

describe('Phase E: Cancellation Hardening', () => {
    describe('CancellationToken Basics', () => {
        it('should create an uncancelled token', () => {
            const token = createCancellationToken();
            expect(token.isCancelled).toBe(false);
            expect(token.reason).toBeUndefined();
            expect(token.cancelledAt).toBeUndefined();
        });

        it('should cancel a token with reason', () => {
            const token = createCancellationToken();
            token.cancel('user_request');

            expect(token.isCancelled).toBe(true);
            expect(token.reason).toBe('user_request');
            expect(token.cancelledAt).toBeDefined();
        });

        it('should throw CancelledError when throwIfCancelled called on cancelled token', () => {
            const token = createCancellationToken();
            token.cancel('timeout');

            expect(() => token.throwIfCancelled()).toThrow(CancelledError);
        });

        it('should not throw on uncancelled token', () => {
            const token = createCancellationToken();
            expect(() => token.throwIfCancelled()).not.toThrow();
        });

        it('should ignore multiple cancellations', () => {
            const token = createCancellationToken();
            token.cancel('first');
            token.cancel('second');

            expect(token.reason).toBe('first');
            expect(token.cancelledAt).toBeDefined();
        });

        it('should fire onCancelled callbacks', async () => {
            const token = createCancellationToken();
            const callback1 = vi.fn();
            const callback2 = vi.fn();

            token.onCancelled(callback1);
            token.onCancelled(callback2);

            token.cancel('test_reason');

            expect(callback1).toHaveBeenCalledWith('test_reason');
            expect(callback2).toHaveBeenCalledWith('test_reason');
        });

        it('should call onCancelled immediately if already cancelled', () => {
            const token = createCancellationToken();
            token.cancel('early');

            const callback = vi.fn();
            token.onCancelled(callback);

            expect(callback).toHaveBeenCalledWith('early');
        });

        it('should return unsubscribe function from onCancelled', () => {
            const token = createCancellationToken();
            const callback = vi.fn();

            const unsubscribe = token.onCancelled(callback);

            unsubscribe();
            token.cancel('test');

            expect(callback).not.toHaveBeenCalled();
        });
    });

    describe('Linked Tokens', () => {
        it('should create linked token that cancels when parent cancels', async () => {
            const parent = createCancellationToken();
            const child = parent.createLinkedToken();

            expect(child.isCancelled).toBe(false);

            parent.cancel('parent_cancelled');

            expect(child.isCancelled).toBe(true);
            expect(child.reason).toBe('parent_cancelled');
        });

        it('should propagate cancellation reason in linked tokens', () => {
            const parent = createCancellationToken();
            const child = parent.createLinkedToken();

            parent.cancel('custom_reason');

            expect(child.reason).toBe('custom_reason');
        });

        it('should support multiple child tokens from single parent', () => {
            const parent = createCancellationToken();
            const child1 = parent.createLinkedToken();
            const child2 = parent.createLinkedToken();

            parent.cancel('all_cancel');

            expect(child1.isCancelled).toBe(true);
            expect(child2.isCancelled).toBe(true);
        });
    });

    describe('Async Cancellation', () => {
        it('should wait for cancellation signal', async () => {
            const token = createCancellationToken();
            const waitPromise = token.waitForCancellation();

            setTimeout(() => {
                token.cancel('delayed_cancel');
            }, 50);

            const result = await waitPromise;
            expect(result.reason).toBe('delayed_cancel');
        });

        it('should support withCancellation wrapper', async () => {
            const token = createCancellationToken();

            setTimeout(() => {
                token.cancel('timeout');
            }, 50);

            await expect(
                withCancellation(async () => {
                    await new Promise(resolve => setTimeout(resolve, 200));
                    return 'success';
                }, token),
            ).rejects.toThrow(CancelledError);
        });

        it('should complete withCancellation before cancellation', async () => {
            const token = createCancellationToken();

            const result = await withCancellation(async () => {
                return 'completed';
            }, token);

            expect(result).toBe('completed');
        });

        it('should handle withTimeout graceful timeout', async () => {
            const token = createCancellationToken();
            const timedToken = withTimeout(token, 50, 200);

            await new Promise(resolve => setTimeout(resolve, 100));

            expect(timedToken.isCancelled).toBe(true);
            expect(timedToken.reason).toBe('timeout_graceful');
        });

        it('should handle withTimeout force timeout', async () => {
            // Create a FRESH token for force timeout test
            const token = createCancellationToken();
            const timedToken = withTimeout(token, 10, 20);

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(timedToken.isCancelled).toBe(true);
            expect(timedToken.reason).toBe('timeout_force');
        });
    });

    describe('ProcessEngine Integration', () => {
        it('should get or create cancellation token for process', () => {
            const process = KernelEngine.spawnSubprocess(
                'system',
                'test_process',
                { metadata: { type: 'test' } },
            );

            const token1 = ProcessEngine.getCancellationToken(process.process_uid);
            const token2 = ProcessEngine.getCancellationToken(process.process_uid);

            expect(token1).toBe(token2);
            expect(token1.isCancelled).toBe(false);
        });

        it('should cancel token during graceful termination', async () => {
            const process = KernelEngine.spawnSubprocess(
                'system',
                'test_process',
                { metadata: { type: 'test' } },
            );

            const token = ProcessEngine.getCancellationToken(process.process_uid);
            ProcessEngine.terminateProcess(process.process_uid, { mode: 'graceful', reason: 'test_cancel' });

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(token.isCancelled).toBe(true);
            expect(token.reason?.includes('graceful_shutdown')).toBe(true);
        });

        it('should cancel token during force termination', async () => {
            const process = KernelEngine.spawnSubprocess(
                'system',
                'test_process',
                { metadata: { type: 'test' } },
            );

            // Get token before termination
            const token = ProcessEngine.getCancellationToken(process.process_uid);
            expect(token.isCancelled).toBe(false);

            // Force terminate
            ProcessEngine.terminateProcess(process.process_uid, { mode: 'force', reason: 'test_kill' });

            // Token should be cancelled immediately (sync operation)
            expect(token.isCancelled).toBe(true);
            expect(token.reason).toContain('force_termination');
        });

        it('should handle cancellation token for subprocess tree', () => {
            const parent = KernelEngine.spawnSubprocess(
                'system',
                'parent',
                { metadata: { type: 'parent' } },
            );

            const child = KernelEngine.spawnSubprocess(
                parent.process_uid,
                'child',
                { metadata: { type: 'child' } },
            );

            const parentToken = ProcessEngine.getCancellationToken(parent.process_uid);
            const childToken = ProcessEngine.getCancellationToken(child.process_uid);

            expect(parentToken.isCancelled).toBe(false);
            expect(childToken.isCancelled).toBe(false);

            // Force terminate entire tree
            ProcessEngine.terminateProcess(parent.process_uid, { mode: 'force', cascade: true });

            // Both tokens should be cancelled
            expect(parentToken.isCancelled).toBe(true);
            expect(childToken.isCancelled).toBe(true);
        });
    });

    describe('CancelledError', () => {
        it('should create error with reason', () => {
            const error = new CancelledError('timeout');
            expect(error.message).toContain('timeout');
            expect(error.name).toBe('CancelledError');
            expect(error.reason).toBe('timeout');
        });

        it('should create error without reason', () => {
            const error = new CancelledError();
            expect(error.message).toBe('Operation cancelled');
            expect(error.reason).toBeUndefined();
        });

        it('should be instanceof Error', () => {
            const error = new CancelledError('test');
            expect(error instanceof Error).toBe(true);
        });
    });

    describe('Edge Cases', () => {
        it('should handle rapid cancellations', () => {
            const token = createCancellationToken();
            token.cancel('first');
            token.cancel('second');
            token.cancel('third');

            expect(token.reason).toBe('first');
            expect(token.isCancelled).toBe(true);
        });

        it('should handle empty cancellation reason', () => {
            const token = createCancellationToken();
            token.cancel();

            expect(token.isCancelled).toBe(true);
            expect(token.reason).toBeUndefined();
        });

        it('should maintain token identity across multiple gets', () => {
            const process = KernelEngine.spawnSubprocess(
                'system',
                'test_process',
                { metadata: { type: 'test' } },
            );

            const tokens = [
                ProcessEngine.getCancellationToken(process.process_uid),
                ProcessEngine.getCancellationToken(process.process_uid),
                ProcessEngine.getCancellationToken(process.process_uid),
            ];

            expect(tokens[0]).toBe(tokens[1]);
            expect(tokens[1]).toBe(tokens[2]);
        });

        it('should return new token if previous was cancelled', () => {
            const process = KernelEngine.spawnSubprocess(
                'system',
                'test_process',
                { metadata: { type: 'test' } },
            );

            const token1 = ProcessEngine.getCancellationToken(process.process_uid);
            token1.cancel('manual');

            const token2 = ProcessEngine.getCancellationToken(process.process_uid);

            expect(token1).not.toBe(token2);
            expect(token2.isCancelled).toBe(false);
        });
    });
});
