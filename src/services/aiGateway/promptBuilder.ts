/**
 * Prompt Builder Facade
 *
 * Summary:
 * - preserves the existing public entry point for AI gateway prompt composition
 * - delegates implementation to the prompt-builder sub-service package
 * - keeps legacy imports stable while the real implementation stays split by responsibility
 *
 * Function Map:
 * - `buildPrompt(...)`: compose the full gateway prompt for the current session pass
 * - `buildCurrentStateOperatingPrompt(...)`: render the main state-navigation brief
 * - `buildCurrentStatePlanPrompt(...)`: render the active per-state plan checklist
 * - `buildCurrentPassOffPrompt(...)`: render passed-off continuation guidance for autonomous passes
 * - `buildBlockParserPrompt(...)`: render parser registry rules and hydrated block details
 * - `buildContextPrompt(...)`: render active context as supporting evidence
 * - `buildMemoryPrompt(...)`: render the working-memory index
 * - `buildExpandedWorkingMemoryPrompt(...)`: render the top working-memory payload bodies
 * - `buildCurrentTurnRetainedMemoryPrompt(...)`: render retained operational memory for the active turn
 * - `buildHistoricalTurnMemoryPrompt(...)`: render prior-turn history summaries only
 * - `buildHistoryPrompt(...)`: legacy alias for historical turn memory summaries
 * - `buildDefaultPrompt(...)`: render always-on assistant identity and global constraints
 * - `buildStoragePrompt(...)`: reserved extension point for future storage-aware prompt context
 *
 * Prompt Hierarchy:
 * - Tier 1: `CURRENT STATE` is the main control surface for the active pass
 * - Tier 2: `CURRENT TURN RETAINED MEMORY`, `LIST PLAN RIGHT NOW`, and `LIST PASSED OFF PROMPT` refine what the active state must do next
 * - Tier 3: `CURRENT INPUT` applies only on the initial user pass, never as the main navigator during autonomous continuation
 * - Tier 4: parser registry guidance constrains valid block syntax and runtime action selection
 * - Tier 5: context, working memory, expanded payloads, historical turn memory, and storage are supporting evidence only
 * - Tier 6: default identity and general constraints remain global baseline rules across all tiers
 *
 * ASCII Diagram:
 *
 *   gateway runtime
 *         |
 *         v
 *   promptBuilder.ts
 *         |
 *         v
 *   sub-services/promptBuilder
 *         |
 *         v
 *      buildPrompt()
 *    /    |      |      \
 *   v     v      v       v
 * default parser evidence state
 *
 * Prompt Priority Pyramid:
 *
 *           CURRENT STATE
 *   CURRENT TURN RETAINED MEMORY
 *        PLAN + PASSED OFF
 *      CURRENT INPUT (initial)
 *        PARSER REGISTRY RULES
 * CONTEXT + MEMORY + HISTORICAL MEMORY + STORAGE
 *   DEFAULT IDENTITY + GENERAL CONSTRAINTS
 *
 * Notes:
 * - this file should remain thin; orchestration and section logic belong in the sub-service package
 */

export {
    buildBlockParserPrompt,
    buildContextPrompt,
    buildCurrentTurnRetainedMemoryPrompt,
    buildCurrentPassOffPrompt,
    buildCurrentStateOperatingPrompt,
    buildCurrentStatePlanPrompt,
    buildDefaultPrompt,
    buildExpandedWorkingMemoryPrompt,
    buildHistoricalTurnMemoryPrompt,
    buildHistoryPrompt,
    buildMemoryPrompt,
    buildPrompt,
    buildStoragePrompt,
    type AIPromptKind,
} from './sub-services/promptBuilder';