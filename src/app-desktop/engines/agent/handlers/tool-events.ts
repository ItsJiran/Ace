/**
 * Tool event handler.
 */
import type { AgentStreamToolEvent } from '#/shared/schemas/agent-stream-events';
import type { AgentClientThreadEphemeralTool } from '#/shared/schemas/agent-client-ephemeral';
import type { StreamHandlerContext } from './types';

export async function handleToolEvent(
    ctx: StreamHandlerContext,
    threadUid: string,
    event: AgentStreamToolEvent,
) {
    const tool_call_id = event?.data?.tool_call_id as string;
    const tool_name = (event as any)?.data?.tool_name ?? (event as any)?.data?.name ?? 'unknown_tool';
    const converter = ctx.getConverter(threadUid);

    switch (event.type) {
        case 'tool-started': {
            converter.handleToolStarted(tool_call_id, tool_name);
            ctx.emitDebug(threadUid, event, { result: `tracked tool: ${tool_name}` });
            const prev = ctx.getEphemeral(threadUid);
            await ctx.updateEphemeral(threadUid, [...prev, {
                type: 'tool', uid: tool_call_id, node: event.node ?? null,
                content: { tool_name }, event: 'tool-started',
                created_at: Date.now(), updated_at: Date.now(),
            } as AgentClientThreadEphemeralTool]);
            break;
        }
        case 'tool-finished': {
            const content = (event as any)?.data?.content ?? '';
            const settled = converter.handleToolFinished(tool_call_id, content);
            await ctx.removeEphemeralItem(threadUid, tool_call_id, 'tool');
            if (settled) {
                await ctx.appendSettledResponse(threadUid, settled);
                ctx.emitDebug(threadUid, event, { result: `appended ToolMessage: ${tool_name}` });
            } else {
                ctx.emitDebug(threadUid, event, { error: 'handleToolFinished returned null' });
            }
            break;
        }
        case 'tool-error': {
            const errorContent = (event as any)?.data?.content ?? (event as any)?.data?.error ?? 'tool error';
            const settled = converter.handleToolFinished(tool_call_id, errorContent);
            await ctx.removeEphemeralItem(threadUid, tool_call_id, 'tool');
            if (settled) await ctx.appendSettledResponse(threadUid, settled);
            ctx.emitDebug(threadUid, event, { error: 'tool-error → ToolMessage created' });
            break;
        }
        case 'tool-delta':
            ctx.emitDebug(threadUid, event, { result: 'tool-delta (ignored)' });
            break;
        default:
            console.warn('[ToolHandler] unhandled', { event });
            ctx.emitDebug(threadUid, event, { error: `unhandled tool type: ${event.type}` });
    }
}
