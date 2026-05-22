import { Engine } from '#/shared/engines/engine';
import type { DesktopHostInvokeMethod, DesktopHostInvokePayloadMap } from '#/shared/schemas/desktop-host';
import type {
	DesktopRPCRequestMessage,
	DesktopRPCResponseFailureMessage,
	DesktopRPCResponseMessage,
} from '#/app-background/schemas/rpc';

class DesktopRPCEngineSingleton extends Engine {
	private desktopRpcCounter = 0;
	private pendingDesktopRpcRequests = new Map<
		string,
		{
			resolve: (value: unknown) => void;
			reject: (reason?: unknown) => void;
		}
	>();
	private hasBoundDesktopRpcResponseListener = false;

	async boot() {}

	async setupEventRoutes() {}

	async setupKernelSpace() {}

	async setupKernelTerminationHook() {}

	private bindDesktopRpcResponseListener() {
		if (this.hasBoundDesktopRpcResponseListener || typeof process.on !== 'function') {
			return;
		}

		this.hasBoundDesktopRpcResponseListener = true;
		process.on('message', (message) => {
			if (!message || typeof message !== 'object') {
				return;
			}

			const payload = message as Partial<DesktopRPCResponseMessage>;
			if (payload.type !== 'ace:background:desktop:response' || !payload.id) {
				return;
			}

			const pending = this.pendingDesktopRpcRequests.get(payload.id);
			if (!pending) {
				return;
			}

			this.pendingDesktopRpcRequests.delete(payload.id);

			if (payload.success === true) {
				pending.resolve(payload.result);
				return;
			}

			const failurePayload = payload as Partial<DesktopRPCResponseFailureMessage>;
			const error = new Error(failurePayload.error?.message || 'Desktop RPC request failed.');
			if (failurePayload.error?.stack) {
				error.stack = failurePayload.error.stack;
			}
			pending.reject(error);
		});
	}

	async invoke(method: 'window.list', payload?: Record<string, never>): Promise<unknown>;
	async invoke<Method extends Exclude<DesktopHostInvokeMethod, 'window.list'>>(
		method: Method,
		payload: DesktopHostInvokePayloadMap[Method],
	): Promise<unknown>;
	async invoke(
		method: DesktopHostInvokeMethod,
		payload: Record<string, unknown> = {},
	): Promise<unknown> {
		this.bindDesktopRpcResponseListener();

		if (typeof process.send !== 'function') {
			throw new Error('Desktop RPC channel is unavailable.');
		}

		const id = `desktop-rpc-${++this.desktopRpcCounter}`;
		const request: DesktopRPCRequestMessage = {
			type: 'ace:background:desktop:request',
			id,
			method,
			payload: (payload ?? {}) as DesktopHostInvokePayloadMap[DesktopHostInvokeMethod],
		};

		return await new Promise((resolve, reject) => {
			this.pendingDesktopRpcRequests.set(id, { resolve, reject });

			try {
				process.send?.(request);
			} catch (error) {
				this.pendingDesktopRpcRequests.delete(id);
				reject(error);
			}
		});
	}
}

export const DesktopRPCEngine = new DesktopRPCEngineSingleton();
