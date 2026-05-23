/// <reference types="node" />

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RPCMessage, RPCRouteRegistryEntry, RPCRouteRegistryState, RPCRuntimeTarget } from '#/shared/schemas/rpc';

function createRpcCoordinatorMock(initialRegistry: RPCRouteRegistryState = {}) {
    const listeners = new Set<(message: RPCMessage<object>) => void>();
    const registry: RPCRouteRegistryState = { ...initialRegistry };

    const snapshotRegistry = () => ({ ...registry });

    const emitToDesktop = (message: RPCMessage<object>) => {
        listeners.forEach((listener) => listener(message));
    };

    const claimRoute = (route: string, runtime: RPCRuntimeTarget, owner: string) => {
        const nextEntry: RPCRouteRegistryEntry = {
            route,
            owner_runtime: runtime,
            owner_engine: owner,
            registered_at: Date.now(),
        };
        registry[route] = nextEntry;
        return nextEntry;
    };

    const electronAPI = {
        emitRpcMessage: vi.fn((message: RPCMessage<object>) => {
            if (message.type === 'ace:rpc:registry-sync:request') {
                emitToDesktop({
                    type: 'ace:rpc:registry-sync',
                    target: 'desktop',
                    registry: snapshotRegistry(),
                });
                return;
            }

            if (message.type === 'ace:rpc:claim-route') {
                const existingEntry = registry[message.route];

                if (
                    existingEntry &&
                    (existingEntry.owner_runtime !== message.source || existingEntry.owner_engine !== message.owner)
                ) {
                    emitToDesktop({
                        type: 'ace:rpc:claim-route:result',
                        id: message.id,
                        target: 'desktop',
                        success: false,
                        error: {
                            message: `RPC route "${message.route}" is already owned by ${existingEntry.owner_runtime}:${existingEntry.owner_engine}.`,
                        },
                        entry: existingEntry,
                        registry: snapshotRegistry(),
                    });
                    return;
                }

                const entry = existingEntry ?? claimRoute(message.route, message.source, message.owner);
                emitToDesktop({
                    type: 'ace:rpc:claim-route:result',
                    id: message.id,
                    target: 'desktop',
                    success: true,
                    entry,
                    registry: snapshotRegistry(),
                });
                emitToDesktop({
                    type: 'ace:rpc:registry-sync',
                    target: 'broadcast',
                    registry: snapshotRegistry(),
                });
                return;
            }

            if (message.type === 'ace:rpc:release-route') {
                const existingEntry = registry[message.route];
                if (
                    existingEntry &&
                    existingEntry.owner_runtime === message.source &&
                    existingEntry.owner_engine === message.owner
                ) {
                    delete registry[message.route];
                }

                emitToDesktop({
                    type: 'ace:rpc:registry-sync',
                    target: 'broadcast',
                    registry: snapshotRegistry(),
                });
            }
        }),
        onRpcMessage: vi.fn((listener: (message: RPCMessage<object>) => void) => {
            listeners.add(listener);

            return () => {
                listeners.delete(listener);
            };
        }),
    };

    return { electronAPI, registry };
}

async function loadFreshRpcEngineSet() {
    vi.resetModules();

    const [{ RPCEngine }, { KernelEngine }] = await Promise.all([
        import('#/shared/engines/rpc-engine'),
        import('#/shared/engines/kernel-engine'),
    ]);

    return { RPCEngine, KernelEngine };
}

describe('RPCEngine coordinated claim flow', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
    });

    it('rejects a route claim when another runtime already owns that route', async () => {
        const { electronAPI } = createRpcCoordinatorMock({
            'ai.readThread': {
                route: 'ai.readThread',
                owner_runtime: 'background',
                owner_engine: 'AIEngine',
                registered_at: 1,
            },
        });

        Object.defineProperty(window, 'electronAPI', {
            configurable: true,
            value: electronAPI,
        });

        const { RPCEngine, KernelEngine } = await loadFreshRpcEngineSet();
        KernelEngine.resetKernelSpace();
        RPCEngine.setupKernelSpace();

        await expect(
            RPCEngine.handle('ai.readThread', async () => ({ ok: true }), { owner: 'WindowEngine' }),
        ).rejects.toThrow('already owned by background:AIEngine');

        expect(KernelEngine.readMemory(RPCEngine.routeRegistryMemoryUid)).toEqual({
            'ai.readThread': {
                route: 'ai.readThread',
                owner_runtime: 'background',
                owner_engine: 'AIEngine',
                registered_at: 1,
            },
        });
    });

    it('invokes locally after a claim is approved and mirrored into the route registry', async () => {
        const { electronAPI } = createRpcCoordinatorMock();

        Object.defineProperty(window, 'electronAPI', {
            configurable: true,
            value: electronAPI,
        });

        const { RPCEngine, KernelEngine } = await loadFreshRpcEngineSet();
        KernelEngine.resetKernelSpace();
        RPCEngine.setupKernelSpace();

        await RPCEngine.handle('window.list', async () => ['alpha-window'], { owner: 'WindowEngine' });

        await expect(RPCEngine.invoke<string[]>('window.list', {})).resolves.toEqual(['alpha-window']);

        expect(KernelEngine.readMemory(RPCEngine.routeRegistryMemoryUid)).toMatchObject({
            'window.list': {
                route: 'window.list',
                owner_runtime: 'desktop',
                owner_engine: 'WindowEngine',
            },
        });
    });

    it('waits for a late registry sync before failing a desktop invoke', async () => {
        const listeners = new Set<(message: RPCMessage<object>) => void>();
        const electronAPI = {
            emitRpcMessage: vi.fn((message: RPCMessage<object>) => {
                if (message.type !== 'ace:rpc:registry-sync:request') {
                    return;
                }

                setTimeout(() => {
                    listeners.forEach((listener) => {
                        listener({
                            type: 'ace:rpc:registry-sync',
                            target: 'desktop',
                            registry: {
                                'ai.fetchAvailableModels': {
                                    route: 'ai.fetchAvailableModels',
                                    owner_runtime: 'background',
                                    owner_engine: 'AIEngine',
                                    registered_at: 1,
                                },
                            },
                        });
                    });
                }, 20);
            }),
            onRpcMessage: vi.fn((listener: (message: RPCMessage<object>) => void) => {
                listeners.add(listener);
                return () => listeners.delete(listener);
            }),
        };

        Object.defineProperty(window, 'electronAPI', {
            configurable: true,
            value: electronAPI,
        });

        const { RPCEngine, KernelEngine } = await loadFreshRpcEngineSet();
        KernelEngine.resetKernelSpace();
        RPCEngine.setupKernelSpace();

        await expect(
            RPCEngine.invoke('ai.fetchAvailableModels', { provider: 'openai' }, { timeoutMs: 50 }),
        ).rejects.toThrow('timed out after 50ms');

        expect(electronAPI.emitRpcMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'ace:rpc:registry-sync:request',
                source: 'desktop',
            }),
        );

        expect(KernelEngine.readMemory(RPCEngine.routeRegistryMemoryUid)).toMatchObject({
            'ai.fetchAvailableModels': {
                route: 'ai.fetchAvailableModels',
                owner_runtime: 'background',
                owner_engine: 'AIEngine',
            },
        });
    });
});