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
    let prompt = defaultContextPrompt;
    let loaded_parser_prompt = buildBlockParserPrompt(session);
    let loaded_context_prompt = buildContextPrompt(session);
    let loaded_memory_prompt = buildMemoryPrompt(session);
    let loaded_storage_prompt = buildStoragePrompt(session);
    let loaded_history_prompt = buildHistoryPrompt(session);


    return `
        [ORIGINAL USER PROMPT]
        ${originalPrompt}
    `;
}

export function buildDefaultPrompt(): string {
    // This function can be used to build a default prompt that serves as a starting point for interactions with the AI model. 
    // It can include instructions for the model, default context, or any other information that should be included in every prompt. 
    // The implementation would depend on the specific requirements of the AI Gateway service and the capabilities of the underlying model.
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