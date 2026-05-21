import type { BackgroundAIStreamEventPayloadType } from '#/shared/schemas/ai.ts';

let backgroundAIStreamEmitter:
	| ((payload: BackgroundAIStreamEventPayloadType) => void)
	| null = null;

export function setBackgroundAIStreamEmitter(
	emitter: ((payload: BackgroundAIStreamEventPayloadType) => void) | null,
) {
	backgroundAIStreamEmitter = emitter;
}

export function emitBackgroundAIStreamEvent(payload: BackgroundAIStreamEventPayloadType) {
	backgroundAIStreamEmitter?.(payload);
}