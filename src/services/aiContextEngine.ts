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
import { RegistryEngine } from './registryEngine';

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

export interface SessionHistorySummary {
    at: number;
    block_type: 'history_summary_ai_prompt' | 'history_summary_ai_response';
    summary: string;
    memory_key?: string;
    ref_uid?: string;
    payload: Record<string, unknown>;
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
    /** Compact per-turn summaries emitted by the AI itself */
    history_summaries: SessionHistorySummary[];
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
    promptHistoryMemoryKey?: string;
    promptHistoryRefUid?: string;
    responseHistoryMemoryKey?: string;
    responseHistoryRefUid?: string;
}

interface RuntimeHistorySummaryFallbackInput {
    block_type: SessionHistorySummary['block_type'];
    memory_key: string;
    ref_uid?: string;
    summary_source_text: string;
    protocol_reason: 'missing_block' | 'invalid_block';
}

const DEFAULT_APP_BRIDGE_CONTEXT = [
    'You are an AI assistant running inside the ACE Assistant runtime.',
    '',
    'OUTPUT CHANNELS:',
    '  1. Plain prose — everything written outside a tag block is visible to the user.',
    '  2. Structured tag blocks — intercepted by the runtime parser, NEVER shown to the user.',
    '     Opening: <block_name>  Closing: </block_name>  (each on its own line)',
    '',
    'RULES:',
    '  - Do NOT describe, mention, or explain tag blocks to the user.',
    '  - Do NOT use markdown fenced blocks (``` ... ```) for machine-readable payloads — use the tag mechanism.',
    '  - All block payloads must be valid JSON objects.',
    '  - There is no hidden persistent memory. If a fact must survive to the next turn, emit it in a <context> block.',
    '',
    'MANDATORY PER-TURN BLOCKS (every single turn, no exception):',
    '  1. <history_summary_ai_prompt>  — compact JSON summary of the user message. Emit BEFORE your prose.',
    '  2. <history_summary_ai_response> — compact JSON summary of your own response. Emit AFTER your prose.',
    '  3. <context>                     — emit when session state changes (new name, goal, key fact learned).',
    '',
    'TOOL AND EVENT BLOCKS:',
    '  - <execute_tool>    — request the runtime to invoke a named tool.',
    '  - <execute_storage> — request a memory/storage read or write.',
    '  - <event>           — fire a UI or system event.',
].join('\n');

function buildDefaultParserContextProtocol(): string {
    return [
        '=== TAG BLOCK MECHANISM ===',
        '',
        'SYNTAX RULES:',
        '  - Opening tag: <block_name>  (block_name = lowercase letters, digits, underscores)',
        '  - Closing tag: </block_name>  (must exactly match the opening tag name)',
        '  - Tags must be on their own line; payload content goes between them.',
        '  - All payloads must be valid JSON objects — not arrays, not plain strings.',
        '  - Never embed user-visible text inside a block — blocks are pure machine payload.',
        '  - Never invent closing markers other than </block_name>.',
        '',
        'PER-TURN BLOCK ORDERING:',
        '  Step 1 — <history_summary_ai_prompt>   (compact summary of the incoming user message)',
        '  Step 2 — Your user-facing prose response',
        '  Step 3 — <context>                      (only when new session facts need to be stored)',
        '  Step 4 — <history_summary_ai_response>  (compact summary of your response, after prose is done)',
        '',
        'CONTEXT BLOCK RULES:',
        '  - Accepted summary payload shapes:',
        '      {"summary":"..."}',
        '      {"context_summary":"..."}',
        '      {"type":"summary_update","text":"..."}',
        '  - Keep summaries concise, task-focused, and safe to reuse in future prompts.',
        '  - When a response is very long, always emit a <context> summary_update block.',
        '',
        'HISTORY SUMMARY BLOCK RULES:',
        '  - Both <history_summary_ai_prompt> and <history_summary_ai_response> are required every turn.',
        '  - Payload must include the exact "memory_key" value provided in [TURN_HISTORY_PROTOCOL].',
        '  - If "ref_uid" is provided in [TURN_HISTORY_PROTOCOL], include it in the payload too.',
        '',
        RegistryEngine.buildParserBlockProtocolLines(),
    ].join('\n');
}

class AIContextEngineSingleton {
    // In-memory sessions map.
    // In a future distributed version, this might be backed by Redis/DB.
    private readonly sessions = new Map<string, SessionContextState>();
    
    // Limits to prevent context window overflow
    private readonly maxTurns = 20;
    private readonly maxContextBlocks = 8;
    private readonly maxHistorySummaries = 16;
    
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
            history_summaries: [],
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

    ingestHistorySummaryBlock(
        sessionId: string,
        blockType: SessionHistorySummary['block_type'],
        payload: Record<string, unknown>,
    ): SessionContextState {
        const state = this.attachSession(sessionId);
        const now = Date.now();
        const summaryText = this.extractHistorySummaryText(payload);
        const memoryKey = this.extractHistoryMemoryKey(payload);
        const refUid = this.extractHistoryRefUid(payload);

        const nextEntry: SessionHistorySummary = {
            at: now,
            block_type: blockType,
            summary: summaryText,
            memory_key: memoryKey,
            ref_uid: refUid,
            payload,

        };

        const existingIndex = state.history_summaries.findIndex((item) => {
            if (item.block_type !== blockType) return false;
            if (memoryKey && item.memory_key === memoryKey) return true;
            if (refUid && item.ref_uid === refUid) return true;
            return false;
        });

        if (existingIndex >= 0) {
            state.history_summaries[existingIndex] = nextEntry;
        } else {
            state.history_summaries.push(nextEntry);
        }

        if (state.history_summaries.length > this.maxHistorySummaries) {
            state.history_summaries = state.history_summaries.slice(-this.maxHistorySummaries);
        }

        const detailParts = [refUid, memoryKey].filter(Boolean);
        const nextContexts: SessionContextRef[] = [
            {
                key: memoryKey || `session:${blockType}:${now}`,
                label: blockType === 'history_summary_ai_prompt' ? 'AI prompt history summary' : 'AI response history summary',
                kind: 'history',
                detail: detailParts.length > 0 ? detailParts.join(' | ') : undefined,
                token_estimate: Math.ceil(summaryText.length / 4),
            },
        ];

        state.used_contexts = [
            ...nextContexts,
            ...state.used_contexts.slice(0, 11),
        ];

        state.updated_at = now;
        this.syncSessionMemory(state);
        this.syncIndex();
        return state;
    }

    ingestRuntimeHistorySummaryFallback(
        sessionId: string,
        input: RuntimeHistorySummaryFallbackInput,
    ): SessionContextState {
        const summary = this.buildRuntimeFallbackSummary(input.summary_source_text, input.block_type);

        return this.ingestHistorySummaryBlock(sessionId, input.block_type, {
            type: input.block_type,
            summary,
            memory_key: input.memory_key,
            ref_uid: input.ref_uid,
            source: 'runtime_fallback',
            protocol_reason: input.protocol_reason,
        });
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
        const recentHistorySummaries = state.history_summaries.slice(-8);
        const recentTurns = recentHistorySummaries.length === 0 ? state.turns.slice(-2) : [];
        const recentTurnsTokens = recentTurns.reduce((acc, t) => acc + Math.ceil(t.text.length / 4), 0);
        const historySummaryTokens = recentHistorySummaries.reduce((acc, item) => acc + Math.ceil(item.summary.length / 4), 0);

        const parserContextProtocol = buildDefaultParserContextProtocol();

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
                token_estimate: Math.ceil(parserContextProtocol.length / 4),
            },
        ];

        if (options.promptHistoryMemoryKey) {
            usedContexts.push({
                key: options.promptHistoryMemoryKey,
                label: 'Reserved raw prompt history record',
                kind: 'history',
                detail: options.promptHistoryRefUid,
            });
        }

        if (options.responseHistoryMemoryKey) {
            usedContexts.push({
                key: options.responseHistoryMemoryKey,
                label: 'Reserved raw response history record',
                kind: 'history',
                detail: options.responseHistoryRefUid,
            });
        }

        if (state.summary) {
            usedContexts.push({
                key: 'session:summary',
                label: 'Session summary from AI context block',
                kind: 'summary',
                token_estimate: Math.ceil(state.summary.length / 4),
            });
        }

        if (recentHistorySummaries.length > 0) {
            usedContexts.push({
                key: 'session:history_summaries',
                label: `AI-authored history summaries (${recentHistorySummaries.length})`,
                kind: 'history',
                token_estimate: historySummaryTokens,
            });
        }

        if (recentTurns.length > 0) {
            usedContexts.push({
                key: 'session:recent_turns',
                label: `Fallback raw turns (${recentTurns.length})`,
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
        contextTextParts.push(`[PARSER_CONTEXT_PROTOCOL]\n${parserContextProtocol}`);

        if (options.promptHistoryMemoryKey || options.responseHistoryMemoryKey) {
            const lines = [
                'Current turn history summary contract:',
                '- Before normal prose, emit this exact opening tag: <history_summary_ai_prompt>',
                '- Close it with: </history_summary_ai_prompt>',
                '- After your normal prose finishes, emit this exact opening tag: <history_summary_ai_response>',
                '- Close it with: </history_summary_ai_response>',
                '- Both blocks must contain strict JSON object payload.',
                `- For prompt block use memory_key: ${options.promptHistoryMemoryKey ?? 'missing'}`,
                `- For response block use memory_key: ${options.responseHistoryMemoryKey ?? 'missing'}`,
                options.promptHistoryRefUid ? `- Prompt ref_uid: ${options.promptHistoryRefUid}` : '',
                options.responseHistoryRefUid ? `- Response ref_uid: ${options.responseHistoryRefUid}` : '',
                '- Example prompt block JSON: {"summary":"Ringkas maksud prompt user saat ini.","memory_key":"...","ref_uid":"..."}',
                '- Example response block JSON: {"summary":"Ringkas inti jawaban dan hasil final.","memory_key":"...","ref_uid":"..."}',
            ].filter(Boolean).join('\n');
            contextTextParts.push(`[TURN_HISTORY_PROTOCOL]\n${lines}`);
        }

        if (state.summary) {
            contextTextParts.push(`[SESSION_SUMMARY]\n${state.summary}`);
        }

        if (recentHistorySummaries.length > 0) {
            const serializedHistory = recentHistorySummaries
                .map((item) => {
                    const parts = [
                        item.block_type.toUpperCase(),
                        item.summary,
                        item.memory_key ? `memory_key=${item.memory_key}` : '',
                        item.ref_uid ? `ref_uid=${item.ref_uid}` : '',
                    ].filter(Boolean);
                    return parts.join(' | ');
                })
                .join('\n');
            contextTextParts.push(`[SESSION_HISTORY_SUMMARIES]\n${serializedHistory}`);
        }

        if (recentTurns.length > 0) {
            const serialized = recentTurns
                .map((t) => `${t.role.toUpperCase()}: ${t.text}`)
                .join('\n');
            contextTextParts.push(`[FALLBACK_RECENT_TURNS]\n${serialized}`);
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

    private extractHistorySummaryText(payload: Record<string, unknown>): string {
        const directSummary = typeof payload.summary === 'string' ? payload.summary.trim() : '';
        if (directSummary.length > 0) {
            return directSummary.slice(0, 500);
        }

        const textField = typeof payload.text === 'string' ? payload.text.trim() : '';
        if (textField.length > 0) {
            return textField.slice(0, 500);
        }

        const contentField = typeof payload.content === 'string' ? payload.content.trim() : '';
        if (contentField.length > 0) {
            return contentField.slice(0, 500);
        }

        return JSON.stringify(payload).slice(0, 500);
    }

    private extractHistoryMemoryKey(payload: Record<string, unknown>): string | undefined {
        const candidate = payload.memory_key ?? payload.memory_uid ?? payload.ram_key_id ?? payload.storage_key;
        return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : undefined;
    }

    private extractHistoryRefUid(payload: Record<string, unknown>): string | undefined {
        const candidate = payload.ref_uid ?? payload.reference_uid;
        return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : undefined;
    }

    private buildRuntimeFallbackSummary(
        text: string,
        blockType: SessionHistorySummary['block_type'],
    ): string {
        const trimmed = text.trim().replace(/\s+/g, ' ');
        if (!trimmed) {
            return blockType === 'history_summary_ai_prompt'
                ? 'Runtime fallback: user prompt summary unavailable.'
                : 'Runtime fallback: assistant response summary unavailable.';
        }

        const prefix = blockType === 'history_summary_ai_prompt'
            ? 'Runtime fallback prompt summary: '
            : 'Runtime fallback response summary: ';

        return `${prefix}${trimmed.slice(0, 280)}`;
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
                history_summaries: [...state.history_summaries],
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
