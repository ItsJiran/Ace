/**
 * Action: Speak — respond to the user with a message.
 */

import { AIMessage } from '@langchain/core/messages';
import { getConfig } from '@langchain/langgraph';
import { invokeLLM } from '#/app-background/lib/utils/ai/invoke-llm';
import { emitNodeStart, emitNodeEnd } from '#/app-background/lib/utils/ai/emit-graph-event';
import type { AceAgentV3State } from '../../../types';

export function createActionSpeak() {
    return async function actionSpeak(state: AceAgentV3State): Promise<Partial<AceAgentV3State>> {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'action_speak', 'ace-v3', state).catch(() => {});

        if (state.is_stopped) return { result_summary: 'Stopped.', from_node: 'action_speak' };

        const cycle = state.current_cycle;
        const actionThought = cycle?.action?.thought ?? 'Respond to the user.';

        const response = await invokeLLM({
            runtime: getConfig() as never,
            messages: [
                ...(state.messages ?? []),
                new AIMessage(`Speak to the user: ${actionThought}`),
            ],
            nodeName: 'action_speak',
            graphName: 'ace-v3',
        });

        const responseStr = typeof response === 'string' ? response : JSON.stringify(response);

        const output: Partial<AceAgentV3State> = {
            messages: [new AIMessage({ content: responseStr, name: 'ace-v3-speak' })],
            target_node: 'review',
            from_node: 'action_speak',
            result_summary: responseStr.slice(0, 200),
        };

        if (threadUid) emitNodeEnd(threadUid, 'action_speak', 'ace-v3', output).catch(() => {});
        return output;
    };
}
