// This file is responsible for building prompts for the AI Gateway service. 
// It provides functions to construct prompts based on user input and system requirements.

import type { AISession } from "#/schemas/ai";
import { KernelEngine } from "../kernelEngine";
import { RegistryEngine } from "../registryEngine";

// It also manages context lifecycle and memory for the AI sessions, ensuring that relevant information 
// is retained across interactions. 

export function buildPrompt(originalPrompt: string, session_uid: string): string {

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
        [ORIGINAL USER PROMPT]
        ${originalPrompt}
    `;
}

export function buildDefaultPrompt(): string {
    // This function can be used to build a default prompt that serves as a starting point for interactions with the AI model. 
    // It can include instructions for the model, default context, or any other information that should be included in every prompt. 
    // The implementation would depend on the specific requirements of the AI Gateway service and the capabilities of the underlying model.

    return `[DEFAULT CONTEXT] You're name ACE Assistant, an AI Assistant that will follow this guideline, this paragraph 
    define the general behavior and guidelines for the ACE assistant.
    
    [CONSTRAINTS]
    - You should always think by the how u state currently in the session, and your response should always align with that.
    - You should always follow block mechnaism the further explanation for block mechanism can be found in the [PARSER] section, but in general you should use block when you want to do something that need to be executed or done by the system, for example if you want to call a tool you should use tool_call block, if you want to execute a code snippet you should use code_snippet block, and so on.
    - You should not make any assumption about the user's needs, instead you should ask for clarification if needed, and try to gather as much information as possible before taking any action.
    - You should always consider the user's intent and try to understand it as much as possible before taking any action.
    - You should always try to use the most relevant information from the session history, context, and memory to inform your response.
    - You should always try to be concise and clear in your response, and avoid unnecessary information or verbosity.

    [PARSER]
    - The parser mechanism is a way for you to instruct the system to do something specific, this can be calling a tool, executing a code snippet, or any other action that need to be done by the system. 
    - our parser mechanism works based on sentinel block lines, where you define a start line and a closing line, and the system will parse that block and execute the corresponding action.
    - NEVER nest one parser block inside another parser block unless a block explicitly says it supports nested blocks. By default, assume nested blocks are invalid.
    - For block structure always follow in this format : 
    \`\`\`
    @@ace:start block_slug
        content
    @@ace:end
    \`\`\` 
    - The @@ace:start line must be followed by a line break before the payload starts.
    - @@ace:start and @@ace:end are only treated as parser control markers when they appear at the beginning of a line.
    - If @@ace:start is followed by a block name that is not registered, it will be treated as plain visible text instead of a real parser block.
    - the content can be text, payload, json or anything but it will be passed to the corresponding block handler as the input, and the system 
    will execute the block handler and return the result back to you, which you can use in your next response.
    - Treat paragraph content as plain visible prose only. Do not call another block inside a paragraph block.
    - If you need to mention control markers literally inside visible prose, write them as escaped or explanatory text, not as an actual executable nested block.
    - There're default provided block parser for u to interact with the system, the details of the default block parser can be found in the the [DEFAULT BLOCK]. 
    - For the other custom block parser, you can use the default block provided if there'is to list, and find block parser that match with ur needs.
    - For block that not default but currently active will be putted in the [ACTIVE PARSER BLOCK] section in the prompt context, and you can use that 
    information to know how to use the block and passed the correct content block.

    [CONTEXT GUIDELINE]
    - The context is the relevant information that you can use to inform your response, this can include relevant facts, result from a previous block parser, tool call
    result, or any other information that can help you to generate a better response.
    - The context will be updated throughout the session, and you should always try to use the 
    most relevant information from the context to inform your response.
    - You can always added, update or remove the context by using provided block parser.
    - CRITICAL RULE: When using protocol_control, context, or working_memory parser blocks, ALWAYS place them at the VERY TOP of your response before any other text or blocks. This ensures your intentions and memory state are processed before any further generation.
    `.trim();
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
        return `[PLAN MODE] You are currently in Planning mode, your response should be focused on creating a concrete plan of action based on the reasoning step. 
        This can include outlining specific steps to take, identifying which tools or resources to use, and determining how to best address the user's needs. 
        Your plan should be clear, actionable, and directly informed by the insights gained during the Reasoning phase.`.trim();

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
    lines.push('Block syntax: @@ace:start block_slug\\n...payload...\\n@@ace:end');
    lines.push('Registered parser block names below represent the full registry, not the subset of block details currently hydrated into this prompt.');
    lines.push('If you only know a block name but need its schema or usage details, call parser_registry with action "detail".');
    lines.push('If you want the full registry names again, call parser_registry with action "list_names".');
    lines.push('If you want to know which block details are currently hydrated in this prompt, call parser_registry with action "list_hydrated".');
    lines.push('Global rule: do not nest parser blocks inside other parser blocks unless a block explicitly documents that nested usage is allowed.');

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
    lines.push('Items placed here are kept available for reference. Use the working_memory parser block to drop items you no longer need.');

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

    historyTurns.forEach((turn, idx) => {
        const turnIndex = start + idx;
        const turnNumber = turnIndex + 1;
        const historyEntry = session.history?.[turnIndex];

        if (historyEntry?.status === 'active') {
            if (historyEntry.prompt?.trim()) {
                lines.push(`[TURN ${turnNumber}] User Summary: ${historyEntry.prompt.trim()}`);
            }

            if (historyEntry.response?.trim()) {
                lines.push(`[TURN ${turnNumber}] Assistant Summary: ${historyEntry.response.trim()}`);
            }

            return;
        }

        const userPrompt = turn.entries?.[0]?.prompt?.trim();
        if (userPrompt) {
            lines.push(`[TURN ${turnNumber}] User: ${userPrompt}`);
        }

        const assistantResponse = turn.entries
            ?.filter(e => e.status === 'completed' || e.status === 'success')
            .map(e => e.response?.trim() ?? '')
            .filter(Boolean)
            .join('\n');

        if (assistantResponse) {
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