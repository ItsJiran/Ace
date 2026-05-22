const path = require('path');
const { spawn } = require('child_process');

function createBackgroundRpcBridge({ projectRoot, resolveElectronRuntimeMode, invokeDesktop }) {
    let backgroundRuntimeProcess = null;
    let backgroundReadyPromise = null;
    let backgroundReadyResolver = null;
    let backgroundReadyRejecter = null;
    let backgroundRequestCounter = 0;
    const backgroundPendingRequests = new Map();
    const backgroundStreamListeners = new Set();

    function isAlive() {
        return Boolean(
            backgroundRuntimeProcess &&
                !backgroundRuntimeProcess.killed &&
                backgroundRuntimeProcess.exitCode === null,
        );
    }

    function createReadyPromise() {
        backgroundReadyPromise = new Promise((resolve, reject) => {
            backgroundReadyResolver = resolve;
            backgroundReadyRejecter = reject;
        });
        return backgroundReadyPromise;
    }

    function reset(error) {
        if (backgroundReadyRejecter && error) {
            backgroundReadyRejecter(error);
        }

        backgroundReadyPromise = null;
        backgroundReadyResolver = null;
        backgroundReadyRejecter = null;
        backgroundRuntimeProcess = null;

        for (const pending of backgroundPendingRequests.values()) {
            pending.reject(error || new Error('Background runtime stopped unexpectedly.'));
        }
        backgroundPendingRequests.clear();
    }

    async function handleDesktopRpcRequest(message) {
        if (!backgroundRuntimeProcess || typeof backgroundRuntimeProcess.send !== 'function') {
            return;
        }

        try {
            const result = await invokeDesktop(
                String(message.method || ''),
                message.payload && typeof message.payload === 'object' ? message.payload : {},
            );

            backgroundRuntimeProcess.send({
                type: 'ace:background:desktop:response',
                id: message.id,
                success: true,
                result,
            });
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            backgroundRuntimeProcess.send({
                type: 'ace:background:desktop:response',
                id: message.id,
                success: false,
                error: {
                    message: err.message,
                    stack: err.stack,
                },
            });
        }
    }

    function handleMessage(message) {
        if (!message || typeof message !== 'object') {
            return;
        }

        if (message.type === 'ace:background:desktop:request' && message.id) {
            void handleDesktopRpcRequest(message);
            return;
        }

        if (message.type === 'ace:background:ready') {
            backgroundReadyResolver?.();
            return;
        }

        if (message.type === 'ace:background:stream:event') {
            for (const listener of backgroundStreamListeners) {
                listener(message.payload);
            }
            return;
        }

        if (message.type !== 'ace:background:rpc:result' || !message.id) {
            return;
        }

        const pending = backgroundPendingRequests.get(message.id);
        if (!pending) {
            return;
        }

        backgroundPendingRequests.delete(message.id);

        if (message.success) {
            pending.resolve(message.result);
            return;
        }

        const error = new Error(message.error?.message || 'Unknown background runtime error');
        if (message.error?.stack) {
            error.stack = message.error.stack;
        }
        pending.reject(error);
    }

    function start() {
        if (isAlive()) {
            return backgroundReadyPromise ?? Promise.resolve();
        }

        const loaderPath = path.join(projectRoot, 'scripts', 'background-alias-loader.mjs');
        const entryPath = path.join(projectRoot, 'src', 'app-background', 'main.ts');

        createReadyPromise();

        backgroundRuntimeProcess = spawn(
            process.execPath,
            ['--import', 'tsx', '--loader', loaderPath, entryPath],
            {
                cwd: projectRoot,
                env: {
                    ...process.env,
                    ELECTRON_RUN_AS_NODE: '1',
                    ACE_RUNTIME_MODE: 'background',
                },
                stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
            },
        );

        backgroundRuntimeProcess.stdout?.on('data', (chunk) => {
            process.stdout.write(`[background] ${String(chunk)}`);
        });

        backgroundRuntimeProcess.stderr?.on('data', (chunk) => {
            process.stderr.write(`[background] ${String(chunk)}`);
        });

        backgroundRuntimeProcess.on('message', handleMessage);
        backgroundRuntimeProcess.once('error', (error) => {
            console.error('[electron] Background runtime failed to start:', error);
            reset(error);
        });
        backgroundRuntimeProcess.once('exit', (code, signal) => {
            const reason = new Error(
                `[electron] Background runtime exited with code ${code ?? 'null'} signal ${signal ?? 'null'}.`,
            );
            reset(reason);
        });

        return backgroundReadyPromise;
    }

    async function ensure() {
        if (resolveElectronRuntimeMode() === 'background') {
            return;
        }

        return await start();
    }

    async function invoke(method, payload = {}) {
        await ensure();

        if (!backgroundRuntimeProcess || typeof backgroundRuntimeProcess.send !== 'function') {
            throw new Error('Background runtime IPC channel is unavailable.');
        }

        const id = `background-rpc-${++backgroundRequestCounter}`;
        const request = {
            type: 'ace:background:rpc:request',
            id,
            method,
            payload,
        };

        return await new Promise((resolve, reject) => {
            backgroundPendingRequests.set(id, { resolve, reject });

            try {
                backgroundRuntimeProcess.send(request);
            } catch (error) {
                backgroundPendingRequests.delete(id);
                reject(error);
            }
        });
    }

    function getStatus() {
        return {
            active: isAlive(),
            runtime_mode: resolveElectronRuntimeMode(),
            pid: backgroundRuntimeProcess?.pid ?? null,
        };
    }

    function dispose() {
        if (backgroundRuntimeProcess && !backgroundRuntimeProcess.killed) {
            backgroundRuntimeProcess.kill();
        }
    }

    function onStreamEvent(listener) {
        backgroundStreamListeners.add(listener);
        return () => {
            backgroundStreamListeners.delete(listener);
        };
    }

    return {
        ensure,
        invoke,
        getStatus,
        dispose,
        onStreamEvent,
    };
}

module.exports = {
    createBackgroundRpcBridge,
};
