import { invoke } from '@tauri-apps/api/core';
import { LoggerEngine } from './loggerEngine';
import { PerformanceObserver } from './performanceObserver';

// Late binding to avoid circular dep
type ProcessTracker = {
    track: <T>(
        type: string,
        meta: Record<string, any>,
        fn: (uid: string) => Promise<T>,
        options?: {
            parent_process_uid?: string;
            process_kind?: string;
            owner_engine?: string;
            payload?: Record<string, any>;
        },
    ) => Promise<T>;
};
const getProcessEngine = (): ProcessTracker | null =>
    (typeof window !== 'undefined' ? (window as any).ACE?.process : null) ?? null;

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

export interface ShellRunOptions {
    args?: string[];
    cwd?: string;
    /** If true, prepends 'pkexec' (Linux graphical sudo). Requires polkit agent. */
    sudo?: boolean;
    parent_process_uid?: string;
}

export interface ShellResult {
    stdout: string;
    stderr: string;
    exit_code: number;
    success: boolean;
}

// -----------------------------------------------------------------------
// Security: blocked command patterns.
// These are checked against the resolved program name + first arg.
// Add to this list conservatively — it supplements, not replaces, OS permissions.
// -----------------------------------------------------------------------
const BLOCKED_PATTERNS: RegExp[] = [
    /^rm\s+(-[a-z]*f[a-z]*\s+)?\/$/i,       // rm -rf /
    /^mkfs/i,                                  // format disk
    /^dd\s+if=\/dev/i,                         // dd from block device
    /^(shutdown|reboot|halt|poweroff)/i,       // system power
    /^(fdisk|parted|gdisk)\s/i,               // disk partitioning
];

// -----------------------------------------------------------------------
// ShellEngine
// -----------------------------------------------------------------------

class ShellEngineSingleton {

    /**
     * Run a command. Wraps invoke('execute_shell') with allowlist check,
     * logging, and optional ProcessEngine tracking.
     */
    async run(command: string, opts: ShellRunOptions = {}): Promise<ShellResult> {
        const { args = [], cwd, sudo = false, parent_process_uid } = opts;

        const resolvedCommand = sudo ? 'pkexec' : command;
        const resolvedArgs   = sudo ? [command, ...args] : args;

        this.assertNotBlocked(resolvedCommand, resolvedArgs);

        const meta = { command: resolvedCommand, args: resolvedArgs, cwd };
        LoggerEngine.log('info', `[ShellEngine] run: ${resolvedCommand} ${resolvedArgs.join(' ')}`);

        const pe = getProcessEngine();
        const execute = () => {
            if (import.meta.env.DEV) { PerformanceObserver.trackIpcOp(); }
            return invoke<ShellResult>('execute_shell', {
                command: resolvedCommand,
                args: resolvedArgs,
                cwd: cwd ?? null,
            });
        };

        if (pe) {
            return pe.track(
                `shell:${resolvedCommand}`,
                meta,
                execute,
                {
                    parent_process_uid,
                    process_kind: 'shell_task',
                    owner_engine: 'shellEngine',
                    payload: {
                        status: 'running',
                        command: resolvedCommand,
                        args: resolvedArgs,
                    },
                },
            );
        }
        return execute();
    }

    /**
     * Convenient sudo shorthand. On Linux uses pkexec (graphical auth dialog).
     * On macOS/Windows this will likely fail — not supported without a TTY.
     */
    async runSudo(command: string, opts: Omit<ShellRunOptions, 'sudo'> = {}): Promise<ShellResult> {
        return this.run(command, { ...opts, sudo: true });
    }

    /**
     * Check whether a binary is available on PATH.
     * Returns true if `which <binary>` exits 0.
     */
    async checkAvailable(binary: string): Promise<boolean> {
        try {
            const result = await invoke<ShellResult>('execute_shell', {
                command: 'which',
                args: [binary],
                cwd: null,
            });
            return result.success;
        } catch {
            return false;
        }
    }

    /**
     * Convenience: run and return only stdout as trimmed string.
     * Throws if exit_code !== 0.
     */
    async output(command: string, opts: ShellRunOptions = {}): Promise<string> {
        const result = await this.run(command, opts);
        if (!result.success) {
            throw new Error(
                `[ShellEngine] Command failed (exit ${result.exit_code}): ${command}\n${result.stderr}`
            );
        }
        return result.stdout.trim();
    }

    // -----------------------------------------------------------------------
    private assertNotBlocked(command: string, args: string[]) {
        const full = [command, ...args].join(' ');
        for (const pattern of BLOCKED_PATTERNS) {
            if (pattern.test(full)) {
                throw new Error(`[ShellEngine] Blocked command: "${full}"`);
            }
        }
    }
}

export const ShellEngine = new ShellEngineSingleton();
