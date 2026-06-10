import type {
    AgentThreadAIMessage,
    AgentThreadToolMessage,
    AgentTurnResponseElement,
} from '#/shared/schemas/agent-thread-state';
import type {
    AgentStreamMessageEvent,
    AgentStreamToolEvent,
} from '#/shared/schemas/agent-stream-events';

// ---------------------------------------------------------------------------
// Internal buffer types
// ---------------------------------------------------------------------------

interface MessageDeltaBuffer {
    run_id: string;
    texts: string[];
    token_usage: {
        input: number;
        output: number;
        total: number;
    } | null;
    started_at: number;
}

interface ToolDeltaBuffer {
    tool_call_id: string;
    tool_name: string;
    started_at: number;
}

// ---------------------------------------------------------------------------
// Delta → Message converter
// ---------------------------------------------------------------------------

/**
 * Converts stream deltas into settled AgentTurnResponseElement items.
 *
 * Usage in stream handlers:
 * 1. Feed every message/tool event into the appropriate method.
 * 2. When a message or tool finishes it returns a settled response element.
 * 3. Collect those into the thread's turn responses.
 */
export class DeltaToMessageConverter {
    private messageBuffers = new Map<string, MessageDeltaBuffer>();
    private toolBuffers = new Map<string, ToolDeltaBuffer>();

    // -- Message events ---------------------------------------------------

    handleMessageStart(run_id: string): void {
        if (!this.messageBuffers.has(run_id)) {
            this.messageBuffers.set(run_id, {
                run_id,
                texts: [],
                token_usage: null,
                started_at: Date.now(),
            });
        }
    }

    handleContentBlockDelta(run_id: string, text: string): void {
        const buffer = this.messageBuffers.get(run_id);
        if (!buffer) {
            // Auto-create if delta arrives before start (out-of-order recovery)
            this.messageBuffers.set(run_id, {
                run_id,
                texts: text ? [text] : [],
                token_usage: null,
                started_at: Date.now(),
            });
            return;
        }

        if (text) {
            buffer.texts.push(text);
        }
    }

    handleMessageFinish(
        run_id: string,
        usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number },
    ): AgentThreadAIMessage | null {
        const buffer = this.messageBuffers.get(run_id);
        this.messageBuffers.delete(run_id);

        if (!buffer) return null;

        // If usage came from a separate usage event, prefer that
        if (usage && !buffer.token_usage) {
            buffer.token_usage = {
                input: usage.input_tokens ?? 0,
                output: usage.output_tokens ?? 0,
                total: usage.total_tokens ?? 0,
            };
        }

        const content = buffer.texts.join('');

        // Skip empty messages (e.g. tool-call-only AIMessages)
        if (!content && !buffer.token_usage) return null;

        return {
            type: 'AIMessage',
            uid: run_id,
            content,
            tool_calls: null,
            token_usage: buffer.token_usage,
            timestamp: Date.now(),
        };
    }

    handleMessageUsage(
        run_id: string,
        usage: { input_tokens: number; output_tokens: number; total_tokens: number },
    ): void {
        const buffer = this.messageBuffers.get(run_id);
        if (buffer) {
            buffer.token_usage = {
                input: usage.input_tokens,
                output: usage.output_tokens,
                total: usage.total_tokens,
            };
        }
    }

    // -- Tool events ------------------------------------------------------

    handleToolStarted(tool_call_id: string, tool_name: string): void {
        this.toolBuffers.set(tool_call_id, {
            tool_call_id,
            tool_name,
            started_at: Date.now(),
        });
    }

    handleToolFinished(
        tool_call_id: string,
        output: unknown,
    ): AgentThreadToolMessage | null {
        const buffer = this.toolBuffers.get(tool_call_id);
        this.toolBuffers.delete(tool_call_id);

        if (!buffer) {
            // Recovery: create message even without start event
            return {
                type: 'ToolMessage',
                uid: tool_call_id,
                tool_name: 'unknown_tool',
                tool_call_id,
                content: typeof output === 'string' ? output : JSON.stringify(output),
                timestamp: Date.now(),
            };
        }

        let content = '';
        if (typeof output === 'string') {
            content = output;
        } else if (output && typeof output === 'object') {
            const msg = output as any;
            content = typeof msg.content === 'string'
                ? msg.content
                : JSON.stringify(msg.content ?? output);
        }

        return {
            type: 'ToolMessage',
            uid: tool_call_id,
            tool_name: buffer.tool_name,
            tool_call_id,
            content,
            timestamp: Date.now(),
        };
    }

    // -- Lifecycle --------------------------------------------------------

    /**
     * Clear all in-flight buffers (e.g. on stream abort).
     */
    reset(): void {
        this.messageBuffers.clear();
        this.toolBuffers.clear();
    }

    /**
     * Returns any in-flight message content for live display.
     */
    getLiveMessageText(run_id: string): string {
        return this.messageBuffers.get(run_id)?.texts.join('') ?? '';
    }

    /**
     * Returns names of tools currently in-flight.
     */
    getActiveToolNames(): string[] {
        return Array.from(this.toolBuffers.values()).map((b) => b.tool_name);
    }
}
