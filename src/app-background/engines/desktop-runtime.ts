type DesktopRequestSuccess = {
	type: 'ace:background:desktop:response';
	id: string;
	success: true;
	result: unknown;
};

type DesktopRequestFailure = {
	type: 'ace:background:desktop:response';
	id: string;
	success: false;
	error: { message: string; stack?: string };
};

type DesktopRequestMessage = DesktopRequestSuccess | DesktopRequestFailure;

let desktopRequestCounter = 0;
const pendingDesktopRequests = new Map<
	string,
	{
		resolve: (value: unknown) => void;
		reject: (reason?: unknown) => void;
	}
>();
let hasBoundDesktopResponseListener = false;

function bindDesktopResponseListener() {
	if (hasBoundDesktopResponseListener || typeof process.on !== 'function') {
		return;
	}

	hasBoundDesktopResponseListener = true;
	process.on('message', (message) => {
		if (!message || typeof message !== 'object') {
			return;
		}

		const payload = message as Partial<DesktopRequestMessage>;
		if (payload.type !== 'ace:background:desktop:response' || !payload.id) {
			return;
		}

		const pending = pendingDesktopRequests.get(payload.id);
		if (!pending) {
			return;
		}

		pendingDesktopRequests.delete(payload.id);

		if (payload.success === true) {
			pending.resolve(payload.result);
			return;
		}

		const failurePayload = payload as Partial<DesktopRequestFailure>;
		const error = new Error(failurePayload.error?.message || 'Desktop runtime request failed.');
		if (failurePayload.error?.stack) {
			error.stack = failurePayload.error.stack;
		}
		pending.reject(error);
	});
}

export async function invokeDesktopRuntime(method: string, payload: Record<string, unknown> = {}) {
	bindDesktopResponseListener();

	if (typeof process.send !== 'function') {
		throw new Error('Desktop runtime IPC channel is unavailable.');
	}

	const id = `desktop-rpc-${++desktopRequestCounter}`;

	return await new Promise((resolve, reject) => {
		pendingDesktopRequests.set(id, { resolve, reject });

		try {
			process.send?.({
				type: 'ace:background:desktop:request',
				id,
				method,
				payload,
			});
		} catch (error) {
			pendingDesktopRequests.delete(id);
			reject(error);
		}
	});
}