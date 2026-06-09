/**
 * Lifecycle & Invoke event handlers.
 */
import type { AgentStreamLifecycleEvent, AgentStreamInvokeEvent } from '#/shared/schemas/agent-stream-events';
import type { StreamHandlerContext } from './types';

export async function handleLifecycleEvent(
    ctx: StreamHandlerContext,
    threadUid: string,
    event: AgentStreamLifecycleEvent,
) {
    ctx.emitDebug(threadUid, event, { result: `node lifecycle: ${event.type}` });
}

export async function handleInvokeEvent(
    ctx: StreamHandlerContext,
    threadUid: string,
    event: AgentStreamInvokeEvent,
) {
    switch (event.type) {
        case 'invoke-completed':
            await ctx.updateRuntime(threadUid, { is_streaming: false, last_error: undefined });
            ctx.clearConverter(threadUid);
            ctx.emitDebug(threadUid, event, { result: 'invoke completed' });
            break;
        case 'invoke-interrupted':
            await ctx.updateRuntime(threadUid, { is_streaming: false, last_error: event.data?.error ?? 'Run interrupted' });
            ctx.clearConverter(threadUid);
            ctx.emitDebug(threadUid, event, { result: 'invoke interrupted' });
            break;
        case 'invoke-failed':
            await ctx.updateRuntime(threadUid, { is_streaming: false, last_error: event.data?.error ?? 'unknown invoke error' });
            ctx.syncCurrentThreadFromBackground(threadUid).catch(() => {});
            ctx.clearConverter(threadUid);
            ctx.emitDebug(threadUid, event, { error: 'invoke failed' });
            break;
        default:
            ctx.emitDebug(threadUid, event, { error: `unhandled invoke type: ${event.type}` });
    }
}
