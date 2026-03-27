/**
 * AIContextMemory Schema
 *
 * Unified memory envelope for all context pieces.
 * Each memory item tracks:
 * - Type (what kind of context)
 * - Status (lifecycle state for auto-filtering)
 * - Lifespan (TTL-based expiry)
 * - Content (payload)
 * - Metadata (for retrieval ranking)
 */

export type ContextMemoryType =
  | 'conversation_history'     // Past turn summaries
  | 'file_reference'           // File content + metadata
  | 'constraint'               // Rules/guardrails
  | 'decision'                 // Past decisions for consistency
  | 'tool_result'              // Tool execution output
  | 'user_intent'              // Inferred user goal
  | 'planning'                 // Grand plan + current plan
  | 'feedback'                 // Loop feedback (results, errors)
  | 'summary'                  // Prompt/response compact summaries
  | 'schema_hint'              // Tool/API schema reference
  | 'custom';                  // Package-specific

export type ContextMemoryStatus =
  | 'reserved'                 // Pre-allocated, not yet filled
  | 'in'                       // Active, include in prompt
  | 'out'                      // Inactive, exclude from prompt
  | 'expired'                  // TTL elapsed, pending eviction
  | 'archived';                // Moved to long-term storage

export type ContextMemoryPriority = 'critical' | 'high' | 'normal' | 'low';

/**
 * Full memory item stored in memory engine.
 *
 * Contains complete state: identity, content, metadata, lifecycle info, and retrieval metadata.
 * Used internally by AIContextMemoryEngine for storage and lifecycle management.
 * Every piece of context (file content, conversation history, tool results, plans, etc.)
 * is stored as a ContextMemoryItem with status-based filtering and TTL-based expiry.
 */
export interface ContextMemoryItem {
  // Identity
  uid: string;                 // Unique identifier (session:type:seq)
  type: ContextMemoryType;
  session_id: string;

  // Status & Lifecycle
  status: ContextMemoryStatus;
  priority: ContextMemoryPriority;
  created_at: number;          // Timestamp
  expires_at: number;          // When to mark as expired (TTL-based)
  accessed_at?: number;        // Last retrieval time

  // Content (inline, flexible shape per type)
  title: string;               // Human-readable label
  summary: string;             // Compact description for ranking
  payload: unknown;            // Actual content (can be object, array, string, etc.)
  payload_size: number;        // Bytes (for budget constraints)

  // Type-specific Metadata
  // Examples:
  // - history: { turn_number, message_role, token_count }
  // - file_reference: { file_path, line_range, file_size }
  // - tool_result: { tool_name, exec_time_ms, status }
  // - planning: { plan_type, milestone_count, current_step }
  metadata: Record<string, unknown>;

  // Retrieval & Ranking
  source: 'parser' | 'tool' | 'system' | 'user' | 'ai' | 'manual';
  source_ref?: string;         // e.g., tool name, file path
  retrieval_score?: number;    // Semantic relevance (0-1)
  tags: string[];              // For structured queries

  // Lifespan Policy
  auto_expire: boolean;        // Auto mark as expired on TTL
  summarize_before_drop?: boolean;  // Extract key insights before eviction
  reference_count: number;     // How many prompts used this
}

/**
 * Lightweight snapshot of a memory item for external exposure.
 *
 * Used when returning memory references to clients (AI, UI, gateway).
 * Only includes identity, summary, and metadata—NOT full payload.
 * This prevents large content from leaking into responses; AI/UI can request
 * full content separately if needed.
 * Typical use: injecting available_context_memories index in each turn.
 */
export interface ContextMemorySnapshot {
  uid: string;
  type: ContextMemoryType;
  title: string;
  summary: string;
  status: ContextMemoryStatus;
  priority: ContextMemoryPriority;
  payload_size: number;
  created_at: number;
  expires_at: number;
  accessed_at?: number;
  tags: string[];
}

/**
 * Configuration for building composed prompt context.
 *
 * Passed to AIContextMemoryEngine.buildContext() to control token budget and prompt assembly.
 * Inclusion/exclusion of individual items is controlled entirely by their lifecycle status —
 * set an item's status to 'in' to inject it, 'out' to suppress it. No type-based filtering
 * is applied here; callers manipulate lifecycle state instead.
 * Use case: gateway assembles context with a specific token budget, feeding it the already-built
 * legacy prompt so the memory engine can append its [CONTEXT_MEMORY] sections on top.
 */
export interface ContextBuildOptions {
  sessionId: string;
  prompt: string;
  model: string;
  sdk: string;
  token_budget?: number;       // Max tokens for context injection
}

/**
 * Result of a buildContext() call.
 *
 * Contains final composed prompt + metadata about what was included/excluded.
 * Used by gateway to prepare the full AI request with visibility into which
 * memories were used, their token estimates, and why others were dropped.
 * Enables observability: clients can see context assembly decisions and debug
 * if expected memories were trimmed or excluded.
 */
export interface ContextBuildResult {
  composed_prompt: string;
  used_memories: ContextMemorySnapshot[];
  total_token_estimate: number;
  dropped_memories: {
    uid: string;
    reason: 'expired' | 'budget' | 'priority' | 'excluded';
  }[];
}
