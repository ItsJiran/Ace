/**
 * Recovery Error Node — typed error recovery with switch/case.
 *
 * Error codes:
 *   PARSING_XML_ERROR     → route to thought (agent re-assesses and fixes XML)
 *   NETWORK_LLM_ERROR     → route to interrupt_gate (pauses graph with Continue button)
 *   API_KEY_NOT_RESOLVED  → route to __end__ (BREAK — user must configure API key)
 *   UNKNOWN / default     → route to thought (generic fallback)
 *
 * Interrupt flow (NETWORK_LLM_ERROR):
 *   recovery_error adds <interrupt> XML message → interrupt_gate
 *   → interrupt_gate calls interrupt() → graph pauses
 *   → client renders InterruptBlock with Continue button
 *   → user clicks Continue → ai.continueThreadPrompt → Command({ resume })
 *   → interrupt_gate resumes → thought
 *
 * Break flow (API_KEY_NOT_RESOLVED):
 *   recovery_error → __end__ (no interrupt, just break)
 *   user configures API key → starts new prompt
 */

import { AIMessage } from '@langchain/core/messages';
import { Command, getConfig } from '@langchain/langgraph';
import { emitNodeStart, emitNodeEnd } from '#/app-background/lib/utils/ai/emit-graph-event';
import { deserializeAgentError } from '#/shared/lib/agent-errors';
import type { AceAgentV3State } from '../../types';

// ── Interrupt payload type (shared with client block renderer) ─────────────

export interface RecoveryInterruptPayload {
    type: 'recovery_interrupt';
    code: string;
    /** Block tag for the UI renderer to pick the right component. */
    blockTag: string;
    message: string;
    node: string;
    actions: Array<{ id: string; label: string }>;
}

// ── Node ───────────────────────────────────────────────────────────────────

export function createRecoveryError() {
    return async function recoveryError(
        state: AceAgentV3State,
    ): Promise<Partial<AceAgentV3State> | Command> {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'recovery_error', 'ace-v3', state).catch(() => {});

        const err = deserializeAgentError(state.target_node_reason);

        let targetNode: string;
        let reason: string;

        switch (err.code) {

            // ── XML Parse Error: agent can fix the format ───────────────
            case 'PARSING_XML_ERROR':
                targetNode = 'thought';
                reason = [
                    `Continuing from "${err.node}". The previous XML output could not be parsed.`,
                    'Look at the last messages and current state, then re-assess what the user needs.',
                    'Produce properly formatted XML with <thought>, <action_type>, and <action_reason> tags.',
                    'Do NOT repeat the same malformed output — adjust your approach.',
                ].join(' ');
                break;

            // ── Network / LLM Error: route to interrupt_gate ────────────
            case 'NETWORK_LLM_ERROR': {
                targetNode = 'interrupt_gate';
                // Pass serialized error so interrupt_gate can build the payload
                reason = state.target_node_reason ?? JSON.stringify(err);
                break;
            }

            // ── API Key Not Resolved: BREAK — user must configure ───────
            case 'API_KEY_NOT_RESOLVED':
                targetNode = '__end__';
                reason = 'API key not configured. Set it in Settings → AI, then start a new prompt.';
                break;

            // ── Unknown / generic: route to thought ────────────────────
            default:
                targetNode = 'thought';
                reason = `Continuing from "${err.node}" after an unexpected error. Re-assess the current state and try a different approach.`;
                break;
        }

        // Build user-visible message
        let userMessage: string;
        let interruptXml: string | null = null;

        if (err.code === 'NETWORK_LLM_ERROR') {
            interruptXml = [
                '<interrupt>',
                JSON.stringify({
                    blockTag: 'network_interrupt_continue',
                    code: err.code,
                    message: err.message,
                    node: err.node,
                    actions: [{ id: 'continue', label: 'Continue' }],
                }),
                '</interrupt>',
            ].join('');
            userMessage = interruptXml;
        } else {
            userMessage = err.code === 'PARSING_XML_ERROR'
                ? `⚠️ Previous output was invalid. Re-assessing...`
                : err.code === 'API_KEY_NOT_RESOLVED'
                    ? `🔑 ${err.message}`
                    : `⚠️ Recovering from an error in "${err.node}". Re-assessing...`;
        }

        const output: Partial<AceAgentV3State> = {
            messages: [new AIMessage({ content: userMessage, name: 'ace-v3-recovery' })],
            target_node: targetNode,
            target_node_reason: reason,
            from_node: 'recovery_error',
        };

        if (threadUid)
            emitNodeEnd(threadUid, 'recovery_error', 'ace-v3', output, {
                error_code: err.code,
                error_node: err.node,
            }).catch(() => {});

        return output;
    };
}
