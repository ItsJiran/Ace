import type { BackgroundAIStreamEventPayload } from '#/shared/schemas/ai.ts';

let backgroundAIStreamEmitter:
	| ((payload: BackgroundAIStreamEventPayload) => void)
	| null = null;

export function setBackgroundAIStreamEmitter(
	emitter: ((payload: BackgroundAIStreamEventPayload) => void) | null,
) {
	backgroundAIStreamEmitter = emitter;
}

export function emitBackgroundAIStreamEvent(payload: BackgroundAIStreamEventPayload) {
	backgroundAIStreamEmitter?.(payload);
}