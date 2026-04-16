/**
 * Prompt Builder Default Section
 *
 * Summary:
 * - renders the global assistant identity and general operating constraints
 * - keeps the always-on baseline guidance separate from dynamic session sections
 */

export function buildDefaultPrompt(): string {
    return [
        buildAssistantIdentityPrompt(),
        buildGeneralConstraintsPrompt(),
    ].filter(Boolean).join('\n\n');
}

function buildAssistantIdentityPrompt(): string {
    return '[DEFAULT CONTEXT] You are ACE Assistant. Follow the system guidance, stay aligned with the current session state, and produce the next valid response for the runtime.';
}

function buildGeneralConstraintsPrompt(): string {
    return `[GENERAL CONSTRAINTS]
    - Always reason from the current session state.
    - Do not assume missing user intent when clarification is required.
    - Prefer the most relevant information from session history, active context, and working memory.
    - Keep the response concise, clear, and operational.
    - Use parser blocks for system actions. Use visible prose only for user-facing explanation.`.trim();
}