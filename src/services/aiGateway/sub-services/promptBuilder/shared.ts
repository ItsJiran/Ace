/**
 * Prompt Builder Shared Contracts
 *
 * Summary:
 * - defines prompt-builder public types shared across section modules
 * - keeps the split prompt-builder package aligned on the same prompt-kind contract
 *
 * Notes:
 * - keep this module dependency-light so every section builder can import it safely
 */

export type AIPromptKind = 'user_prompt' | 'autonomous_follow_up';