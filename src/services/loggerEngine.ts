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
            this.originalConsole.groupEnd();
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
            const pageUrl = this.getPageUrl();
            const message = event.error instanceof Error
                ? event.error.stack || event.error.message
                : event.message || 'Unknown window error';
            const source = event.filename
                ? `${event.filename}:${event.lineno}:${event.colno}`
                : pageUrl;
            const fullMessage = `[GlobalError] ${source} ${message}`;
            this.originalConsole.error('[GlobalError]', source, message);
            this.addLog('error', fullMessage);
            this.writeToDebugLog('error', fullMessage);
        });

        window.addEventListener('unhandledrejection', (event) => {
            const pageUrl = this.getPageUrl();
            const reason = event.reason instanceof Error
                ? event.reason.stack || event.reason.message
                : this.formatArgs([event.reason]);
            const fullMessage = `[UnhandledRejection] ${pageUrl} ${reason}`;
            this.originalConsole.error('[UnhandledRejection]', pageUrl, reason);
            this.addLog('error', fullMessage);
            this.writeToDebugLog('error', fullMessage);
        });

        this.globalHandlersBound = true;
    }

    private writeEntry(level: LogLevel, args: any[]) {
        const message = this.formatArgs(args);
        this.addLog(level, message);
        this.writeToDebugLog(level, message);
    }

    private getPageUrl(): string {
        if (typeof window === 'undefined') return 'unknown://runtime';
        return window.location.href;
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

        const raw = KernelEngine.readMemory(this.logsMemoryUid);
        const currentLogs = Array.isArray(raw) ? raw as LogEntry[] : [];
        const newLogs = [...currentLogs, entry].slice(-MAX_LOGS);

        KernelEngine.writeMemory(this.logsMemoryUid, newLogs);
    }
}

export const LoggerEngine = new LoggerEngineSingleton();
