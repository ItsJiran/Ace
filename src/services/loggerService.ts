import { StorageEngine } from './storageEngine';

export type LogLevel = 'log' | 'info' | 'warn' | 'error';

export interface LogEntry {
    timestamp: number;
    level: LogLevel;
    message: string;
    id: string;
}

const MAX_LOGS = 100;

class LoggerServiceSingleton {
    private originalConsole = {
        log: console.log,
        info: console.info,
        warn: console.warn,
        error: console.error
    };

    private isInitialized = false;

    init() {
        if (this.isInitialized) return;

        // 1. Create the memory store in Global RAM
        StorageEngine.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: 'system:logs',
            payload: [] as LogEntry[],
            classifications: ['system:core']
        });

        // 2. Intercept console calls
        (Object.keys(this.originalConsole) as LogLevel[]).forEach((level) => {
            (console as any)[level] = (...args: any[]) => {
                // Call original console
                this.originalConsole[level](...args);

                // Format the message
                const message = args.map(arg =>
                    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
                ).join(' ');

                this.addLog(level, message);
            };
        });

        this.isInitialized = true;
        console.log('📖 LoggerService: Console interception active.');
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

export const LoggerService = new LoggerServiceSingleton();
