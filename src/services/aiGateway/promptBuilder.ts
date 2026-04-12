// This file is responsible for building prompts for the AI Gateway service. 
// It provides functions to construct prompts based on user input and system requirements.

import type { AISession } from "#/schemas/ai";
import { KernelEngine } from "../kernelEngine";

// It also manages context lifecycle and memory for the AI sessions, ensuring that relevant information 
// is retained across interactions. 

const defaultContextPrompt = '';

export function buildPrompt(originalPrompt: string, session_uid: string): string {
    
    // Read the current session state from memory using the session UID. 
    // This allows us to access any relevant information
    const session = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`);

    // Loaded parser
    let loaded_default_prompt = defaultContextPrompt;
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
    - our parser mechanism works based on the block structure, where you can define a block structure in your response, and the system will parse that block and execute the corresponding action.
    - For block structure always follow in this format : 
    \`\`\`
    <block_slug>
        content
    </block_slug>
    \`\`\` 
    or 
    \`\`\`
    <block_slug> content </block_slug>
    \`\`\`
    the content can be text, payload, json or anything but it will be passed to the corresponding block handler as the input, and the system 
    will execute the block handler and return the result back to you, which you can use in your next response.
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
    `.trim();
}

export function buildConstraintsStatePrommpt(session : AISession): string {
    // This function can be used to build a prompt that includes constraints based on the current state of the session.
    // It can retrieve information about the session's state, plan, context, and other relevant data to ensure that
    // the model's response adheres to the specified constraints. The implementation would involve querying the session
    // state and formatting it into a prompt that can be sent to the model.
    if(session.state == 'Reason')
        return `[REASON MODE] You are currently in Reasoning mode, your response should be focused on understanding the user's intent, \
        gathering relevant information, and preparing for the next steps. Avoid taking any concrete actions or making assumptions 
        about the user's needs at this stage. Instead, ask clarifying questions, identify potential tools or resources that may be needed, 
        and consider any relevant context that could inform your reasoning process.`.trim();

    if(session.state == 'Plan')
        return `[PLAN MODE] You are currently in Planning mode, your response should be focused on creating a concrete plan of action based on the reasoning step. 
        This can include outlining specific steps to take, identifying which tools or resources to use, and determining how to best address the user's needs. 
        Your plan should be clear, actionable, and directly informed by the insights gained during the Reasoning phase.`.trim();

    if(session.state == 'Observe')
        return `[OBSERVE MODE] You are currently in Observing mode, your response should be focused on analyzing new information that has been generated after taking an action. 
        This can include the results of a tool call, the user's response to a question, or any other new information that has come to light. 
        Your analysis should consider how this new information impacts the overall session, including whether the original plan is still valid or if it needs to be updated based on the new context.`.trim();

    if(session.state == 'Reflect')
        return `[REFLECT MODE] You are currently in Reflecting mode, your response should be focused on evaluating the effectiveness of your actions and considering any adjustments needed for future interactions. 
        This can include self-critique of your previous steps, identifying any errors or areas for improvement, and thinking about how to better meet the user's needs in subsequent interactions. 
        Your reflection should be honest, insightful, and aimed at continuous improvement throughout the session.`.trim();

    if(session.state == 'Finalize')
        return `[FINALIZE MODE] You are currently in Finalizing mode, your response should be focused on packaging the result for the user. 
        This can include formatting the response in a clear and user-friendly way, ensuring that all necessary information is included, and preparing the final output for delivery to the user. 
        Your goal in this phase is to provide a complete and polished response that effectively addresses the user's needs and concludes the current interaction.`.trim();

    return '';
}

export function buildBlockParserPrompt(session : AISession): string {
    // This function can be used to build a prompt that instructs the model to lazily load certain information 
    // or to parse the session history in a specific way. The exact implementation would depend on the 
    // requirements of the AI Gateway service and the capabilities of the underlying model.


    return '';
}

export function buildContextPrompt(session : AISession): string {
    // This function can be used to build a prompt that includes relevant context from the session history. 
    // It can retrieve past interactions, user preferences, or any other information that might help the model 
    // generate a more informed response. The implementation would likely involve querying a memory store or 
    // database for the session history and formatting it into a prompt that can be sent to the model.


    return '';
}

export function buildMemoryPrompt(session : AISession): string {
    // This function can be used to build a prompt that includes information from the session's memory. 
    // This could include facts that the user has shared, previous responses from the model, or any other 
    // information that has been stored in memory during the session. The implementation would involve 
    // retrieving this information and formatting it into a prompt that can be sent to the model.


    return '';
}

export function buildHistoryPrompt(session : AISession): string {
    // This function can be used to build a prompt that includes the history of the session. 
    // This could include all past interactions, or a summary of them, depending on the requirements of the AI Gateway service. 
    // The implementation would involve retrieving the session history and formatting it into a prompt that can be sent to the model.


    return '';
}

export function buildStoragePrompt(session : AISession): string {
    // This function can be used to build a prompt that includes information about the storage state of the session. 
    // This could include any files that have been uploaded, any data that has been stored, or any other relevant 
    // information about the session's storage. The implementation would involve retrieving this information and 
    // formatting it into a prompt that can be sent to the model.


    return '';
}