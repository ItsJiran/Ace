/**
 * Action: List Directory — list contents of one or more directories.
 *
 * One action_list_directory node receives ONE reason (e.g., "List files in
 * src/ and tests/") and the LLM extracts ALL directory paths from it —
 * supporting multiple directory listings in one go.
 */

import { AIMessage, SystemMessage } from '@langchain/core/messages';
import { Command, END, getConfig } from '@langchain/langgraph';
import { z } from 'zod';
import { invokeLLM } from '#/app-background/lib/utils/ai/invoke-llm';
import { emitNodeStart, emitNodeEnd, emitNodeProgress } from '#/app-background/lib/utils/ai/emit-graph-event';
import { KernelEngine } from '#/shared/engines/kernel-engine';
import { buildErrorRecoveryCommand } from '../recovery-error-helper';
import { writeActionOutput, writeActionResult } from '#/app-background/lib/utils/thread-storage';
import { FSEngine } from '#/shared/engines/fs-engine';
import type { AceAgentV3State, ContextItemDirectory } from '../../types';

// ── Structured output — JSON string in XML tag ────────────────────────────

const ListDirAction = z.object({
    dirs: z
        .string()
        .describe(
            'JSON array of directory paths to list. Each entry: {"path":"..."}. ' +
            'Output ONLY the JSON array inside <dirs>...</dirs> — no extra text. ' +
            'Example: [{"path":"src"},{"path":"tests"}]. Empty if nothing to list: [].',
        ),
});

const DirsSchema = z.array(
    z.object({
        path: z.string().min(1),
    }),
);

// ── Prompt ────────────────────────────────────────────────────────────────

function listDirPrompt(state: AceAgentV3State, actionReason: string): string {
    const existingDirs = (state.contexts ?? [])
        .filter(c => c.type === 'directory')
        .map(c => c.key);

    return [
        'You are a directory path extractor. Extract ALL directory paths from the given reason.',
        '',
        '### What To List',
        `"${actionReason}"`,
        '',
        '### Already In Context',
        existingDirs.length > 0
            ? existingDirs.map(p => `- ${p}`).join('\n')
            : '(no directories in context yet)',
        '',
        '### Guidelines',
        '- Extract every directory path mentioned in the reason.',
        '- Use relative paths when possible (e.g., "src", "src/components").',
        '- If the reason mentions a file, do NOT include it — only directory paths.',
        '- Skip paths already in context unless the reason explicitly says to re-list.',
        '- If no directory paths found → output [].',
        '',
        '### Output Format',
        'Put the paths as a JSON array inside <dirs>...</dirs>.',
        'NO wrapping, NO markdown, NO extra text — just the XML tag with the JSON array.',
        '',
        'Examples:',
        'Reason: "List semua file di src/ dan tests/"',
        '<dirs>[{"path":"src"},{"path":"tests"}]</dirs>',
        '',
        'Reason: "Lihat isi folder components dan utils"',
        '<dirs>[{"path":"components"},{"path":"utils"}]</dirs>',
    ].join('\n');
}

// ── Node ───────────────────────────────────────────────────────────────────

export function createActionListDirectory() {
    return async function actionListDirectory(
        state: AceAgentV3State,
    ): Promise<Partial<AceAgentV3State> | Command> {
        try {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'action_list_directory', 'ace-v3', state).catch(() => {});

        if (threadUid && !KernelEngine.readMemory(`thread:active:${threadUid}`)) {
            return new Command({ goto: END });
        }

        const cycle = state.current_cycle;

        const runningAction = cycle?.actions?.find(a => a.status === 'running');
        const actionReason = runningAction?.target?.reason ?? '';

        // Step 1: Ask LLM to extract directory paths from the reason
        const { resolved } = await invokeLLM({
            runtime: getConfig() as never,
            structuredOutput: ListDirAction,
            messages: [new SystemMessage(listDirPrompt(state, actionReason))],
            nodeName: 'action_list_directory',
            graphName: 'ace-v3',
            maxRetries: 0,
            timeout: 10000,
            streaming: false,
        });

        // Step 1b: Parse JSON string → validate
        let dirList: z.infer<typeof DirsSchema> = [];
        const raw = resolved?.dirs;
        if (raw && typeof raw === 'string') {
            try {
                const parsed = JSON.parse(raw);
                const validated = DirsSchema.safeParse(parsed);
                if (validated.success) {
                    dirList = validated.data;
                } else {
                    console.warn('[action_list_directory] dirs parse failed:', validated.error.message);
                }
            } catch {
                console.warn('[action_list_directory] JSON.parse failed for dirs:', raw.slice(0, 200));
            }
        }

        // Step 2: List each directory, build context items (deduplicate by key)
        const updatedContexts = [...(state.contexts ?? [])];
        const results: Array<{ path: string; listed: boolean; entries: number; names?: Array<{ name: string; isDir: boolean }>; error?: string }> = [];
        const progressUid = `list-dir-${Date.now()}`;

        const buildProgressXml = () => {
            const parts: string[] = [];
            for (const r of results) {
                if (r.listed) {
                    const namesXml = (r.names ?? []).slice(0, 20).map(n =>
                        `    <${n.isDir ? 'dir' : 'file'}>${n.name}${n.isDir ? '/' : ''}</${n.isDir ? 'dir' : 'file'}>`,
                    ).join('\n');
                    const more = (r.names ?? []).length > 20 ? '\n    <more>+' + ((r.names ?? []).length - 20) + ' more</more>' : '';
                    parts.push(`  <entry path="${r.path}" entries="${r.entries}" status="ok">\n${namesXml}${more}\n  </entry>`);
                } else {
                    parts.push(`  <entry path="${r.path}" status="fail">${r.error ?? 'unknown'}</entry>`);
                }
            }
            for (const d of dirList) {
                if (!results.some(r => r.path === d.path)) {
                    parts.push(`  <entry path="${d.path}" status="pending" />`);
                }
            }
            return parts.length > 0 ? `<dir>\n${parts.join('\n')}\n</dir>` : '';
        };

        if (threadUid && dirList.length > 0) {
            emitNodeProgress(threadUid, 'action_list_directory', 'ace-v3', progressUid, buildProgressXml()).catch(() => {});
        }

        for (const d of dirList) {
            try {
                const entries = await FSEngine.readDirectory(d.path);
                if (entries.length >= 0) {
                    const fileCount = entries.filter(e => !e.isDirectory).length;
                    const dirCount = entries.filter(e => e.isDirectory).length;
                    const existingIdx = updatedContexts.findIndex(
                        c => c.type === 'directory' && c.key === d.path,
                    );
                    const item: ContextItemDirectory = {
                        id: existingIdx >= 0
                            ? (updatedContexts[existingIdx] as ContextItemDirectory).id
                            : `ctx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                        type: 'directory',
                        key: d.path,
                        summary: `${d.path}: ${fileCount} files, ${dirCount} dirs`,
                        is_expanded: true,
                        content: JSON.stringify(entries),
                    };
                    if (existingIdx >= 0) {
                        updatedContexts[existingIdx] = item;
                    } else {
                        updatedContexts.push(item);
                    }
                    const names = entries.slice(0, 20).map(e => ({ name: e.name, isDir: !!e.isDirectory }));
                    results.push({ path: d.path, listed: true, entries: entries.length, names });
                } else {
                    results.push({ path: d.path, listed: false, entries: 0, error: 'directory not found' });
                }
            } catch (err: any) {
                results.push({ path: d.path, listed: false, entries: 0, error: err?.message ?? 'unknown error' });
            }

            // Emit progress after each directory attempt
            if (threadUid) {
                emitNodeProgress(threadUid, 'action_list_directory', 'ace-v3', progressUid, buildProgressXml()).catch(() => {});
            }
        }

        const listedCount = results.filter(r => r.listed).length;
        const failCount = results.length - listedCount;

        // Emit final done progress, then clear ephemeral
        if (threadUid && dirList.length > 0) {
            emitNodeProgress(threadUid, 'action_list_directory', 'ace-v3', progressUid, buildProgressXml()).catch(() => {});
        }

        // Build final XML block for the AIMessage
        const finalXml = buildProgressXml();

        // Summary only for thought node (stored in output/result, not shown to user)
        const summary = listedCount > 0
            ? `Listed ${listedCount} director${listedCount > 1 ? 'ies' : 'y'}: ${results.filter(r => r.listed).map(r => `${r.path} (${r.entries} entries)`).join(', ')}` +
              (failCount > 0 ? `. ${failCount} failed.` : '')
            : 'No directories listed.';

        const cycleIndex = (state.cycles ?? []).length - 1;
        const runningActionIdx = cycle?.actions?.findIndex((a: any) => a.status === 'running') ?? 0;
        if (runningAction && threadUid) {
            runningAction.output = await writeActionOutput(threadUid, cycleIndex, runningActionIdx, { summary, dirList }).catch(() => '');
            runningAction.result = await writeActionResult(threadUid, cycleIndex, runningActionIdx, { summary, results }).catch(() => '');
        }

        const output: Partial<AceAgentV3State> = {
            messages: [new AIMessage({ content: finalXml, name: 'ace-v3-list-dir' })],
            contexts: updatedContexts,
            current_cycle: cycle,
            target_node: 'action_dispatcher',
            from_node: 'action_list_directory',
        };

        if (threadUid)
            emitNodeEnd(threadUid, 'action_list_directory', 'ace-v3', output, {
                listedCount,
                failCount,
            }).catch(() => {});

        return output;
        } catch (error) {
            console.error('[action_list_directory] Error:', error);
            return buildErrorRecoveryCommand(error, 'action_list_directory');
        }
    };
}
