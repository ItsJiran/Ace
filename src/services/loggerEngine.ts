import { StorageEngine } from './storageEngine';
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
    private originalConsole = {
        log: console.log,
        info: console.info,
        warn: console.warn,
        error: console.error
    };

    private isInitialized = false;

    init() {
        if (this.isInitialized) return;

        // 1. Create the memory store
        StorageEngine.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: 'system:logs',
            payload: [] as LogEntry[],
            classifications: ['system:core']
        });

        // 2. Intercept console calls
        (Object.keys(this.originalConsole) as LogLevel[]).forEach((level) => {
            (console as any)[level] = async (...args: any[]) => {
                // Call original console immediately
                this.originalConsole[level](...args);

                // Format the message
                const message = args.map(arg =>
                    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
                ).join(' ');

                this.addLog(level, message);

                // Write to debug.log file via Rust
                const timestamp = new Date().toISOString();
                const logLine = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
                try {
                    await invoke('log_to_file', { line: logLine });
                } catch (err) {
                    // Silently fail if Rust backend isn't ready or IPC fails, to avoid loops
                }
            };
        });

        this.isInitialized = true;
        
        // Use original console to confirm init without triggering infinite loop if bug exists
        this.originalConsole.log('📖 LoggerEngine: Console interception active + File Logging.');
    }

    log(level: LogLevel, message: string) {
        // Keep direct logging available for services that want explicit writes.
        this.originalConsole[level](message);
        this.addLog(level, message);
    }

    private addLog(level: LogLevel, message: string) {
        const entry: LogEntry = {
            timestamp: Date.now(),
            level,
            message,
            id: Math.random().toString(36).substring(2, 9)
        };

        const currentLogs = StorageEngine.readMemory('system:logs') as LogEntry[] || [];
        const newLogs = [...currentLogs, entry].slice(-MAX_LOGS);

        StorageEngine.dispatchRAMAction({
            action: 'create_memory', // Use create_memory to overwrite the array instead of merging it into an object
            memory_uid: 'system:logs',
            payload: newLogs,
            classifications: ['system:core']
        });
    }
}

export const LoggerEngine = new LoggerEngineSingleton();
