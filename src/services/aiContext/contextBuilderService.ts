import { buildDefaultParserContextProtocol, DEFAULT_APP_BRIDGE_CONTEXT } from './protocolTextService';
import type { BuildContextOptions, SessionContextRef, SessionContextState } from './types';

export function buildContextForSession(state: SessionContextState, prompt: string, options: BuildContextOptions = {}) {
    const recentHistorySummaries = state.history_summaries.slice(-8);
    const recentTurns = recentHistorySummaries.length === 0 ? state.turns.slice(-2) : [];
    const recentTurnsTokens = recentTurns.reduce((acc, t) => acc + Math.ceil(t.text.length / 4), 0);
    const historySummaryTokens = recentHistorySummaries.reduce((acc, item) => acc + Math.ceil(item.summary.length / 4), 0);

    const parserContextProtocol = buildDefaultParserContextProtocol();

    const usedContexts: SessionContextRef[] = [
        {
            key: 'input:user_prompt',
            label: 'Current user prompt',
            kind: 'input',
            token_estimate: Math.ceil(prompt.length / 4),
        },
        {
            key: 'default:app_bridge',
            label: 'Default app bridge context',
            kind: 'runtime',
            token_estimate: Math.ceil(DEFAULT_APP_BRIDGE_CONTEXT.length / 4),
        },
        {
            key: 'default:context_parser_protocol',
            label: 'Default parser context protocol',
            kind: 'tooling',
            token_estimate: Math.ceil(parserContextProtocol.length / 4),
        },
    ];

    if (options.promptHistoryMemoryKey) {
        usedContexts.push({
            key: options.promptHistoryMemoryKey,
            label: 'Reserved raw prompt history record',
            kind: 'history',
            detail: options.promptHistoryRefUid,
        });
    }

    if (options.responseHistoryMemoryKey) {
        usedContexts.push({
            key: options.responseHistoryMemoryKey,
            label: 'Reserved raw response history record',
            kind: 'history',
            detail: options.responseHistoryRefUid,
        });
    }

    if (state.summary) {
        usedContexts.push({
            key: 'session:summary',
            label: 'Session summary from AI context block',
            kind: 'summary',
            token_estimate: Math.ceil(state.summary.length / 4),
        });
    }

    if (recentHistorySummaries.length > 0) {
        usedContexts.push({
            key: 'session:history_summaries',
            label: `AI-authored history summaries (${recentHistorySummaries.length})`,
            kind: 'history',
            token_estimate: historySummaryTokens,
        });
    }

    if (recentTurns.length > 0) {
        usedContexts.push({
            key: 'session:recent_turns',
            label: `Fallback raw turns (${recentTurns.length})`,
            kind: 'history',
            token_estimate: recentTurnsTokens,
        });
    }

    if (options.sdk || options.model) {
        usedContexts.push({
            key: 'runtime:model_binding',
            label: 'Session model binding',
            kind: 'runtime',
            detail: `${options.sdk ?? 'unknown'} / ${options.model ?? 'unknown'}`,
        });
    }

    const contextTextParts: string[] = [];
    contextTextParts.push(`[APP_BRIDGE_CONTEXT]\n${DEFAULT_APP_BRIDGE_CONTEXT}`);
    contextTextParts.push(`[PARSER_CONTEXT_PROTOCOL]\n${parserContextProtocol}`);

    if (options.promptHistoryMemoryKey || options.responseHistoryMemoryKey) {
        const summaryParagraphThreshold = options.summaryParagraphThreshold ?? 2;
        const promptRequirementText = options.requirePromptHistorySummary ? 'REQUIRED' : 'OPTIONAL (short prompt)';
        const responseRequirementText = options.requireResponseHistorySummary
            ? 'REQUIRED'
            : `OPTIONAL unless final response reaches >= ${summaryParagraphThreshold} paragraphs`;
        const lines = [
            'IMPORTANT: Follow this section exactly for this turn.',
            `- Paragraph threshold for long-form summary mode: >= ${summaryParagraphThreshold} paragraphs.`,
            `- history_summary_ai_prompt is ${promptRequirementText}.`,
            `- history_summary_ai_response is ${responseRequirementText}.`,
            'Current turn history summary contract:',
            '- Before normal prose, emit this exact opening tag: <history_summary_ai_prompt>',
            '- Close it with: </history_summary_ai_prompt>',
            '- After your normal prose finishes, emit this exact opening tag: <history_summary_ai_response>',
            '- Close it with: </history_summary_ai_response>',
            '- Both blocks must contain strict JSON object payload.',
            '- Emit each REQUIRED history block exactly once for this turn.',
            `- For prompt block use memory_key: ${options.promptHistoryMemoryKey ?? 'missing'}`,
            `- For response block use memory_key: ${options.responseHistoryMemoryKey ?? 'missing'}`,
            options.promptHistoryRefUid ? `- Prompt ref_uid: ${options.promptHistoryRefUid}` : '',
            options.responseHistoryRefUid ? `- Response ref_uid: ${options.responseHistoryRefUid}` : '',
            '- Example prompt block JSON: {"summary":"Ringkas maksud prompt user saat ini.","memory_key":"...","ref_uid":"..."}',
            '- Example response block JSON: {"summary":"Ringkas inti jawaban dan hasil final.","memory_key":"...","ref_uid":"..."}',
            '- If history_summary_ai_response is REQUIRED: Final checklist before ending output -> response prose done -> <history_summary_ai_response> JSON emitted -> closing </history_summary_ai_response> emitted.',
        ].filter(Boolean).join('\n');
        contextTextParts.push(`[TURN_HISTORY_PROTOCOL]\n${lines}`);
    }

    if (recentHistorySummaries.length > 0) {
        const serializedHistory = recentHistorySummaries
            .map((item) => {
                const sourceLabel = item.source === 'raw' ? ' [RAW]' : item.source === 'fallback' ? ' [FALLBACK]' : '';
                const parts = [
                    `${item.block_slug.toUpperCase()}${sourceLabel}`,
                    item.summary,
                    item.memory_key ? `memory_key=${item.memory_key}` : '',
                    item.ref_uid ? `ref_uid=${item.ref_uid}` : '',
                ].filter(Boolean);
                return parts.join(' | ');
            })
            .join('\n');
        contextTextParts.push(`[SESSION_HISTORY_SUMMARIES]\n${serializedHistory}`);
    }

    if (recentTurns.length > 0) {
        const serialized = recentTurns
            .map((t) => `${t.role.toUpperCase()}: ${t.text}`)
            .join('\n');
        contextTextParts.push(`[FALLBACK_RECENT_TURNS]\n${serialized}`);
    }

    const composedPrompt =
        contextTextParts.length > 0
            ? `${contextTextParts.join('\n\n')}\n\n[USER_PROMPT]\n${prompt}`
            : prompt;

    return {
        used_contexts: usedContexts,
        composed_prompt: composedPrompt,
    };
}