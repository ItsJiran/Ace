/**
 * ACE Workflows — versioned graph registry.
 *
 * Import the currently active workflow version here.
 * AgentInstance uses this as the single entry point.
 */
export { compileAceGraphV1 } from './ace_graph_v1/workflow';
export { compileAceGraphV2 } from './ace_graph_v2_simple/workflow';
export { compileAceGraphV3 } from './ace_graph_v3_simple/workflow';

// Active: v2 (stable)
export { compileAceGraphV2 as compileActiveGraph } from './ace_graph_v2_simple/workflow';
