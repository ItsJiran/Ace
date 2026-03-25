/**
 * AIContextEngine
 *
 * The brain of the session context management system.
 *
 * Responsibilities:
 * 1. Session State: Tracks conversation history (turns), model-authored summaries, and context blocks per session.
 * 2. Context Assembly: Decides WHAT information gets sent to the AI in the next prompt (System prompt vs History vs RAG).
 * 3. Parser Bridge: Receives structured "context blocks" from the AI Parser (e.g. tool results, analysis) and integrates them.
 * 4. Observability: Syncs all internal state to RAM (`system:session:{id}:context`) so the UI can visualize exactly what the AI "knows".
 * 5. Cost Control: Trims history and offloads large payloads to RAG (via AIContextRagEngine) to save tokens.
 *
 * Summary policy:
 * - The canonical session summary must come from the model itself via a `context` block.
 * - Plain assistant prose does not automatically become summary anymore.
 * - A newer summary block replaces the previous summary.
 */
import { StorageEngine } from './storageEngine';
import { AIContextRagEngine } from './aiContextRagEngine';

/**
 * A pointer to a piece of information included in the AI's context window.
 * Used for debugging/UI to show "Why did the AI know this?".
 */
export interface SessionContextRef {
    /** The RAM or Storage key where the actual content lives */
    key: string;
    /** Human-readable label for the UI (e.g. "Recent turns") */
    label: string;
    /** Category of the context */
    kind: 'summary' | 'history' | 'runtime' | 'tooling' | 'input';
    /** Optional extra info (e.g. which specific tool output) */
    detail?: string;
    /** Approx number of tokens this piece consumes */
    token_estimate?: number;
}

/**
 * A single message in the conversation history.
 */
export interface SessionTurn {
    at: number;
    role: 'user' | 'assistant' | 'system';
    text: string;
}

/**
 * Complete state of a single AI session's context.
 * This is what gets synced to RAM for the Session Monitor.
 */
export interface SessionContextState {
    session_id: string;
    attached_at: number;
    updated_at: number;
    /** Canonical summary authored by the model via a parsed context block */
    summary: string;
    /** Recent raw message history */
    turns: SessionTurn[];
    /** List of context sources currently active for this session */
    used_contexts: SessionContextRef[];
    /**
     * Raw structured data blocks received from the AI Parser.
     * These are often tool outputs or "thinking" blocks.
     */
    context_blocks: Array<{
        at: number;
        payload: Record<string, unknown>;
    }>;
}

interface BuildContextOptions {
    sdk?: string;
    model?: string;
}

const DEFAULT_APP_BRIDGE_CONTEXT = [
    'You are operating inside ACE Assistant runtime.',
    'Primary bridge channel is structured fenced blocks that runtime parser can consume.',
    'Use execute_tool blocks when you need tool actions, and keep payload in strict JSON.',
    'Use context blocks to publish compact machine-readable context updates for future turns.',
    'Do not rely on hidden memory; if a fact must persist, emit it through context block.',
].join('\n');

const DEFAULT_PARSER_CONTEXT_PROTOCOL = [
    'Context block contract:',
    '- Fence tag: ```context',
    '- Payload must be JSON object.',
    '- For replacing summary use one of:',
    '  {"summary":"..."} or {"context_summary":"..."} or {"type":"summary_update","text":"..."}',
    '- Keep summary concise, task-focused, and safe to reuse in next prompt.',
    '- When response is very long, proactively emit a summary_update context block.',
].join('\n');

class AIContextEngineSingleton {
    // In-memory sessions map.
    // In a future distributed version, this might be backed by Redis/DB.
    private readonly sessions = new Map<string, SessionContextState>();
    
    // Limits to prevent context window overflow
    private readonly maxTurns = 20;
    private readonly maxContextBlocks = 8;
    
    // Registry key for listing all active contexts
    private readonly indexMemoryUid = 'system:ai_context_engine:sessions';

    /**
     * Initializes the engine and its dependencies (RAG).
     */
    boot() {
        // Ensure RAG system is ready to accept offloaded payloads
        AIContextRagEngine.boot();
        this.syncIndex();
    }

    /**
     * Gets or creates the context state for a given session ID.
     * Call this whenever a session starts or receives a new message.
     */
    attachSession(sessionId: string): SessionContextState {
        const existing = this.sessions.get(sessionId);
        if (existing) return existing;

        const state: SessionContextState = {
            session_id: sessionId,
            attached_at: Date.now(),
            updated_at: Date.now(),
            summary: '',
            turns: [],
            used_contexts: [],
            context_blocks: [],
        };

        this.sessions.set(sessionId, state);
        
        // Initial sync to RAM so it appears in monitors immediately
        this.syncSessionMemory(state);
        this.syncIndex();
        return state;
    }

    /**
     * Cleans up a session's context state and removes it from RAM.
     * Called when a session is explicitly closed.
     */
    evictContext(sessionId: string): boolean {
        const existed = this.sessions.delete(sessionId);
        if (!existed) return false;

        // Clean up the specific session RAM key
        StorageEngine.dispatchRAMAction({
            action: 'delete_memory',
            memory_uid: this.sessionMemoryUid(sessionId),
        });
        
        // Update the main index
        this.syncIndex();
        return true;
    }

    /**
     * Records a new message (turn) in the conversation history.
     * Also updates the rolling summary if the message is from the assistant.
     */
    ingestTurn(sessionId: string, turn: SessionTurn): SessionContextState {
        const state = this.attachSession(sessionId);
        state.turns.push(turn);
        
        // Rotate older turns out to save space
        if (state.turns.length > this.maxTurns) {
            state.turns = state.turns.slice(-this.maxTurns);
        }

        state.updated_at = Date.now();
        this.syncSessionMemory(state);
        return state;
    }

    /**
     * Ingests a structured context block (e.g. tool result) from the AI Parser.
     * This is the "bridge" between the raw output stream and the context system.
     * 
     * Key Logic:
     * 1. If the payload contains a summary update, it becomes the canonical session summary
     *    and replaces the previous one.
     * 2. If payload > 900 chars, it offloads to RAG storage (AIContextRagEngine)
     *    and only keeps a reference token in the session context.
     * 3. If payload is small, it stays inline.
     * 4. Always extracts lightweight routing fields like `intent` when present.
     */
    ingestContextBlock(sessionId: string, payload: Record<string, unknown>): SessionContextState {
        const state = this.attachSession(sessionId);
        const now = Date.now();

        state.context_blocks.push({
            at: now,
            payload,
        });

        // Cap the number of blocks to prevent infinite memory growth
        if (state.context_blocks.length > this.maxContextBlocks) {
            state.context_blocks = state.context_blocks.slice(-this.maxContextBlocks);
        }

        // Summary is model-authored. If the model emits a summary-bearing context
        // block, that summary replaces the previous canonical summary.
        const summaryFromBlock = this.extractSummaryFromContextPayload(payload);
        if (summaryFromBlock) {
            state.summary = summaryFromBlock;
        }

        const nextContexts: SessionContextRef[] = [];
        nextContexts.push({
            key: `session:ai_context_block:${now}`,
            label: 'AI context block',
            kind: 'summary',
            token_estimate: Math.ceil(JSON.stringify(payload).length / 4),
        });

        // RAG Bridge: Check payload size
        const payloadText = JSON.stringify(payload);
        if (payloadText.length > 900) {
            // It's huge -> Store in RAG, keep reference only
            const reference = AIContextRagEngine.createReference({
                type: 'context_block',
                title: 'AI context block',
                summary: typeof payload.summary === 'string' ? payload.summary.slice(0, 200) : 'Context block snapshot',
                source_session: sessionId,
                tags: ['context', 'ai_parser'],
                token_estimate: Math.ceil(payloadText.length / 4),
                payload,
            });

            nextContexts.push({
                key: reference.storage_key,
                label: 'RAG reference: context block',
                kind: 'tooling',
                detail: reference.ref_uid,
                token_estimate: reference.token_estimate,
            });
        }

        // Extract intent for lightweight context
        if (typeof payload.intent === 'string' && payload.intent.trim().length > 0) {
            nextContexts.push({
                key: 'session:intent',
                label: 'Session intent',
                kind: 'summary',
                detail: payload.intent,
                token_estimate: Math.ceil(payload.intent.length / 4),
            });
        }

        if (summaryFromBlock) {
            nextContexts.push({
                key: 'session:summary',
                label: 'AI-authored session summary',
                kind: 'summary',
                detail: 'replaced from context block',
                token_estimate: Math.ceil(summaryFromBlock.length / 4),
            });
        }

        // Update active context list. The latest block can replace summary and
        // intent, while older block references are retained in a short tail for
        // observability.
        state.used_contexts = [
            ...nextContexts,
            ...state.used_contexts
                .filter((ctx) => ctx.key !== 'session:intent' && ctx.key !== 'session:summary')
                .slice(0, 8),
        ];

        state.updated_at = Date.now();
        this.syncSessionMemory(state);
        this.syncIndex();
        return state;
    }

    /**
     * Constructs the final prompt string to send to the AI model.
     * This is where the decisions about what history to include vs drop happen.
     * 
     * Strategy:
    * 1. Include model-authored summary (if any).
     * 2. Include last N turns (history).
     * 3. Include user prompt.
     * 4. Wrap sections in clear delimiters [SESSION_SUMMARY], [RECENT_TURNS].
     * 
     * Future: This will likely evolve to include RAG references dynamically.
     */
    buildContext(sessionId: string, prompt: string, options: BuildContextOptions = {}) {
        const state = this.attachSession(sessionId);

        // Simple strategy: recent 6 turns + summary
        const recentTurns = state.turns.slice(-6);
        const recentTurnsTokens = recentTurns.reduce((acc, t) => acc + Math.ceil(t.text.length / 4), 0);

        const usedContexts: SessionContextRef[] = [
            {
                key: 'input:user_prompt',
                label: 'Current user prompt',
                kind: 'input',
                token_estimate: Math.ceil(prompt.length / 4),
            },
            {
                key: 'default:app_bridge',
                label: 'Default app bridge context',
                kind: 'runtime',
                token_estimate: Math.ceil(DEFAULT_APP_BRIDGE_CONTEXT.length / 4),
            },
            {
                key: 'default:context_parser_protocol',
                label: 'Default parser context protocol',
                kind: 'tooling',
                token_estimate: Math.ceil(DEFAULT_PARSER_CONTEXT_PROTOCOL.length / 4),
            },
        ];

        if (state.summary) {
            usedContexts.push({
                key: 'session:summary',
                label: 'Session summary from AI context block',
                kind: 'summary',
                token_estimate: Math.ceil(state.summary.length / 4),
            });
        }

        if (recentTurns.length > 0) {
            usedContexts.push({
                key: 'session:recent_turns',
                label: `Recent turns (${recentTurns.length})`,
                kind: 'history',
                token_estimate: recentTurnsTokens,
            });
        }

        if (options.sdk || options.model) {
            usedContexts.push({
                key: 'runtime:model_binding',
                label: 'Session model binding',
                kind: 'runtime',
                detail: `${options.sdk ?? 'unknown'} / ${options.model ?? 'unknown'}`,
            });
        }

        state.used_contexts = usedContexts;
        state.updated_at = Date.now();
        this.syncSessionMemory(state);

        const contextTextParts: string[] = [];
        contextTextParts.push(`[APP_BRIDGE_CONTEXT]\n${DEFAULT_APP_BRIDGE_CONTEXT}`);
        contextTextParts.push(`[PARSER_CONTEXT_PROTOCOL]\n${DEFAULT_PARSER_CONTEXT_PROTOCOL}`);

        if (state.summary) {
            contextTextParts.push(`[SESSION_SUMMARY]\n${state.summary}`);
        }
        if (recentTurns.length > 0) {
            const serialized = recentTurns
                .map((t) => `${t.role.toUpperCase()}: ${t.text}`)
                .join('\n');
            contextTextParts.push(`[RECENT_TURNS]\n${serialized}`);
        }

        const composedPrompt =
            contextTextParts.length > 0
                ? `${contextTextParts.join('\n\n')}\n\n[USER_PROMPT]\n${prompt}`
                : prompt;

        return {
            used_contexts: usedContexts,
            composed_prompt: composedPrompt,
        };
    }

    /**
     * Retrieves the current context state for a session.
     * Useful for UI components to "peek" at what the AI knows.
     */
    getSessionContext(sessionId: string): SessionContextState | null {
        return this.sessions.get(sessionId) ?? null;
    }

    /**
     * Lists all active session contexts sorted by ID.
     */
    listSessionContexts(): SessionContextState[] {
        return Array.from(this.sessions.values()).sort((a, b) => a.session_id.localeCompare(b.session_id));
    }

    // ── Internal Helpers ────────────────────────────────────────────────────────

    /**
     * Extracts a canonical summary update from a parser-supplied context block.
     *
     * Supported shapes are intentionally flexible so prompt/policy iterations do
     * not require engine rewrites every time the model output format evolves.
     * Examples:
     * - { summary: "..." }
     * - { context_summary: "..." }
     * - { type: "summary_update", text: "..." }
     * - { kind: "summary_update", summary: "..." }
     */
    private extractSummaryFromContextPayload(payload: Record<string, unknown>): string | null {
        const directSummary = typeof payload.summary === 'string' ? payload.summary.trim() : '';
        if (directSummary.length > 0) {
            return directSummary.slice(0, 700);
        }

        const contextSummary = typeof payload.context_summary === 'string' ? payload.context_summary.trim() : '';
        if (contextSummary.length > 0) {
            return contextSummary.slice(0, 700);
        }

        const kind = typeof payload.kind === 'string' ? payload.kind.trim().toLowerCase() : '';
        const type = typeof payload.type === 'string' ? payload.type.trim().toLowerCase() : '';
        const isSummaryUpdate = kind === 'summary_update' || type === 'summary_update';
        if (!isSummaryUpdate) {
            return null;
        }

        const textField = typeof payload.text === 'string' ? payload.text.trim() : '';
        if (textField.length > 0) {
            return textField.slice(0, 700);
        }

        const replacementField = typeof payload.replace_summary === 'string' ? payload.replace_summary.trim() : '';
        if (replacementField.length > 0) {
            return replacementField.slice(0, 700);
        }

        return null;
    }

    private sessionMemoryUid(sessionId: string): string {
        return `system:session:${sessionId}:context`;
    }

    /**
     * Syncs a single session's state to RAM.
     * This makes it visible to the "Session Monitor" and other reactive UI tools.
     */
    private syncSessionMemory(state: SessionContextState) {
        StorageEngine.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: this.sessionMemoryUid(state.session_id),
            payload: {
                session_id: state.session_id,
                attached_at: state.attached_at,
                updated_at: state.updated_at,
                summary: state.summary,
                turns: [...state.turns],
                used_contexts: [...state.used_contexts],
                context_blocks: [...state.context_blocks],
            },
            classifications: ['system:core', 'system:ai_context_engine', 'system:session_context'],
        });
    }

    /**
     * Syncs the master list of all active sessions to RAM.
     * Used by the Session Monitor to show the list of available sessions.
     */
    private syncIndex() {
        StorageEngine.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: this.indexMemoryUid,
            payload: this.listSessionContexts().map((s) => ({
                session_id: s.session_id,
                updated_at: s.updated_at,
                used_contexts_count: s.used_contexts.length,
            })),
            classifications: ['system:core', 'system:ai_context_engine'],
        });
    }
}

export const AIContextEngine = new AIContextEngineSingleton();
