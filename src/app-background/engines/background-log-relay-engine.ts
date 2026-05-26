import { EventBus } from '#/shared/engines/event-engine';
import {
	BACKGROUND_CONSOLE_LOG_EVENT_SLUG,
	type BackgroundConsoleLogLevel,
} from '#/shared/schemas/log';

class BackgroundLogRelayEngineSingleton {
	private originalConsole = {
		log: console.log,
		info: console.info,
		warn: console.warn,
		error: console.error,
		group: console.group,
		groupEnd: console.groupEnd,
	};

	private isInitialized = false;
	private isRelaying = false;

	init() {
		if (this.isInitialized) {
			return;
		}

		const wrap = (level: BackgroundConsoleLogLevel) => {
			const handler = (...args: unknown[]) => {
				this.originalConsole[level](...args);
				this.relay(level, args);
			};

			if (level === 'log') {
				console.log = handler;
				return;
			}

			if (level === 'info') {
				console.info = handler;
				return;
			}

			if (level === 'warn') {
				console.warn = handler;
				return;
			}

			console.error = handler;
		};

		wrap('log');
		wrap('info');
		wrap('warn');
		wrap('error');

		console.group = (...args: unknown[]) => {
			this.originalConsole.group(...args);
			this.relay('info', args);
		};

		console.groupEnd = (...args: unknown[]) => {
			this.originalConsole.groupEnd();
			if (args.length > 0) {
				this.relay('info', args);
			}
		};

		this.isInitialized = true;
		this.originalConsole.log('[BackgroundLogRelayEngine] Background console relay is active.');
	}

	private relay(level: BackgroundConsoleLogLevel, args: unknown[]) {
		if (this.isRelaying) {
			return;
		}

		this.isRelaying = true;
		void EventBus.emit(
			BACKGROUND_CONSOLE_LOG_EVENT_SLUG,
			{
				payload: {
					source: 'background',
					level,
					message: this.formatArgs(args),
					timestamp: Date.now(),
				},
			},
			{ target: 'desktop' },
		).finally(() => {
			this.isRelaying = false;
		});
	}

	private formatArgs(args: unknown[]): string {
		return args
			.map((arg) => {
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
			})
			.join(' ');
	}
}

export const BackgroundLogRelayEngine = new BackgroundLogRelayEngineSingleton();
