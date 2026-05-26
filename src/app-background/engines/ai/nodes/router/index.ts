import type { BaseMessage } from '@langchain/core/messages';
import { z } from 'zod';

import { type AceAgentWorkflowState } from '#/shared/schemas/ai';

import {
	resolveWorkflowMessagesUpdate,
} from '../agent-state';

export const RouterNodeOutputSchema = z.object({
	messages: z.array(z.unknown()),
	route_to: z.enum(['orchestrator', 'executor', 'observe']).optional(),
	route_reason: z.string().optional(),
});
export type RouterNodeOutput = z.infer<typeof RouterNodeOutputSchema>;

export function resolveRouterNodeOutput(input: {
	currentMessages: BaseMessage[];
	nextMessages?: BaseMessage[];
	route_to?: RouterNodeOutput['route_to'];
	route_reason?: string;
}): RouterNodeOutput {
	return RouterNodeOutputSchema.parse({
		messages: resolveWorkflowMessagesUpdate(input.currentMessages, input.nextMessages),
		route_to: input.route_to,
		route_reason: input.route_reason,
	});
}

export function createRouterNode() {
	return async function routerNode(state: AceAgentWorkflowState) {
		console.info('[AINode] start router', {
			messageCount: Array.isArray(state.messages) ? state.messages.length : 0,
		});
		const nextRoute: RouterNodeOutput['route_to'] = 'orchestrator';
		const routeReason =
			'Router berjalan secara rule-based setelah reasoning dan meneruskan alur linear ke orchestrator.';

		return resolveRouterNodeOutput({
			currentMessages: state.messages,
			nextMessages: state.messages,
			route_to: nextRoute,
			route_reason: routeReason,
		});
	};
}

export default createRouterNode;
