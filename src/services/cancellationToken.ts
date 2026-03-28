/**
 * Long-Running Process Cancellation Support
 *
 * Purpose:
 * 1. Provide cancellation tokens for long-running async operations
 * 2. Enable graceful shutdown with timeout escalation (graceful → force kill)
 * 3. Ensure resource cleanup when processes are terminated
 *
 * Usage:
 * ```tsx
 * const token = createCancellationToken();
 * 
 * (async () => {
 *   try {
 *     await longRunningAsync(token);
 *   } catch (err) {
 *     if (token.isCancelled) {
 *       console.log('Task was cancelled');
 *     }
 *   }
 * })();
 *
 * // Later, request cancellation
 * token.cancel('user_request');
 * ```
 *
 * Integration with KernelEngine:
 * ```tsx
 * const token = createCancellationTokenLinkedToProcess(process_uid);
 * // When process terminates, token is automatically cancelled
 * await longRunningAsync(token);
 * ```
 */

import { KernelEngine } from './kernelEngine';

export interface CancellationToken {
    /** Check if cancellation has been requested */
    isCancelled: boolean;

    /** Reason for cancellation (if cancelled) */
    reason?: string;

    /** When cancellation was requested */
    cancelledAt?: number;

    /** Request cancellation with optional reason */
    cancel(reason?: string): void;

    /** Throw CancelledError if cancelled */
    throwIfCancelled(): void;

    /** Create a sub-token for nested operations */
    createLinkedToken(): CancellationToken;

    /** Register callback to run on cancellation */
    onCancelled(callback: (reason?: string) => void): () => void;

    /** Wait for cancellation signal */
    waitForCancellation(): Promise<{ reason?: string }>;
}

export class CancelledError extends Error {
    reason?: string;

    constructor(reasonValue?: string) {
        super(`Operation cancelled${reasonValue ? ': ' + reasonValue : ''}`);
        this.name = 'CancelledError';
        this.reason = reasonValue;
    }
}

/**
 * Create a new cancellation token
 */
export function createCancellationToken(): CancellationToken {
    let isCancelled = false;
    let reason: string | undefined;
    let cancelledAt: number | undefined;
    let resolveCancellation: ((value: { reason?: string }) => void) | null = null;
    const cancellationPromise = new Promise<{ reason?: string }>(resolve => {
        resolveCancellation = resolve;
    });
    const callbacks = new Set<(reason?: string) => void>();

    return {
        get isCancelled() {
            return isCancelled;
        },
        get reason() {
            return reason;
        },
        get cancelledAt() {
            return cancelledAt;
        },

        cancel(cancelReason?: string) {
            if (isCancelled) {
                // Allow timeout escalation to update reason after graceful timeout.
                if (reason === 'timeout_graceful' && cancelReason === 'timeout_force') {
                    reason = 'timeout_force';
                    callbacks.forEach(cb => {
                        try {
                            cb(reason);
                        } catch (err) {
                            console.error('[CancellationToken] Callback error:', err);
                        }
                    });
                }
                return;
            }

            isCancelled = true;
            reason = cancelReason;
            cancelledAt = Date.now();

            // Notify all registered callbacks
            callbacks.forEach(cb => {
                try {
                    cb(reason);
                } catch (err) {
                    console.error('[CancellationToken] Callback error:', err);
                }
            });

            // Resolve the cancellation promise
            if (resolveCancellation) {
                resolveCancellation({ reason });
            }
        },

        throwIfCancelled() {
            if (isCancelled) {
                throw new CancelledError(reason);
            }
        },

        createLinkedToken(): CancellationToken {
            const child = createCancellationToken();

            // Cancel child when parent is cancelled
            this.onCancelled(childReason => {
                child.cancel(childReason || reason);
            });

            return child;
        },

        onCancelled(callback: (reason?: string) => void): () => void {
            callbacks.add(callback);

            // If already cancelled, call immediately
            if (isCancelled) {
                callback(reason);
            }

            // Return unsubscribe function
            return () => {
                callbacks.delete(callback);
            };
        },

        async waitForCancellation(): Promise<{ reason?: string }> {
            return cancellationPromise;
        },
    };
}

/**
 * Create a cancellation token linked to a process lifecycle
 * Token is automatically cancelled when process terminates
 *
 * @param process_uid Process UID to link to
 * @returns Cancellation token that cancels on process termination
 */
export function createCancellationTokenLinkedToProcess(process_uid: string): CancellationToken {
    const token = createCancellationToken();

    // Subscribe to process termination
    const unsubscribe = KernelEngine.subscribeToProcess(process_uid, record => {
        if (!record) {
            // Process deleted
            token.cancel('process_deleted');
            unsubscribe?.();
            return;
        }

        if (['done', 'failed', 'cancelled', 'terminated'].includes(record.lifecycle_state)) {
            // Process terminal
            token.cancel(`process_${record.lifecycle_state}`);
            unsubscribe?.();
        }
    });

    return token;
}

/**
 * Wrap an async function with cancellation support
 * Throws CancelledError if token is cancelled during execution
 *
 * @param fn Async function to wrap
 * @param token Cancellation token
 * @returns Promise that respects cancellation
 */
export async function withCancellation<T>(fn: (token: CancellationToken) => Promise<T>, token: CancellationToken): Promise<T> {
    // Create a race between the function and cancellation
    const cancellationPromise = token.waitForCancellation().then(() => {
        throw new CancelledError(token.reason);
    });

    try {
        return await Promise.race([fn(token), cancellationPromise]);
    } catch (err) {
        if (err instanceof CancelledError || token.isCancelled) {
            throw err;
        }
        throw err;
    }
}

/**
 * Timeout with cancellation fallback
 * Graceful timeout → force termination after grace period
 *
 * @param token Cancellation token
 * @param gracefulTimeoutMs Milliseconds for graceful cancellation
 * @param forceTimeoutMs Milliseconds for force termination (after graceful timeout)
 * @returns Token that auto-cancels after timeout
 */
export function withTimeout(
    token: CancellationToken,
    gracefulTimeoutMs: number = 5000,
    forceTimeoutMs: number = 2000,
): CancellationToken {
    setTimeout(() => {
        if (!token.isCancelled) {
            token.cancel('timeout_graceful');
        }
    }, gracefulTimeoutMs);

    setTimeout(() => {
        token.cancel('timeout_force');
    }, gracefulTimeoutMs + forceTimeoutMs);

    return token;
}
