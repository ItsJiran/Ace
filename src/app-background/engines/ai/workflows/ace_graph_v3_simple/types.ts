import type { BaseMessage } from '@langchain/core/messages';

// ── Thought Cycle ──────────────────────────────────────────────────────────

/**
 * A single think → act → review cycle.
 *
 * Flow:
 *   START → thought → action → action_* → review → thought (loop) or END
 *
 * Each cycle captures:
 *   - What was considered (subject) — can be the user prompt, a previous review_result,
 *     a re-entry reason from target_node_reason, or any other trigger.
 *   - The agent's internal analysis (thought) — "From X I observe Y, this is simple/complex because Z"
 *   - What action was chosen (action.thought) — "Run: npm install express"
 *   - Where to route (action.target.name) — action_speak | action_tool | action_context | action_mcp | end
 *   - Why that target (action.target.reason) — "Need to install a package"
 *   - What happened (review_result) — filled by review node after action completes
 *
 * Subject examples:
 *   - User prompt:          "install express in my project"
 *   - Previous review:      "package.json found, no Express listed."
 *   - Re-entry reason:      "action_tool is unavailable — try another approach."
 *   - Stale cycle re-check: "User was greeted, but request is not yet complete."
 *
 * Example (simple greeting):
 *   subject:      "hello"
 *   thought:      "From 'hello' I observe a casual greeting. SIMPLE — no tools needed."
 *   action: {
 *     thought:    "Respond with a friendly greeting back."
 *     target:     { name: "action_speak", reason: "Greeting — respond directly." }
 *   }
 *   review_result: "User was greeted successfully."
 *
 * Example (complex task):
 *   subject:      "install express in my project"
 *   thought:      "From 'install express' I observe the user wants Express.js. COMPLEX — need to check package.json first, then run npm install."
 *   action: {
 *     thought:    "Read ./package.json to check existing dependencies."
 *     target:     { name: "action_context", reason: "Need to inspect project structure first." }
 *   }
 *   review_result: "package.json found, no Express listed."
 */
export interface ThoughtCycle {
    /** What is being considered (user prompt, previous review_result, etc.). */
    subject: string;
    /** Internal monologue: observation + assessment from thought node. */
    thought: string;
    /** The action decided by the agent (filled by action node after classification). */
    action: {
        /** What the agent intends to do — specific plan. */
        thought: string;
        /** Target node and reason. */
        target: { name: string; reason: string };
        /** Payload sent to the action sub-node (future: tool args, file paths, etc.). */
        payload?: Record<string, unknown>;
        /** Raw result returned by the action sub-node (future: stdout, file content, etc.). */
        result?: unknown;
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

    /** Internal routing — set by thought/action for conditional edges. */
    target_node?: string;
    /** Reason for target_node redirect. */
    target_node_reason?: string;
}
