/**
 * Shared error recovery helper — used by all nodes to redirect to recovery_error.
 *
 * Each node's catch block calls this. The error is serialized into
 * `target_node_reason` as JSON with a `code` field so recovery_error
 * can switch on the error type.
 */
import { Command } from '@langchain/langgraph';
import { serializeAgentError } from '#/shared/lib/agent-errors';

export function buildErrorRecoveryCommand(
    error: unknown,
    nodeName: string,
): Command {
    const serialized = serializeAgentError(error, nodeName);

    return new Command({
        update: {
            target_node: 'recovery_error',
            target_node_reason: JSON.stringify(serialized),
            from_node: nodeName,
        } as any,
        goto: 'recovery_error',
    });
}
