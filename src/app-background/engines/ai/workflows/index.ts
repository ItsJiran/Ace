/**
 * ACE Workflows — versioned graph registry.
 *
 * Import the currently active workflow version here.
 * AgentInstance uses this as the single entry point.
 */
export { compileAceGraphV3 } from './ace_graph_v3_simple/workflow';

// Active: v3
export { compileAceGraphV3 as compileActiveGraph } from './ace_graph_v3_simple/workflow';

// ── State type (complete, for type-safe consumption) ──────────────
import type { AceAgentV3State, ThoughtCycle, MemoryItem, ContextItemFile, ContextItemDirectory, ContextItemTool, ContextItem } from './ace_graph_v3_simple/types';
export type { ThoughtCycle, MemoryItem, ContextItemFile, ContextItemDirectory, ContextItemTool, ContextItem };

/**
 * AceWorkflowState — alias for the active workflow's state type.
 * Use this instead of Record<string, unknown> for type-safe state access.
 */
export type AceWorkflowState = AceAgentV3State;
