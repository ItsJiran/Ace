// This file is responsible for building prompts for the AI Gateway service. 
// It provides functions to construct prompts based on user input and system requirements.

import type { AISession } from "#/schemas/ai";
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
    let loaded_constraints_prompt = buildConstraintsStatePrommpt(session);
    let loaded_parser_prompt = buildBlockParserPrompt(session);
    let loaded_context_prompt = buildContextPrompt(session);
    let loaded_memory_prompt = buildMemoryPrompt(session);
    let loaded_storage_prompt = buildStoragePrompt(session);
    let loaded_history_prompt = buildHistoryPrompt(session);

    return `
        ${loaded_default_prompt}
        ${loaded_constraints_prompt}
        ${loaded_parser_prompt}
        ${loaded_context_prompt}
        ${loaded_memory_prompt}
        ${loaded_storage_prompt}
        ${loaded_history_prompt}
        ${buildPromptInputSection(prompt, promptKind)}
    `;
}

function buildPromptInputSection(prompt: string, promptKind: AIPromptKind): string {
    if (promptKind === 'autonomous_follow_up') {
        return `[AUTONOMOUS FOLLOW-UP PROMPT]
        ${prompt}`;
    }

    return `[ORIGINAL USER PROMPT]
    ${prompt}`;
}

export function buildDefaultPrompt(): string {
    return [
        buildAssistantIdentityPrompt(),
        buildGeneralConstraintsPrompt(),
        buildStateMachinePrompt(),
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

function buildStateMachinePrompt(): string {
    return `[STATE MACHINE]
    - The session has an operational state. The current state tells you what this response should focus on.
    - When you decide the next operational phase explicitly, use the state_transition block to update the session state.
    - The state machine is the main semantic control plane for the autonomous loop. Do not use a separate protocol block.
    - State transition is constrained, not free-form. Use only valid next states.
    - For the current MVP, do not transition into Plan. Treat Plan as reserved and inactive for now.
    - Preferred transition graph for this MVP:
        Reason -> Act | Finalize
        Act -> Observe
        Observe -> Reason | Reflect | Finalize
        Reflect -> Reason | Finalize
        Finalize -> Finalize
    - Use Reason when understanding intent, selecting the next move, or deciding what information is still missing.
    - Use Act when executing a concrete action or emitting the next external/runtime operation.
    - Use Observe when analyzing fresh results that arrived after an action.
    - Use Reflect when evaluating whether the previous action or observation changed the plan or exposed an error.
    - Use Finalize when the task is ready to be packaged back to the user.
    - Normal completion behavior follows the session state: Finalize ends the turn and returns control to the user; non-Finalize states continue the autonomous loop.
    - Parser stop states still exist as technical runtime overrides: stop_current_response ends now, and stop_and_continue_loop ends now then immediately starts the next pass.`.trim();
}

export function buildConstraintsStatePrommpt(session: AISession): string {
    // This function can be used to build a prompt that includes constraints based on the current state of the session.
    // It can retrieve information about the session's state, plan, context, and other relevant data to ensure that
    // the model's response adheres to the specified constraints. The implementation would involve querying the session
    // state and formatting it into a prompt that can be sent to the model.
    if (session.state == 'Reason')
        return `[REASON MODE] You are currently in Reasoning mode, your response should be focused on understanding the user's intent, \
        gathering relevant information, and preparing for the next steps. Avoid taking any concrete actions or making assumptions 
        about the user's needs at this stage. Instead, ask clarifying questions, identify potential tools or resources that may be needed, 
        and consider any relevant context that could inform your reasoning process.`.trim();

    if (session.state == 'Plan')
        return `[PLAN MODE] Planning mode is currently reserved and should generally not be used in this MVP. Prefer Reason for choosing the next move and Act for executing it.`.trim();

    if (session.state == 'Act')
        return `[ACT MODE] You are currently in Acting mode, your response should be focused on executing a concrete next step. 
        This can include emitting the correct parser block, triggering a runtime action, or preparing the exact operational output for the next system step. 
        Avoid broad re-analysis here unless the action is blocked or invalid.`.trim();

    if (session.state == 'Observe')
        return `[OBSERVE MODE] You are currently in Observing mode, your response should be focused on analyzing new information that has been generated after taking an action. 
        This can include the results of a tool call, the user's response to a question, or any other new information that has come to light. 
        Your analysis should consider how this new information impacts the overall session, including whether the original plan is still valid or if it needs to be updated based on the new context.`.trim();

    if (session.state == 'Reflect')
        return `[REFLECT MODE] You are currently in Reflecting mode, your response should be focused on evaluating the effectiveness of your actions and considering any adjustments needed for future interactions. 
        This can include self-critique of your previous steps, identifying any errors or areas for improvement, and thinking about how to better meet the user's needs in subsequent interactions. 
        Your reflection should be honest, insightful, and aimed at continuous improvement throughout the session.`.trim();

    if (session.state == 'Finalize')
        return `[FINALIZE MODE] You are currently in Finalizing mode, your response should be focused on packaging the result for the user. 
        This can include formatting the response in a clear and user-friendly way, ensuring that all necessary information is included, and preparing the final output for delivery to the user. 
        Your goal in this phase is to provide a complete and polished response that effectively addresses the user's needs and concludes the current interaction.`.trim();

    return '';
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

    if (!session.context || session.context.length === 0) return '';

    // Window: context_start_index → context_end_index (inclusive), same pattern as history.
    const start = session.context_start_index ?? 0;
    const end = session.context_end_index ?? session.context.length - 1;

    const windowEntries = session.context
        .slice(start, end + 1)
        .filter(entry => entry.status === 'active');

    if (windowEntries.length === 0) return '';

    const lines: string[] = ['[ACTIVE CONTEXT]'];
    lines.push('This is lightweight reasoning state that should survive across autonomous steps, such as user intent, plan decisions, observed results, and important constraints.');
    lines.push('Use this section as short chaining knowledge, not as storage for large raw payloads.');

    for (const entry of windowEntries) {
        // Header: title + optional turn reference
        const turnRef = entry.lifecycle_turn !== undefined ? ` (turn: ${entry.lifecycle_turn})` : '';
        lines.push(`- [${entry.title}]${turnRef}`);

        if (entry.content) {
            lines.push(`  ${entry.content}`);
        }

        // Payload: any tool result, file content, or arbitrary data
        if (entry.payload && Object.keys(entry.payload).length > 0) {
            const payloadStr = JSON.stringify(entry.payload, null, 2)
                .split('\n')
                .map(l => `  ${l}`)
                .join('\n');
            lines.push(payloadStr);
        }
    }

    return lines.join('\n');
}

export function buildMemoryPrompt(session: AISession): string {
    if (!session.working_memory || session.working_memory.length === 0) return '';

    const lines: string[] = ['[WORKING MEMORY (WORKBENCH)]'];
    lines.push('This is the place for large raw runtime payloads, such as search results, files, tool outputs, or registry details, without polluting visible prose or context.');
    lines.push('Use working memory when you need to inspect or reference a payload later. Remove items you no longer need to control token usage.');

    for (const entry of session.working_memory) {
        lines.push('');
        lines.push(`--- ID: ${entry.uid} ---`);
        lines.push(`Description: ${entry.description}`);
        if (entry.lifecycle_turn !== undefined) {
             lines.push(`Added at turn: ${entry.lifecycle_turn}`);
        }
        lines.push(`Content:\n${entry.content}`);
        lines.push(`-----------------------`);
    }

    return lines.join('\n');
}

export function buildHistoryPrompt(session: AISession): string {

    if (!session.turns || session.turns.length === 0) return '';

    // Window: from history_start_index up to (but NOT including) the current active turn.
    // The active turn is the one currently being processed — it must not appear in history.
    const start = session.history_start_index ?? 0;
    const end = session.turn_index; // exclusive

    if (end <= start) return '';

    const historyTurns = session.turns.slice(start, end);
    if (historyTurns.length === 0) return '';

    const lines: string[] = ['[CONVERSATION HISTORY]'];
    lines.push('This section is turn-level memory for older conversation steps. Prefer these compact summaries over reconstructing meaning from raw historical block output.');
    lines.push('Prompt summaries may be written deliberately by the AI through summarize_prompt. Response summaries may also be written manually by parser blocks so future turns remember outcomes without replaying raw blocks.');

    historyTurns.forEach((turn, idx) => {
        const turnIndex = start + idx;
        const turnNumber = turnIndex + 1;
        const historyEntry = session.history?.[turnIndex];
        const userPrompt = turn.entries?.[0]?.prompt?.trim();
        const promptSummary = historyEntry?.prompt?.trim();
        if (promptSummary) {
            lines.push(`[TURN ${turnNumber}] User Summary: ${promptSummary}`);
        } else if (userPrompt) {
            lines.push(`[TURN ${turnNumber}] User: ${userPrompt}`);
        }

        const assistantResponse = turn.entries
            ?.filter(e => e.status === 'completed' || e.status === 'success')
            .map(e => e.response?.trim() ?? '')
            .filter(Boolean)
            .join('\n');

        const responseSummary = historyEntry?.response?.trim();
        if (responseSummary) {
            lines.push(`[TURN ${turnNumber}] Assistant Summary: ${responseSummary}`);
        } else if (assistantResponse) {
            lines.push(`[TURN ${turnNumber}] Assistant: ${assistantResponse}`);
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