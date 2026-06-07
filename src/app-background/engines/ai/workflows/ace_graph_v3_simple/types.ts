import type { BaseMessage } from '@langchain/core/messages';

// ── Thought Cycle ──────────────────────────────────────────────────────────

/** A single think → act → review cycle. */
export interface ThoughtCycle {
    /** What is being considered (user prompt, previous review_result, etc.). */
    subject: string;
    /** Internal monologue: agent's analysis of the subject. */
    thought: string;
    /** The action decided by the agent. */
    action: {
        /** What the agent intends to do. */
        thought: string;
        /** Target node and reason. */
        target: { name: string; reason: string };
    };
    /** Optional metadata (pointers, memory keys, etc.). */
    node_metadata?: Record<string, unknown>;
    /** Review summary — result of the action (populated by review node). */
    review_result?: string;
}

// ── State ──────────────────────────────────────────────────────────────────

export interface AceAgentV3State {
    messages: BaseMessage[];
    original_prompt: string;

    /** Full history of think → act → review cycles. */
    cycles: ThoughtCycle[];
    /** Currently active cycle. */
    current_cycle?: ThoughtCycle;

    /** Global cycle counter for gatekeeping. */
    global_cycle: number;

    /** Which node produced this state (for tracing). */
    from_node?: string;

    /** Set by stopThreadPrompt — nodes check this to exit gracefully. */
    is_stopped?: boolean;

    /** Internal routing — set by thought/action for conditional edges. */
    target_node?: string;
    /** Reason for target_node redirect. */
    target_node_reason?: string;

    /** Latest node result. */
    result_summary: string;
}
