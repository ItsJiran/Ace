/**
 * Message event handler — content-block streaming + settled AIMessage.
 */
import type { AgentStreamMessageEvent } from '#/shared/schemas/agent-stream-events';
import type { AgentClientThreadEphemeralMessage } from '#/shared/schemas/agent-client-ephemeral';
import type { StreamHandlerContext } from './types';

export async function handleMessageEvent(
    ctx: StreamHandlerContext,
    threadUid: string,
    event: AgentStreamMessageEvent,
) {
    const run_id = event.data.run_id;
    const prevEphemeral = ctx.getEphemeral(threadUid);
    const converter = ctx.getConverter(threadUid);

    switch (event.type) {
        case 'message-start':
        case 'content-block-start': {
            if (prevEphemeral.some((item) => item.type === 'messages' && item.uid === run_id)) break;
            converter.handleMessageStart(run_id);
            ctx.emitDebug(threadUid, event, { result: `message buffer started (run_id: ${run_id})` });
            await ctx.updateEphemeral(threadUid, [...prevEphemeral, {
                uid: run_id, type: 'messages', event: event.type,
                node: event.node ?? undefined, content: [],
                created_at: Date.now(), updated_at: Date.now(),
            } as AgentClientThreadEphemeralMessage]);
            break;
        }

        case 'content-block-delta': {
            const textDelta = event.data.delta?.text ?? '';
            converter.handleContentBlockDelta(run_id, textDelta);
            if (textDelta) {
                ctx.emitDebug(threadUid, event, { result: `delta (${textDelta.length} chars)` });
            }
            const newEphemeral = [...prevEphemeral];
            const idx = newEphemeral.findIndex((item) => item.type === 'messages' && item.uid === run_id);
            if (idx === -1) {
                converter.handleMessageStart(run_id);
                newEphemeral.push({
                    uid: run_id, type: 'messages', event: 'content-block-start',
                    node: event.node ?? undefined, content: textDelta ? [textDelta] : [],
                    created_at: Date.now(), updated_at: Date.now(),
                } as AgentClientThreadEphemeralMessage);
            } else {
                const target = newEphemeral[idx] as AgentClientThreadEphemeralMessage;
                newEphemeral[idx] = { ...target, content: [...target.content, textDelta], updated_at: Date.now() };
            }
            await ctx.updateEphemeral(threadUid, newEphemeral);
            break;
        }

        case 'message-finish': {
            const usage = (event as any)?.data?.usage;
            let settled = converter.handleMessageFinish(run_id, usage);
            await ctx.removeEphemeralItem(threadUid, run_id, 'messages');
            if (settled && settled.content) {
                const thread = ctx.readThreadFromMemory(threadUid);
                const lastTurn = thread?.state?.messages?.[thread.state.messages.length - 1];
                const first20 = settled.content.trim().slice(0, 20);
                if (first20 && lastTurn?.responses?.some((r: any) => r.type === 'ToolMessage' && String(r.content ?? '').trim().startsWith(first20))) {
                    ctx.emitDebug(threadUid, event, { result: 'AIMessage skipped (overlaps ToolMessage)' });
                } else {
                    await ctx.appendSettledResponse(threadUid, settled);
                    ctx.emitDebug(threadUid, event, { result: `appended AIMessage` });
                }
            } else {
                ctx.emitDebug(threadUid, event, { result: settled ? 'empty content' : 'handleMessageFinish returned null' });
            }
            break;
        }

        case 'content-block-finish':
            await ctx.removeEphemeralItem(threadUid, run_id, 'messages');
            ctx.emitDebug(threadUid, event, { result: `content-block-finish (run_id: ${run_id})` });
            break;

        case 'usage': {
            const usageData = (event as any)?.data?.usage;
            if (usageData) converter.handleMessageUsage(run_id, usageData);
            break;
        }

        default:
            console.warn('[MessageHandler] unhandled', { event });
            ctx.emitDebug(threadUid, event, { error: `unhandled message type: ${event.type}` });
    }
}
