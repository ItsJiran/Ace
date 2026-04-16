/**
 * Prompt Builder Parser Registry Section
 *
 * Summary:
 * - renders the parser registry overview and hydrated block details
 * - distinguishes the full registered block catalog from the currently hydrated subset
 * - keeps parser-discovery instructions explicit and deterministic
 */

import type { AISession } from '#/schemas/ai';
import { RegistryEngine } from '#/services/registryEngine';

export function buildBlockParserPrompt(session: AISession): string {
    const allBlocks = RegistryEngine.listParserBlockSummaries();
    if (allBlocks.length === 0) return '';

    const activeBlockSlugs = new Set(
        (session.active_parser_blocks ?? []).map((block) => block.block_slug),
    );
    const fullDetailSlugs = new Set(
        allBlocks
            .filter((block) => block.is_default_detail || activeBlockSlugs.has(block.slug))
            .map((block) => block.slug),
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