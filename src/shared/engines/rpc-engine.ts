import { KernelEngine } from './kernel-engine';
import type {
    RPCClaimRouteMessage,
    RPCClaimRouteResultMessage,
    RPCMessage,
    RPCRegistrySyncMessage,
    RPCReleaseRouteMessage,
    RPCRequestMessage,
    RPCRouteHandler,
    RPCRouteRegistryEntry,
    RPCRouteRegistryState,
    RPCRuntimeTarget,
    RPCResponseMessage,
} from '#/shared/schemas/rpc';

type PendingRequest = {
    resolve: (value: any) => void;
    reject: (error: unknown) => void;
    timeoutId?: ReturnType<typeof setTimeout>;
};

type PendingClaim = {
    resolve: (entry: RPCRouteRegistryEntry) => void;
    reject: (error: unknown) => void;
    timeoutId?: ReturnType<typeof setTimeout>;
};

type RegisteredRoute = {
    owner: string;
    handler: RPCRouteHandler<any, any>;
};

class RPCEngineSingleton {
    public readonly routeRegistryMemoryUid = 'system:rpc_engine:route_registry';
    private handlers = new Map<string, RegisteredRoute>();
    private pendingRequests = new Map<string, PendingRequest>();
    private pendingClaims = new Map<string, PendingClaim>();
    private hasBoundRuntimeBridge = false;
    private requestCounter = 0;

    setupKernelSpace() {
        KernelEngine.registerSystemMemory(this.routeRegistryMemoryUid, {} as RPCRouteRegistryState);
    }

    private resolveCurrentRuntime(): RPCRuntimeTarget | null {
        if (typeof window !== 'undefined') {
            return 'desktop';
        }

        if (typeof process !== 'undefined' && process.env?.ACE_RUNTIME_MODE === 'background') {
            return 'background';
        }

        return null;
    }

    private readRouteRegistry(): RPCRouteRegistryState {
        return (KernelEngine.readMemory(this.routeRegistryMemoryUid) as RPCRouteRegistryState | undefined) ?? {};
    }

    private syncRouteRegistry(registry: RPCRouteRegistryState) {
        KernelEngine.writeMemory(this.routeRegistryMemoryUid, registry);
    }

    private async waitForRouteOwnership(route: string, timeoutMs: number): Promise<RPCRouteRegistryEntry | null> {
        const existingEntry = this.readRouteRegistry()[route];
        if (existingEntry) {
            return existingEntry;
        }

        if (timeoutMs <= 0) {
            return null;
        }

        return await new Promise<RPCRouteRegistryEntry | null>((resolve) => {
            const timeoutId = setTimeout(() => {
                unsubscribe();
                resolve(this.readRouteRegistry()[route] ?? null);
            }, timeoutMs);

            const unsubscribe = KernelEngine.subscribe(this.routeRegistryMemoryUid, (registry) => {
                const nextEntry = (registry as RPCRouteRegistryState | undefined)?.[route] ?? null;
                if (!nextEntry) {
                    return;
                }

                clearTimeout(timeoutId);
                unsubscribe();
                resolve(nextEntry);
            });
        });
    }

    private async requestRouteRegistrySync() {
        const runtime = this.resolveCurrentRuntime();
        if (!runtime) {
            return;
        }

        await this.sendMessage({
            type: 'ace:rpc:registry-sync:request',
            id: `rpc-registry-sync-${runtime}-${++this.requestCounter}`,
            source: runtime,
        });
    }

    private handleIncomingClaimResult(message: RPCClaimRouteResultMessage) {
        const runtime = this.resolveCurrentRuntime();
        if (!runtime || message.target !== runtime) {
            return;
        }

        this.syncRouteRegistry(message.registry);

        const pendingClaim = this.pendingClaims.get(message.id);
        if (!pendingClaim) {
            return;
        }

        this.pendingClaims.delete(message.id);
        if (pendingClaim.timeoutId) {
            clearTimeout(pendingClaim.timeoutId);
        }

        if (message.success) {
            pendingClaim.resolve(message.entry);
            return;
        }

        pendingClaim.reject(new Error(message.error.message || 'RPC route claim failed.'));
    }

    private handleIncomingRegistrySync(message: RPCRegistrySyncMessage) {
        const runtime = this.resolveCurrentRuntime();
        if (!runtime || (message.target !== 'broadcast' && message.target !== runtime)) {
            return;
        }

        this.syncRouteRegistry(message.registry);
    }

    private async claimRoute(route: string, owner: string, timeoutMs = 10000): Promise<RPCRouteRegistryEntry> {
        const runtime = this.resolveCurrentRuntime();
        if (!runtime) {
            throw new Error('RPC runtime is unavailable.');
        }

        const claimId = `rpc-claim-${runtime}-${++this.requestCounter}`;
        const message: RPCClaimRouteMessage = {
            type: 'ace:rpc:claim-route',
            id: claimId,
            source: runtime,
            route,
            owner,
        };

        return await new Promise<RPCRouteRegistryEntry>((resolve, reject) => {
            const timeoutId = timeoutMs > 0
                ? setTimeout(() => {
                    this.pendingClaims.delete(claimId);
                    reject(new Error(`RPC route claim for "${route}" timed out after ${timeoutMs}ms.`));
                }, timeoutMs)
                : undefined;

            this.pendingClaims.set(claimId, { resolve, reject, timeoutId });

            this.sendMessage(message).catch((error) => {
                this.pendingClaims.delete(claimId);
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
                reject(error);
            });
        });
    }

    private async releaseRoute(route: string, owner: string) {
        const runtime = this.resolveCurrentRuntime();
        if (!runtime) {
            return;
        }

        const message: RPCReleaseRouteMessage = {
            type: 'ace:rpc:release-route',
            source: runtime,
            route,
            owner,
        };

        await this.sendMessage(message);
    }

    private async invokeLocal<TPayload extends object, TResult>(
        route: string,
        payload: TPayload,
        request?: RPCRequestMessage<TPayload>,
    ): Promise<TResult> {
        const registeredRoute = this.handlers.get(route);
        if (!registeredRoute) {
            throw new Error(`RPC route "${route}" is not registered in ${this.resolveCurrentRuntime() ?? 'unknown'} runtime.`);
        }

        return await registeredRoute.handler(
            payload,
            request ?? {
                type: 'ace:rpc:request',
                id: `local-rpc-${++this.requestCounter}`,
                source: this.resolveCurrentRuntime() ?? 'desktop',
                target: this.resolveCurrentRuntime() ?? 'desktop',
                route,
                payload,
            },
        );
    }

    private async sendMessage(message: RPCMessage<object>) {
        const runtime = this.resolveCurrentRuntime();
        if (runtime === 'desktop' && window.electronAPI?.emitRpcMessage) {
            window.electronAPI.emitRpcMessage(message);
            return;
        }

        if (runtime === 'background' && typeof process.send === 'function') {
            process.send(message);
            return;
        }

        throw new Error('RPC transport is unavailable.');
    }

    private async handleIncomingRequest(message: RPCRequestMessage<object>) {
        const runtime = this.resolveCurrentRuntime();
        if (!runtime || message.target !== runtime) {
            return;
        }

        try {
            const result = await this.invokeLocal(message.route, message.payload, message);
            await this.sendMessage({
                type: 'ace:rpc:response',
                id: message.id,
                source: runtime,
                target: message.source,
                success: true,
                result,
            });
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            await this.sendMessage({
                type: 'ace:rpc:response',
                id: message.id,
                source: runtime,
                target: message.source,
                success: false,
                error: {
                    message: err.message,
                    stack: err.stack,
                },
            });
        }
    }

    private handleIncomingResponse(message: RPCResponseMessage) {
        const runtime = this.resolveCurrentRuntime();
        if (!runtime || message.target !== runtime) {
            return;
        }

        const pendingRequest = this.pendingRequests.get(message.id);
        if (!pendingRequest) {
            return;
        }

        this.pendingRequests.delete(message.id);
        if (pendingRequest.timeoutId) {
            clearTimeout(pendingRequest.timeoutId);
        }

        if (message.success) {
            pendingRequest.resolve(message.result);
            return;
        }

        const error = new Error(message.error?.message || 'RPC request failed.');
        if (message.error?.stack) {
            error.stack = message.error.stack;
        }
        pendingRequest.reject(error);
    }

    private handleIncomingMessage(message: RPCMessage<object>) {
        if (message.type === 'ace:rpc:request') {
            void this.handleIncomingRequest(message);
            return;
        }

        if (message.type === 'ace:rpc:response') {
            this.handleIncomingResponse(message);
            return;
        }

        if (message.type === 'ace:rpc:claim-route:result') {
            this.handleIncomingClaimResult(message);
            return;
        }

        if (message.type === 'ace:rpc:registry-sync') {
            this.handleIncomingRegistrySync(message);
        }
    }

    setupRuntimeBridge() {
        if (this.hasBoundRuntimeBridge) {
            return;
        }

        this.hasBoundRuntimeBridge = true;
        this.setupKernelSpace();

        if (typeof window !== 'undefined' && window.electronAPI?.onRpcMessage) {
            window.electronAPI.onRpcMessage((message) => {
                this.handleIncomingMessage(message);
            });
            void this.requestRouteRegistrySync();
            return;
        }

        if (typeof process.on === 'function') {
            process.on('message', (message) => {
                const payload = message as Partial<RPCMessage>;
                if (
                    payload.type !== 'ace:rpc:request' &&
                    payload.type !== 'ace:rpc:response' &&
                    payload.type !== 'ace:rpc:claim-route:result' &&
                    payload.type !== 'ace:rpc:registry-sync'
                ) {
                    return;
                }

                this.handleIncomingMessage(payload as RPCMessage);
            });
            void this.requestRouteRegistrySync();
        }
    }

    async handle<TPayload extends object, TResult>(
        route: string,
        handler: RPCRouteHandler<TPayload, TResult>,
        options?: { owner?: string; timeoutMs?: number },
    ) {
        this.setupRuntimeBridge();

        const existingHandler = this.handlers.get(route);
        const owner = options?.owner ?? 'anonymous';
        if (existingHandler) {
            throw new Error(`RPC route "${route}" is already registered by "${existingHandler.owner}".`);
        }

        const claimedRoute = await this.claimRoute(route, owner, options?.timeoutMs ?? 10000);
        const runtime = this.resolveCurrentRuntime();
        if (!runtime || claimedRoute.owner_runtime !== runtime) {
            throw new Error(`RPC route "${route}" is owned by ${claimedRoute.owner_runtime}, not ${runtime ?? 'unknown'}.`);
        }

        this.handlers.set(route, { owner, handler });

        return async () => {
            const registeredRoute = this.handlers.get(route);
            if (registeredRoute?.handler === handler) {
                this.handlers.delete(route);
                try {
                    await this.releaseRoute(route, owner);
                } catch (error) {
                    console.error(`[RPCEngine] Failed to release route "${route}":`, error);
                }
            }
        };
    }

    async invoke<
        TResult = unknown,
        TPayload extends object = Record<string, unknown>,
    >(
        route: string,
        payload: TPayload,
        options?: { timeoutMs?: number },
    ): Promise<TResult> {
        this.setupRuntimeBridge();

        const runtime = this.resolveCurrentRuntime();
        if (!runtime) {
            throw new Error('RPC runtime is unavailable.');
        }

        const timeoutMs = options?.timeoutMs ?? 10000;
        let registryEntry: RPCRouteRegistryEntry | null = this.readRouteRegistry()[route] ?? null;
        if (!registryEntry) {
            await this.requestRouteRegistrySync();
            registryEntry = await this.waitForRouteOwnership(route, Math.min(timeoutMs, 1000));
        }

        if (!registryEntry) {
            throw new Error(`RPC route "${route}" is not claimed by any runtime.`);
        }

        if (registryEntry.owner_runtime === runtime) {
            return await this.invokeLocal<TPayload, TResult>(route, payload);
        }

        const requestId = `rpc-${runtime}-${++this.requestCounter}`;
        const request: RPCRequestMessage<TPayload> = {
            type: 'ace:rpc:request',
            id: requestId,
            source: runtime,
            target: registryEntry.owner_runtime,
            route,
            payload,
        };

        return await new Promise<TResult>((resolve, reject) => {
            const timeoutId = timeoutMs > 0
                ? setTimeout(() => {
                    this.pendingRequests.delete(requestId);
                    reject(new Error(`RPC route "${route}" timed out after ${timeoutMs}ms.`));
                }, timeoutMs)
                : undefined;

            this.pendingRequests.set(requestId, { resolve, reject, timeoutId });

            this.sendMessage(request).catch((error) => {
                this.pendingRequests.delete(requestId);
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
                reject(error);
            });
        });
    }
}

export const RPCEngine = new RPCEngineSingleton();