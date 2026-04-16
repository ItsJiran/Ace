/**
 * Prompt Builder Composer
 *
 * Summary:
 * - orchestrates all prompt sections into the final composed gateway prompt
 * - reads the current session snapshot from Kernel memory and renders sections in deterministic order
 *
 * Rendering Order:
 * - default identity and global constraints
 * - parser registry overview and hydrated details
 * - active context, working memory index, and expanded payloads
 * - historical prior-turn memory summary
 * - reserved storage section
 * - current state operating brief, current-turn retained memory, state plan, and pass-off prompt
 * - current input, only for initial user passes
 *
 * Control Hierarchy:
 * - highest priority: current state operating brief
 * - next priority: current-turn retained memory, current state plan, and passed-off prompt
 * - next priority: current input on initial passes only
 * - parser registry guidance constrains legal parser-block usage across the whole prompt
 * - evidence sections support decisions but must not override state-control guidance
 * - default prompt stays globally applicable as the baseline contract
 *
 * Built Prompt Output Map:
 * - `[DEFAULT CONTEXT]` + `[GENERAL CONSTRAINTS]`
 * - `[PARSER REGISTRY OVERVIEW]`
 * - `[REGISTERED PARSER BLOCK NAMES]`
 * - `[HYDRATED PARSER BLOCK DETAILS]` when parser details are available
 * - `[LIST ACTIVE CONTEXT RIGHT NOW]` when active context exists
 * - `[LIST WORKING MEMORY RIGHT NOW]` when working memory exists
 * - `[EXPANDED ACTIVE PAYLOADS]` for the top-priority working-memory payloads
 * - `[HISTORICAL TURN MEMORY]` when relevant prior-turn history exists
 * - storage section, currently empty placeholder
 * - `[CURRENT STATE]`
 * - `[CURRENT TURN RETAINED MEMORY]`
 * - `[LIST PLAN RIGHT NOW]`
 * - `[LIST PASSED OFF PROMPT]`
 * - `[CURRENT INPUT]` only for `user_prompt`
 *
 * ASCII Diagram:
 *
 *   session_uid + prompt + kind
 *             |
 *             v
 *   KernelEngine.readMemory(session)
 *             |
 *             v
 *      section builders
 *   /   /   /   |   \   \
 *  v   v   v    v    v   v
 * default parser memory history state input
 *             |
 *             v
 *       join into final prompt
 *
 * Decision Flow:
 *
 *   CURRENT STATE
 *        |
 *        v
 *   CURRENT TURN RETAINED MEMORY
 *        |
 *        v
 *   PLAN / PASSED OFF
 *        |
 *        v
 *   CURRENT INPUT
 *        |
 *        v
 *   PARSER RULES
 *        |
 *        v
 *   CONTEXT / MEMORY / HISTORY
 *
 * Output Shape:
 *
 *   buildPrompt()
 *      |
 *      v
 *   [DEFAULT CONTEXT]
 *   [GENERAL CONSTRAINTS]
 *   [PARSER REGISTRY OVERVIEW]
 *   [REGISTERED PARSER BLOCK NAMES]
 *   [HYDRATED PARSER BLOCK DETAILS]?
 *   [LIST ACTIVE CONTEXT RIGHT NOW]?
 *   [LIST WORKING MEMORY RIGHT NOW]?
 *   [EXPANDED ACTIVE PAYLOADS]?
 *   [HISTORICAL TURN MEMORY]?
 *   [CURRENT STATE]
 *   [CURRENT TURN RETAINED MEMORY]
 *   [LIST PLAN RIGHT NOW]
 *   [LIST PASSED OFF PROMPT]
 *   [CURRENT INPUT]?
 */

import { KernelEngine } from '#/services/kernelEngine';
import { buildDefaultPrompt } from './defaultSection';
import { composePromptSections } from './formatting';
import { buildCurrentTurnRetainedMemoryPrompt, buildHistoricalTurnMemoryPrompt } from './historySection';
import { buildBlockParserPrompt } from './parserRegistrySection';
import type { AIPromptKind } from './shared';
import { buildContextPrompt, buildExpandedWorkingMemoryPrompt, buildMemoryPrompt } from './memorySections';
import { buildCurrentPassOffPrompt, buildCurrentStateOperatingPrompt, buildCurrentStatePlanPrompt, buildPromptInputSection } from './stateSections';
import { buildStoragePrompt } from './storageSection';

export function buildPrompt(prompt: string, session_uid: string, promptKind: AIPromptKind = 'user_prompt'): string {
    const session = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`);

    const sections = [
        buildDefaultPrompt(),
        buildBlockParserPrompt(session),
        buildContextPrompt(session),
        buildMemoryPrompt(session),
        buildExpandedWorkingMemoryPrompt(session),
        buildHistoricalTurnMemoryPrompt(session),
        buildStoragePrompt(session),
        buildCurrentStateOperatingPrompt(session, prompt, promptKind),
        buildCurrentTurnRetainedMemoryPrompt(session),
        buildCurrentStatePlanPrompt(session, prompt, promptKind),
        buildCurrentPassOffPrompt(prompt, session, promptKind),
        buildPromptInputSection(prompt, promptKind),
    ];

    return composePromptSections(sections);
}