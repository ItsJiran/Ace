class KernelTelemetrySingleton {
    private readonly telemetryPrefix = '[KernelEngine]';

    logDebug(action: string, context: Record<string, any>) {
        const now = new Date().toISOString();
        console.debug(`${this.telemetryPrefix} ${action} @ ${now}`, context);
    }

    logWarn(action: string, context: Record<string, any>) {
        const now = new Date().toISOString();
        console.warn(`${this.telemetryPrefix} ${action} @ ${now}`, context);
    }

    logError(action: string, context: Record<string, any>) {
        const now = new Date().toISOString();
        console.error(`${this.telemetryPrefix} ${action} @ ${now}`, context);
    }
}

export const KernelTelemetry = new KernelTelemetrySingleton();
