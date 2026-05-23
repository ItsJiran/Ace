const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { spawn } = require('child_process');

/**
 * Background RPC bridge owned by Electron main.
 *
 * Responsibilities:
 * - spawn and supervise the background runtime child process
 * - broker request/response RPC between Electron main and the background runtime
 * - relay one-way runtime events between background and the desktop renderer
 * - fan out one-way background stream events to Electron-side listeners
 *
 * This module is intentionally a bridge, not the background runtime itself.
 * Electron main remains the broker/process host, the background runtime remains
 * the execution runtime, and the desktop renderer remains the UI runtime.
 */
function createBackgroundRpcBridge({ projectRoot, resolveElectronRuntimeMode }) {
    let backgroundRuntimeProcess = null;
    let backgroundReadyPromise = null;
    let backgroundReadyResolver = null;
    let backgroundReadyRejecter = null;
    let backgroundRequestCounter = 0;
    const backgroundPendingRequests = new Map();
    const backgroundStreamListeners = new Set();
    const rpcMessageListeners = new Set();
    const runtimeEventListeners = new Set();

    // Determine whether the background child process is currently alive and usable.
    function isAlive() {
        return Boolean(
            backgroundRuntimeProcess &&
                !backgroundRuntimeProcess.killed &&
                backgroundRuntimeProcess.exitCode === null,
        );
    }

    // Rebuild the deferred boot promise whenever we start a fresh child runtime.
    function createReadyPromise() {
        backgroundReadyPromise = new Promise((resolve, reject) => {
            backgroundReadyResolver = resolve;
            backgroundReadyRejecter = reject;
        });
        return backgroundReadyPromise;
    }

    // Reset bridge state and reject any pending RPC calls when the child stops.
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

    // Handle all child-process IPC messages: runtime events, ready state, streams, and RPC results.
    function handleMessage(message) {
        if (!message || typeof message !== 'object') {
            return;
        }

        if (message.type === 'ace:runtime:event') {
            for (const listener of runtimeEventListeners) {
                listener(message);
            }
            return;
        }

        if (
            message.type === 'ace:rpc:request' ||
            message.type === 'ace:rpc:response' ||
            message.type === 'ace:rpc:claim-route' ||
            message.type === 'ace:rpc:claim-route:result' ||
            message.type === 'ace:rpc:release-route' ||
            message.type === 'ace:rpc:registry-sync:request' ||
            message.type === 'ace:rpc:registry-sync'
        ) {
            for (const listener of rpcMessageListeners) {
                listener(message);
            }
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

    // Spawn and wire the background child process when the bridge is first needed.
    function start() {
        if (isAlive()) {
            return backgroundReadyPromise ?? Promise.resolve();
        }

        const loaderPath = path.join(projectRoot, 'scripts', 'background-alias-loader.mjs');
        const entryPath = path.join(projectRoot, 'src', 'app-background', 'main.ts');
        const packagedRuntimeRoot = projectRoot.includes('.asar')
            ? path.join(path.dirname(projectRoot), 'app.asar.unpacked')
            : projectRoot;
        const tsxImportPath = pathToFileURL(
            path.join(packagedRuntimeRoot, 'node_modules', 'tsx', 'dist', 'loader.mjs'),
        ).href;
                const runtimeCwd = projectRoot.includes('.asar')
                        ? path.dirname(projectRoot)
                        : fs.existsSync(projectRoot) && fs.statSync(projectRoot).isDirectory()
                            ? projectRoot
                            : path.dirname(projectRoot);

        createReadyPromise();

        backgroundRuntimeProcess = spawn(
            process.execPath,
            ['--import', tsxImportPath, '--loader', loaderPath, entryPath],
            {
                cwd: runtimeCwd,
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

    // Ensure the background runtime exists before any RPC call is attempted.
    async function ensure() {
        if (resolveElectronRuntimeMode() === 'background') {
            return;
        }

        return await start();
    }

    function ensureStarted() {
        if (resolveElectronRuntimeMode() === 'background') {
            return;
        }

        if (isAlive()) {
            return;
        }

        void start();
    }

    // Invoke a request/response RPC against the background child runtime.
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

    // Expose bridge-level runtime status for diagnostics and UI inspection.
    function getStatus() {
        return {
            active: isAlive(),
            runtime_mode: resolveElectronRuntimeMode(),
            pid: backgroundRuntimeProcess?.pid ?? null,
        };
    }

    // Stop the child process during shutdown or runtime teardown.
    function dispose() {
        if (backgroundRuntimeProcess && !backgroundRuntimeProcess.killed) {
            backgroundRuntimeProcess.kill();
        }
    }

    // Subscribe Electron-side listeners to one-way background stream events.
    function onStreamEvent(listener) {
        backgroundStreamListeners.add(listener);
        return () => {
            backgroundStreamListeners.delete(listener);
        };
    }

    async function emitRpcMessage(message) {
        ensureStarted();

        if (!backgroundRuntimeProcess || typeof backgroundRuntimeProcess.send !== 'function') {
            throw new Error('Background runtime IPC channel is unavailable.');
        }

        backgroundRuntimeProcess.send(message);
    }

    function onRpcMessage(listener) {
        rpcMessageListeners.add(listener);
        return () => {
            rpcMessageListeners.delete(listener);
        };
    }

    async function emitRuntimeEvent(message) {
        ensureStarted();

        if (!backgroundRuntimeProcess || typeof backgroundRuntimeProcess.send !== 'function') {
            throw new Error('Background runtime IPC channel is unavailable.');
        }

        backgroundRuntimeProcess.send(message);
    }

    function onRuntimeEvent(listener) {
        runtimeEventListeners.add(listener);
        return () => {
            runtimeEventListeners.delete(listener);
        };
    }

    return {
        ensure,
        invoke,
        getStatus,
        dispose,
        onStreamEvent,
        emitRpcMessage,
        onRpcMessage,
        emitRuntimeEvent,
        onRuntimeEvent,
    };
}

module.exports = {
    createBackgroundRpcBridge,
};
