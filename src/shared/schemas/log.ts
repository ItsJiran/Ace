export const BACKGROUND_CONSOLE_LOG_EVENT_SLUG = 'system:background:console-log';

export type BackgroundConsoleLogLevel = 'log' | 'info' | 'warn' | 'error';

export interface BackgroundConsoleLogPayloadType {
	source: 'background';
	level: BackgroundConsoleLogLevel;
	message: string;
	timestamp: number;
}
