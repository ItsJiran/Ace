import type { BaseMessage } from '@langchain/core/messages';

// ── Thought Cycle ──────────────────────────────────────────────────────────

/**
 * A single thought → action cycle.
 *
 * Flow:
 *   START → thought → action_* → thought (loop) or END
 *
 * The thought node produces structured output { thought, action_type, action_reason }
 * and routes directly to the appropriate sub-action node — no intermediate nodes.
 *
 * Each cycle captures:
 *   - What was considered (subject) — can be the user prompt, a previous action result,
 *     a re-entry reason from target_node_reason, or any other trigger.
 *   - The agent's analysis + decision (thought) — "From X I observe Y, routing to action_speak because Z"
 *   - What action was chosen (action.thought) — same as thought, derived from structured output
 *   - Where to route (action.target.name) — action_speak | action_tool | action_context | action_mcp | end
 *   - Why that target (action.target.reason) — "Need to install a package"
 *
 * Subject examples:
 *   - User prompt:          "install express in my project"
 *   - Previous action msg:  "package.json found, no Express listed."
 *   - Re-entry reason:      "action_tool is unavailable — try another approach."
 *   - Stale cycle re-check: "User was greeted, but request is not yet complete."
 *
 * Example (simple greeting):
 *   subject:      "hello"
 *   thought:      "From 'hello' I observe a casual greeting. Route to action_speak because I should respond directly."
 *   action: {
 *     thought:    "From 'hello' I observe a casual greeting..."
 *     target:     { name: "action_speak", reason: "Greeting — respond directly." }
 *   }
 *
 * Example (complex task):
 *   subject:      "install express in my project"
 *   thought:      "From 'install express' I need to check package.json first. Route to action_context to read existing deps."
 *   action: {
 *     thought:    "From 'install express' I need to check package.json first..."
 *     target:     { name: "action_context", reason: "Need to inspect project structure first." }
 *   }
 */
export interface ThoughtCycle {
    /** What is being considered (user prompt, previous action result, etc.). */
    subject: string;
    /** Internal monologue: observation + assessment from thought node. */
    thought: string;
    /** Batched actions — run sequentially within this cycle. */
    actions: ThoughtAction[];
    /** Optional metadata (pointers, memory keys, etc.). */
    node_metadata?: Record<string, unknown>;
}

// ── Action (within a cycle) ────────────────────────────────────────────────

export interface ThoughtAction {
    /** What the agent intends to do with this specific action. */
    thought: string;
    /** Target node and reason. */
    target: { name: string; reason: string };
    /** Execution status — dispatcher manages this. */
    status: 'pending' | 'running' | 'done' | 'failed';
    /** Payload sent to the action sub-node (future: tool args, file paths, etc.). */
    payload?: Record<string, unknown>;
    /** Raw result returned by the action sub-node (future: stdout, file content, etc.). */
    result?: unknown;
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
