import { describe, expect, it } from 'vitest';

import { AIParserProtocolState } from '#/schemas/ai';
import { shouldContinueAutonomousLoop } from '#/services/aiGateway/interactionParserLoop';

describe('interactionParserLoop parser protocol semantics', () => {
	it('keeps stop states distinct at enum level', () => {
		expect(AIParserProtocolState.STOP_CURRENT_RESPONSE).not.toBe(AIParserProtocolState.STOP_AND_CONTINUE_LOOP);
	});

	it('keeps continue state separate from terminal stop states', () => {
		expect(AIParserProtocolState.CONTINUE_NEXT_BLOCK).not.toBe(AIParserProtocolState.STOP_CURRENT_RESPONSE);
		expect(AIParserProtocolState.CONTINUE_NEXT_BLOCK).not.toBe(AIParserProtocolState.STOP_AND_CONTINUE_LOOP);
	});

	it('does not continue without an explicit parser continuation signal', () => {
		expect(shouldContinueAutonomousLoop('Reason')).toBe(false);
		expect(shouldContinueAutonomousLoop('Act')).toBe(false);
		expect(shouldContinueAutonomousLoop('Observe')).toBe(false);
	});

	it('stops by default in Finalize', () => {
		expect(shouldContinueAutonomousLoop('Finalize')).toBe(false);
	});

	it('lets parser stop_current_response override a non-Finalize state', () => {
		expect(shouldContinueAutonomousLoop('Act', AIParserProtocolState.STOP_CURRENT_RESPONSE)).toBe(false);
	});

	it('lets parser stop_and_continue_loop override Finalize', () => {
		expect(shouldContinueAutonomousLoop('Finalize', AIParserProtocolState.STOP_AND_CONTINUE_LOOP)).toBe(true);
	});
});
