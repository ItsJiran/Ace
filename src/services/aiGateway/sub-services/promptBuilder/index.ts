/**
 * Prompt Builder Module Index
 *
 * Summary:
 * - exposes the public prompt-builder surface while internals stay split by section responsibility
 * - preserves the existing `promptBuilder.ts` facade contract for the rest of the gateway runtime
 *
 * Function Groups:
 * - `buildPrompt`: top-level composer for the final prompt string
 * - `buildDefaultPrompt`: always-on identity and global rules
 * - `buildBlockParserPrompt`: parser registry catalog and hydrated block detail rendering
 * - `buildContextPrompt`, `buildMemoryPrompt`, `buildExpandedWorkingMemoryPrompt`: evidence and payload sections
 * - `buildCurrentStateOperatingPrompt`, `buildCurrentStatePlanPrompt`, `buildCurrentPassOffPrompt`: deterministic state-control sections
 * - `buildCurrentTurnRetainedMemoryPrompt`, `buildHistoricalTurnMemoryPrompt`: current-turn vs prior-turn memory rendering
 * - `buildHistoryPrompt`: legacy alias for historical turn memory rendering
 * - `buildStoragePrompt`: reserved storage section hook
 *
 * Prompt Hierarchy:
 * - `buildCurrentStateOperatingPrompt` is the highest-priority runtime navigator
 * - `buildCurrentStatePlanPrompt` and `buildCurrentPassOffPrompt` are the immediate decision refiners under current state
 * - `buildPromptInputSection` is only authoritative for the first user pass, not for autonomous continuation
 * - parser registry output constrains how the model may express runtime actions
 * - context, memory, expanded payloads, history, and storage provide evidence but do not override state-control sections
 *
 * ASCII Diagram:
 *
 *   promptBuilder.ts
 *         |
 *         v
 *       index.ts
 *         |
 *         v
 *     composer.ts
 *   /    |      |      \
 *  v     v      v       v
 * default  parser  memory/history  state
 * section  section  sections       sections
 *            \         |           /
 *             v        v          v
 *           selectors.ts + stateRules.ts + shared.ts
 *
 * Hierarchy Flow:
 * - state sections decide what should happen
 * - parser registry decides how valid runtime actions must be expressed
 * - evidence sections justify or support the current state decision
 *
 * Final Prompt Map:
 * - baseline rules: default section
 * - runtime expression rules: parser registry section
 * - supporting evidence: context, memory, expanded payloads, history, storage
 * - execution control: current state, current state plan, passed-off prompt
 * - initial-pass-only anchor: current input
 *
 * Flow Notes:
 * - `shared.ts` carries shared prompt-builder types
 * - `selectors.ts` reads session data without rendering text
 * - `stateRules.ts` centralizes state-specific policy text
 * - section modules only render strings from session data and shared rules
 */

export type { AIPromptKind } from './shared';
export { buildPrompt } from './composer';
export { buildDefaultPrompt } from './defaultSection';
export { buildCurrentTurnRetainedMemoryPrompt, buildHistoricalTurnMemoryPrompt, buildHistoryPrompt } from './historySection';
export { buildBlockParserPrompt } from './parserRegistrySection';
export { buildContextPrompt, buildExpandedWorkingMemoryPrompt, buildMemoryPrompt } from './memorySections';
export { buildCurrentPassOffPrompt, buildCurrentStateOperatingPrompt, buildCurrentStatePlanPrompt } from './stateSections';
export { buildStoragePrompt } from './storageSection';