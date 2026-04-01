import { KernelEngine } from './kernelEngine';
import { invoke } from '@tauri-apps/api/core';

export type LogLevel = 'log' | 'info' | 'warn' | 'error';
export interface LogEntry {
    timestamp: number;
    level: LogLevel;
    message: string;
    id: string;
}

const MAX_LOGS = 100;

class LoggerEngineSingleton {
    public readonly logsMemoryUid = 'system:logs';
    private originalConsole = {
        log: console.log,
        info: console.info,
        warn: console.warn,
        error: console.error,
        group: console.group,
        groupEnd: console.groupEnd,
    };

    private isInitialized = false;
    private globalHandlersBound = false;

    setupKernelSpace() {
        KernelEngine.registerSystemMemory(this.logsMemoryUid, [] as LogEntry[]);
    }

    init() {
        if (this.isInitialized) return;

        this.setupKernelSpace();

        // Intercept console calls and mirror them into RAM + debug.log.
        (Object.keys(this.originalConsole) as LogLevel[]).forEach((level) => {
            (console as any)[level] = (...args: any[]) => {
                this.originalConsole[level](...args);
                this.writeEntry(level, args);
            };
        });

        console.group = (...args: any[]) => {
            this.originalConsole.group(...args);
            this.writeEntry('info', args);
        };

        console.groupEnd = (...args: any[]) => {
            this.originalConsole.groupEnd(...args);
            if (args.length > 0) {
                this.writeEntry('info', args);
            }
        };

        this.bindGlobalHandlers();

        this.isInitialized = true;
        
        // Use original console to confirm init without triggering infinite loop if bug exists
        this.originalConsole.log('📖 LoggerEngine: Console interception active + File Logging.');
    }

    log(level: LogLevel, message: string) {
        // Keep direct logging available for services that want explicit writes.
        this.originalConsole[level](message);
        this.addLog(level, message);
        this.writeToDebugLog(level, message);
    }

    private bindGlobalHandlers() {
        if (this.globalHandlersBound || typeof window === 'undefined') return;

        window.addEventListener('error', (event) => {
            const message = event.error instanceof Error
                ? event.error.stack || event.error.message
                : event.message || 'Unknown window error';
            this.originalConsole.error('[GlobalError]', message);
            this.addLog('error', `[GlobalError] ${message}`);
            this.writeToDebugLog('error', `[GlobalError] ${message}`);
        });

        window.addEventListener('unhandledrejection', (event) => {
            const reason = event.reason instanceof Error
                ? event.reason.stack || event.reason.message
                : this.formatArgs([event.reason]);
            this.originalConsole.error('[UnhandledRejection]', reason);
            this.addLog('error', `[UnhandledRejection] ${reason}`);
            this.writeToDebugLog('error', `[UnhandledRejection] ${reason}`);
        });

        this.globalHandlersBound = true;
    }

    private writeEntry(level: LogLevel, args: any[]) {
        const message = this.formatArgs(args);
        this.addLog(level, message);
        this.writeToDebugLog(level, message);
    }

    private formatArgs(args: any[]): string {
        return args.map((arg) => {
            if (arg instanceof Error) {
                return arg.stack || arg.message;
            }
            if (typeof arg === 'object' && arg !== null) {
                try {
                    return JSON.stringify(arg, null, 2);
                } catch {
                    return '[Unserializable Object]';
                }
            }
            return String(arg);
        }).join(' ');
    }

    private writeToDebugLog(level: LogLevel, message: string) {
        const timestamp = new Date().toISOString();
        const logLine = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
        void invoke('log_to_file', { line: logLine }).catch(() => {
            // Ignore backend logging failures to avoid logging loops.
        });
    }

    private addLog(level: LogLevel, message: string) {
        const entry: LogEntry = {
            timestamp: Date.now(),
            level,
            message,
            id: Math.random().toString(36).substring(2, 9)
        };

        const currentLogs = KernelEngine.readMemory(this.logsMemoryUid) as LogEntry[] || [];
        const newLogs = [...currentLogs, entry].slice(-MAX_LOGS);

        KernelEngine.updateMemory(this.logsMemoryUid, newLogs);
    }
}

export const LoggerEngine = new LoggerEngineSingleton();
