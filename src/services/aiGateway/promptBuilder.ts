// This file is responsible for building prompts for the AI Gateway service. 
// It provides functions to construct prompts based on user input and system requirements.

import type { AISession, AIPlanEntry } from "#/schemas/ai";
import { KernelEngine } from "../kernelEngine";
import { RegistryEngine } from "../registryEngine";

export type AIPromptKind = 'user_prompt' | 'autonomous_follow_up';

// It also manages context lifecycle and memory for the AI sessions, ensuring that relevant information 
// is retained across interactions. 

export function buildPrompt(prompt: string, session_uid: string, promptKind: AIPromptKind = 'user_prompt'): string {

    // Read the current session state from memory using the session UID. 
    // This allows us to access any relevant information
    const session = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`);

    // Loaded parser
    let loaded_default_prompt = buildDefaultPrompt();
    let loaded_parser_prompt = buildBlockParserPrompt(session);
    let loaded_context_prompt = buildContextPrompt(session);
    let loaded_memory_prompt = buildMemoryPrompt(session);
    let loaded_expanded_memory_prompt = buildExpandedWorkingMemoryPrompt(session);
    let loaded_history_prompt = buildHistoryPrompt(session);
    let loaded_current_state_prompt = buildCurrentStateOperatingPrompt(session, prompt, promptKind);
    let loaded_plan_prompt = buildCurrentStatePlanPrompt(session, prompt, promptKind);
    let loaded_current_pass_off_prompt = buildCurrentPassOffPrompt(prompt, session, promptKind);
    let loaded_storage_prompt = buildStoragePrompt(session);

    return `
        ${loaded_default_prompt}
        ${loaded_parser_prompt}
        ${loaded_context_prompt}
        ${loaded_memory_prompt}
        ${loaded_expanded_memory_prompt}
        ${loaded_history_prompt}
        ${loaded_storage_prompt}
        ${loaded_current_state_prompt}
        ${loaded_plan_prompt}
        ${loaded_current_pass_off_prompt}
        ${buildPromptInputSection(prompt, promptKind)}
    `;
}

function buildPromptInputSection(prompt: string, promptKind: AIPromptKind = 'user_prompt'): string {
    if (promptKind === 'autonomous_follow_up') {
        return '';
    }

    return `[CURRENT INPUT]
    ${prompt}`;
}

export function buildCurrentPassOffPrompt(prompt: string, session: AISession, promptKind: AIPromptKind): string {
    if (promptKind === 'autonomous_follow_up') {
        const currentStatePlan = getCurrentStatePlanEntries(session);
        const hasPlan = currentStatePlan.length > 0;

        return `[LIST PASSED OFF PROMPT]
        This is the passed-off prompt from the previous response in the same turn.
        - First, analyze whether the previous result already matches what is required in state ${session.state}.
        - Determine whether this passed-off prompt means the plan for state ${session.state} can continue, needs revision, or has a step that can now be marked complete.
        - Do not use this passed-off prompt to jump state. Use it to validate the current state and the state plan shown above.
        - ${hasPlan
            ? `After evaluating the passed-off prompt, return to the plan for state ${session.state} and continue the next incomplete step.`
            : `If the evaluation shows that state ${session.state} still has no plan, create the plan for this state first with the planning block.`}
        ${prompt}`;
    }

    return `[LIST PASSED OFF PROMPT]
    This section is reserved for passed-off prompts from a previous pass.
    - There is no passed-off prompt yet because this is still the initial user pass.
    - Stay focused on the current state and the active plan for that state.`;
}

export function buildDefaultPrompt(): string {
    return [
        buildAssistantIdentityPrompt(),
        buildGeneralConstraintsPrompt(),
    ].filter(Boolean).join('\n\n');
}

function buildAssistantIdentityPrompt(): string {
    return `[DEFAULT CONTEXT] You are ACE Assistant. Follow the system guidance, stay aligned with the current session state, and produce the next valid response for the runtime.`;
}

function buildGeneralConstraintsPrompt(): string {
    return `[GENERAL CONSTRAINTS]
    - Always reason from the current session state.
    - Do not assume missing user intent when clarification is required.
    - Prefer the most relevant information from session history, active context, and working memory.
    - Keep the response concise, clear, and operational.
    - Use parser blocks for system actions. Use visible prose only for user-facing explanation.`.trim();
}

export function buildCurrentStateOperatingPrompt(session: AISession, prompt: string, promptKind: AIPromptKind): string {
    const currentStatePlan = getCurrentStatePlanEntries(session);
    const latestCompletedEntry = getLatestCompletedAssistantEntry(session);
    const nextAllowedStates = getAllowedNextStates(session.state);
    const hasPassedOffPrompt = promptKind === 'autonomous_follow_up' && prompt.trim() !== '';

    const lines: string[] = ['[CURRENT STATE]'];
    lines.push('- This is the main navigator for the current pass.');
    lines.push(promptKind === 'autonomous_follow_up'
        ? '- This is a continuation pass inside the same user turn.'
        : '- This is the first pass for a new user turn.');
    lines.push(`- The current active state is ${session.state}.`);
    lines.push(`- In state ${session.state}, your focus is ${describeStateFocus(session.state)}.`);
    lines.push(`- In state ${session.state}, you must finish this state's objective before moving to another state.`);
    lines.push(`- Planning in state ${session.state} must stay within this scope: ${describeStatePlanningScope(session.state)}.`);

    if (latestCompletedEntry) {
        lines.push(`- Latest completed result in this turn: ${clipForPrompt(latestCompletedEntry.response)}`);
    } else {
        lines.push('- Latest completed result in this turn: none yet.');
    }

    if (currentStatePlan.length === 0) {
        lines.push(`- If there is no plan yet for state ${session.state}, you must create that plan first with the planning block before any other work can be considered complete.`);
    } else {
        const completedSteps = currentStatePlan.filter((entry) => entry.is_complete).length;
        lines.push(`- Current plan progress for state ${session.state}: ${completedSteps}/${currentStatePlan.length} steps complete.`);
        if (currentStatePlan.every((entry) => entry.is_complete)) {
            lines.push(`- All plan steps for state ${session.state} are already complete.`);
        } else if (hasPassedOffPrompt) {
            lines.push('- There is a passed-off prompt below. Evaluate its impact on this state result and on plan progress before continuing the next plan step.');
        } else {
            lines.push('- There is no passed-off prompt. Continue the checklist for this state until it is complete.');
        }
    }

    if (currentStatePlan.length > 0 && currentStatePlan.every((entry) => entry.is_complete)) {
        lines.push(`- If the state result is already correct and the plan is fully complete, you may move only to the following states: ${nextAllowedStates.join(' | ')}.`);
    } else {
        lines.push(`- Do not change state yet. Stay in ${session.state} until passed-off evaluation is done and this state's plan is complete.`);
    }

    return lines.join('\n');
}

export function buildBlockParserPrompt(session: AISession): string {

    const allBlocks = RegistryEngine.listParserBlockSummaries();
    if (allBlocks.length === 0) return '';

    // Determine which slugs need full detail:
    // - Parsers with is_default_detail === true (always on)
    // - Parsers currently in session.active_parser_blocks
    const activeBlockSlugs = new Set(
        (session.active_parser_blocks ?? []).map(b => b.block_slug)
    );
    const fullDetailSlugs = new Set(
        allBlocks
            .filter(b => b.is_default_detail || activeBlockSlugs.has(b.slug))
            .map(b => b.slug)
    );

    const registeredNames = [...allBlocks].map((block) => block.slug).sort((a, b) => a.localeCompare(b));
    const lines: string[] = [];

    lines.push('[PARSER REGISTRY OVERVIEW]');
    lines.push('A block is a structured response region wrapped by @@ace:start and @@ace:end. It is parsed by the runtime and is not ordinary visible prose.');
    lines.push('A parser is the runtime handler that owns a block slug. It reads the block payload, performs the corresponding system behavior, and returns control back into the interaction loop.');
    lines.push('Use parser blocks for system actions. Use visible prose blocks such as paragraph only for user-facing explanation.');
    lines.push('Block syntax: @@ace:start block_slug\\n...payload...\\n@@ace:end');
    lines.push('The @@ace:start line must be followed by a line break before the payload starts.');
    lines.push('@@ace:start and @@ace:end are only treated as parser markers when they appear at the beginning of a line.');
    lines.push('If @@ace:start is followed by a block name that is not registered, it is treated as visible text instead of a real parser block.');
    lines.push('Registered parser block names below represent the full registry, not the subset of block details currently hydrated into this prompt.');
    lines.push('Strict rule: whenever you need to know, inspect, verify, discover, list, or ask about parser blocks, always use the parser_registry block instead of answering from memory or from the hydrated subset shown in this prompt.');
    lines.push('Strict rule: never treat the hydrated block-detail subset as the full parser registry. Hydrated details are only the currently injected working subset.');
    lines.push('If the user asks to list parser blocks, available blocks, all blocks, what blocks exist, or what blocks can be used, you must use parser_registry with action "list_names".');
    lines.push('If the user asks which block details are currently injected into the prompt, you must use parser_registry with action "list_hydrated".');
    lines.push('If you only know a block name but need its schema, payload shape, or usage rules, you must use parser_registry with action "detail".');
    lines.push('Do not answer parser-registry discovery questions by reading the hydrated detail section below and paraphrasing it as if it were the full registry.');
    lines.push('Global rule: do not nest parser blocks inside other parser blocks unless a block explicitly documents that nested usage is allowed.');
    lines.push('Treat paragraph content as plain visible prose only. Do not place other parser blocks inside paragraph unless a block explicitly supports nested behavior.');
    lines.push('Detailed operational rules for default blocks such as context, summarize_prompt, or state_transition live in their hydrated block detail sections below, not in the global prompt.');

    lines.push('');
    lines.push('[REGISTERED PARSER BLOCK NAMES]');
    registeredNames.forEach((name) => lines.push(`- ${name}`));

    if (fullDetailSlugs.size > 0) {
        lines.push('');
        lines.push('[HYDRATED PARSER BLOCK DETAILS]');
        lines.push('Only the blocks below have full details injected into this prompt right now. This is a working subset, not the full registry.');

        for (const slug of fullDetailSlugs) {
            const detail = RegistryEngine.renderParserBlockDetail(slug);
            if (detail) {
                lines.push('');
                lines.push(detail);
            }
        }
    }

    return lines.join('\n');
}

export function buildContextPrompt(session: AISession): string {

    const windowEntries = getActiveContextEntries(session);

    if (windowEntries.length === 0) return '';

    const lines: string[] = ['[LIST ACTIVE CONTEXT RIGHT NOW]'];
    lines.push('This is supporting evidence only, not the main control surface for the pass.');
    lines.push('Use this list only when you need factual support for the current state, current plan, or passed-off evaluation.');
    lines.push('Do not let this section override the deterministic guidance in CURRENT STATE, PLAN, or PASSED OFF PROMPT.');

    for (const entry of windowEntries) {
        const turnRef = entry.lifecycle_turn !== undefined ? ` (turn: ${entry.lifecycle_turn})` : '';
        const content = entry.content?.trim();
        lines.push(`- [${entry.title}]${turnRef}: ${content || '(no content)'}`);

        if (entry.payload && Object.keys(entry.payload).length > 0) {
            lines.push(`  Payload keys: ${Object.keys(entry.payload).join(', ')}`);
        }
    }

    return lines.join('\n');
}

export function buildCurrentStatePlanPrompt(session: AISession, prompt: string, promptKind: AIPromptKind): string {
    const currentStatePlan = getCurrentStatePlanEntries(session);
    const hasPassedOffPrompt = promptKind === 'autonomous_follow_up' && prompt.trim() !== '';
    const lines: string[] = ['[LIST PLAN RIGHT NOW]'];
    lines.push('This is the deterministic checklist for the currently active state.');
    lines.push(`This plan is the checklist for state ${session.state} in the active turn.`);
    lines.push(`- The focus of this section is to make sure you know whether this state already has a plan and which steps are still incomplete.`);
    lines.push(`- Planning scope for state ${session.state}: ${describeStatePlanningScope(session.state)}.`);
    lines.push(`- Only the current state's plan is authoritative right now.`);
    lines.push(`- If you re-enter state ${session.state} and its current-turn plan is still valid, reuse it. If it is obsolete, reset only the plan for state ${session.state} and rebuild it.`);

    if (currentStatePlan.length === 0) {
        lines.push(`- IMPORTANT: there is no plan yet for state ${session.state}. Create it first with the planning block.`);
        if (hasPassedOffPrompt) {
            lines.push(`- You should still evaluate the passed-off prompt to understand the latest result, but do not consider this state complete before the plan for state ${session.state} exists.`);
        }
        return lines.join('\n');
    }

    const completedCount = currentStatePlan.filter((entry) => entry.is_complete).length;
    if (hasPassedOffPrompt) {
        lines.push(`- If there is a passed-off prompt, evaluate it first to determine whether this plan needs correction, can continue, or has a step that can be marked complete.`);
    } else {
        lines.push(`- Because there is no passed-off prompt, your main focus is to execute the next plan step.`);
    }
    lines.push(`- Completion: ${completedCount}/${currentStatePlan.length} steps complete.`);

    for (const entry of currentStatePlan) {
        const statusMark = entry.is_complete ? '[x]' : '[ ]';
        const stepLabel = typeof entry.step_index === 'number' ? `Step ${entry.step_index + 1}` : 'Step';
        lines.push(`- ${statusMark} ${stepLabel}: ${entry.title}`);
        if (entry.detail) {
            lines.push(`  ${entry.detail}`);
        }
    }

    return lines.join('\n');
}

export function buildMemoryPrompt(session: AISession): string {
    const prioritizedEntries = getPrioritizedWorkingMemoryEntries(session);
    if (prioritizedEntries.length === 0) return '';

    const expandedIds = new Set(prioritizedEntries.slice(0, 3).map((entry) => entry.uid));
    const lines: string[] = ['[LIST WORKING MEMORY RIGHT NOW]'];
    lines.push('This is the current working memory.');
    lines.push('Use this list to see the working payloads available for the current pass.');

    for (const entry of prioritizedEntries) {
        const turnRef = entry.lifecycle_turn !== undefined ? `turn ${entry.lifecycle_turn}` : 'turn unknown';
        const expandedLabel = expandedIds.has(entry.uid) ? ' (expanded below)' : '';
        lines.push(`- ${entry.uid}${expandedLabel}: ${entry.description} [${turnRef}]`);
    }

    return lines.join('\n');
}

export function buildExpandedWorkingMemoryPrompt(session: AISession): string {
    const expandedEntries = getPrioritizedWorkingMemoryEntries(session).slice(0, 3);
    if (expandedEntries.length === 0) return '';

    const lines: string[] = ['[EXPANDED ACTIVE PAYLOADS]'];
    lines.push('These are the highest-priority raw payloads for the current pass. Do not dig through lower-priority memory unless these are insufficient.');

    for (const entry of expandedEntries) {
        lines.push('');
        lines.push(`--- ID: ${entry.uid} ---`);
        lines.push(`Description: ${entry.description}`);
        if (entry.lifecycle_turn !== undefined) {
            lines.push(`Added at turn: ${entry.lifecycle_turn}`);
        }
        lines.push(`Content:\n${entry.content}`);
        lines.push('-----------------------');
    }

    return lines.join('\n');
}

export function buildHistoryPrompt(session: AISession): string {

    if (!session.turns || session.turns.length === 0) return '';

    // Window: from history_start_index up to and including the current active turn.
    // For autonomous follow-up passes, the current turn may already contain completed entries
    // that the model must see so it can understand what already happened in this same user turn.
    // Only completed/success assistant entries are replayed below, so the active streaming entry
    // does not leak back into the prompt.
    const start = session.history_start_index ?? 0;
    const endExclusive = Math.min(session.turn_index + 1, session.turns.length);

    if (endExclusive <= start) return '';

    const historyTurns = session.turns.slice(start, endExclusive);
    if (historyTurns.length === 0) return '';

    const lines: string[] = ['[LIST TURN MEMORY RIGHT NOW]'];
    lines.push('This is the turn memory currently available.');
    lines.push('Use this summary to understand the progress that already happened in the active turn and earlier turns.');

    historyTurns.forEach((turn, idx) => {
        const turnIndex = start + idx;
        const turnNumber = turnIndex + 1;
        const historyEntry = session.history?.[turnIndex];
        const eventSummaries = Array.isArray(historyEntry?.responses)
            ? historyEntry.responses
                .slice()
                .sort((left, right) => left.index - right.index)
                .map((event) => event.summary?.trim() ?? '')
                .filter(Boolean)
            : [];
        const userPrompt = turn.entries?.[0]?.prompt?.trim();
        const promptSummary = historyEntry?.prompt?.trim();
        if (promptSummary) {
            lines.push(`[TURN ${turnNumber}] User Summary: ${promptSummary}`);
        } else if (userPrompt) {
            lines.push(`[TURN ${turnNumber}] User: ${userPrompt}`);
        }

        if (eventSummaries.length > 0) {
            lines.push(`[TURN ${turnNumber}] Assistant Summary: ${eventSummaries.join(' ')}`);
        }
    });

    return lines.join('\n');
}

export function buildStoragePrompt(_session: AISession): string {
    // This function can be used to build a prompt that includes information about the storage state of the session. 
    // This could include any files that have been uploaded, any data that has been stored, or any other relevant 
    // information about the session's storage. The implementation would involve retrieving this information and 
    // formatting it into a prompt that can be sent to the model.


    return '';
}

function getActiveContextEntries(session: AISession) {
    if (!session.context || session.context.length === 0) return [];

    const start = session.context_start_index ?? 0;
    const end = session.context_end_index ?? session.context.length - 1;

    return session.context
        .slice(start, end + 1)
        .filter(entry => entry.status === 'active');
}

function getPrioritizedWorkingMemoryEntries(session: AISession) {
    return [...(session.working_memory ?? [])].sort((left, right) => {
        const leftTurn = left.lifecycle_turn ?? -1;
        const rightTurn = right.lifecycle_turn ?? -1;

        if (leftTurn !== rightTurn) return rightTurn - leftTurn;
        return right.created_at - left.created_at;
    });
}

function getCurrentStatePlanEntries(session: AISession): AIPlanEntry[] {
    return [...(session.plan ?? [])]
        .filter((entry) => entry.state === session.state)
        .filter((entry) => entry.lifecycle_turn === undefined || entry.lifecycle_turn === session.turn_index)
        .sort((left, right) => (left.step_index ?? Number.MAX_SAFE_INTEGER) - (right.step_index ?? Number.MAX_SAFE_INTEGER));
}

function describeStateFocus(state: AISession['state']): string {
    if (state === 'Reason') return 'identify what matters, resolve ambiguity, and decide the correct next move';
    if (state === 'Plan') return 'standalone Plan state is reserved; use planning to define the current state checklist';
    if (state === 'Act') return 'execute the exact next planned action only';
    if (state === 'Observe') return 'inspect and interpret the latest result against the active context';
    if (state === 'Reflect') return 'evaluate whether the previous flow was correct, sufficient, or needs correction';
    if (state === 'Finalize') return 'package the final validated result back to the user';

    return 'continue from the latest validated state';
}

function describeStatePlanningScope(state: AISession['state']): string {
    if (state === 'Reason') {
        return 'decide what should happen next, check whether an existing parser block is capable, decide whether autonomous looping is justified, decide whether clarification is needed, and decide whether the task can return directly';
    }

    if (state === 'Plan') {
        return 'standalone Plan state is reserved; only use planning here to define or refine the checklist for the active state';
    }

    if (state === 'Act') {
        return 'execute the selected action only, including which parser block to call or which direct operation to perform; do not use this plan to analyze or validate outcomes';
    }

    if (state === 'Observe') {
        return 'inspect the latest result, decide whether it satisfies the state objective, decide whether plan steps can be marked complete, and decide whether replanning is needed';
    }

    if (state === 'Reflect') {
        return 'evaluate whether the overall flow was correct, whether corrections are needed, and whether the current approach should be revised before continuing';
    }

    if (state === 'Finalize') {
        return 'package and deliver the validated result only; do not introduce new execution work unless the final output is blocked by a missing required result';
    }

    return 'stay aligned with the active state objective only';
}

function getAllowedNextStates(state: AISession['state']): string[] {
    if (state === 'Reason') return ['Act', 'Finalize'];
    if (state === 'Plan') return ['Reason', 'Act', 'Finalize'];
    if (state === 'Act') return ['Observe', 'Finalize'];
    if (state === 'Observe') return ['Reason', 'Reflect', 'Finalize'];
    if (state === 'Reflect') return ['Reason', 'Finalize'];
    if (state === 'Finalize') return ['Finalize'];

    return [];
}

function getLatestCompletedAssistantEntry(session: AISession) {
    for (let turnIndex = Math.min(session.turn_index, session.turns.length - 1); turnIndex >= 0; turnIndex -= 1) {
        const turn = session.turns[turnIndex];
        if (!turn) continue;

        for (let entryIndex = turn.entries.length - 1; entryIndex >= 0; entryIndex -= 1) {
            const entry = turn.entries[entryIndex];
            if (entry?.status === 'completed' || entry?.status === 'success') {
                if (entry.response?.trim()) return entry;
            }
        }
    }

    return undefined;
}

function clipForPrompt(value: string, maxLength: number = 280): string {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, maxLength - 3)}...`;
}