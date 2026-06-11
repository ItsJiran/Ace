/**
 * Action: Read File — read one or more files from a single reason.
 *
 * One action_read_file node receives ONE reason (e.g., "Baca config.yaml,
 * .env, dan package.json") and the LLM extracts ALL file paths from it —
 * supporting multiple file reads in one go. Each file becomes a ContextItemFile.
 */

import { AIMessage, SystemMessage } from '@langchain/core/messages';
import { Command, END, getConfig } from '@langchain/langgraph';
import { z } from 'zod';
import { invokeLLM } from '#/app-background/lib/utils/ai/invoke-llm';
import { emitNodeStart, emitNodeEnd, emitNodeProgress, emitNodeProgressDone } from '#/app-background/lib/utils/ai/emit-graph-event';
import { KernelEngine } from '#/shared/engines/kernel-engine';
import { buildErrorRecoveryCommand } from '../recovery-error-helper';
import { writeActionOutput, writeActionResult } from '#/app-background/lib/utils/thread-storage';
import { writeFileContext } from '#/app-background/lib/utils/context-storage';
import { FSEngine } from '#/shared/engines/fs-engine';
import type { AceAgentV3State } from '../../types';

// ── Structured output — JSON string in XML tag ────────────────────────────

const ReadFileAction = z.object({
    files: z
        .string()
        .describe(
            'JSON array of file paths to read. Each entry: {"path":"..."}. ' +
            'Output ONLY the JSON array inside <files>...</files> — no extra text. ' +
            'Example: [{"path":"config.yaml"},{"path":".env"}]. ' +
            'Empty if nothing to read: [].',
        ),
});

const FilesSchema = z.array(
    z.object({
        path: z.string().min(1),
    }),
);

// ── Prompt ────────────────────────────────────────────────────────────────

function readFilePrompt(state: AceAgentV3State, actionReason: string): string {
    const existingContexts = (state.contexts ?? [])
        .filter(c => c.type === 'file')
        .map(c => c.key);

    return [
        'You are a file path extractor. Extract ALL file paths from the given reason.',
        '',
        '### What To Read',
        `"${actionReason}"`,
        '',
        '### Already In Context',
        existingContexts.length > 0
            ? existingContexts.map(p => `- ${p}`).join('\n')
            : '(no files in context yet)',
        '',
        '### CRITICAL: Preserve the FULL path as written in the reason',
        '',
        '### Guidelines',
        '- Extract every file path mentioned in the reason — USE THE EXACT FULL PATH from the reason.',
        '- Do NOT simplify, shorten, truncate, or guess paths. If the reason says "/home/user/config.yaml", use "/home/user/config.yaml" — NOT "config.yaml".',
        '- If the reason contains an absolute path (starting with /), preserve it as absolute.',
        '- If the reason contains a relative path, keep it relative.',
        '- If the reason mentions a directory, do NOT include it — only file paths.',
        '- Skip paths already in context unless the reason explicitly says to re-read.',
        '- If no file paths found → output [].',
        '',
        '### WRONG → RIGHT Examples',
        'Reason: "Read /home/user/.env and config.yaml"',
        '  ❌ [{"path":".env"},{"path":"config.yaml"}]                — dropped /home/user/ prefix',
        '  ✅ [{"path":"/home/user/.env"},{"path":"config.yaml"}]     — exact paths from reason',
        '',
        'Reason: "Read src/index.ts and tests/unit/helper.ts"',
        '  ❌ [{"path":"index.ts"},{"path":"helper.ts"}]              — lost parent folders',
        '  ✅ [{"path":"src/index.ts"},{"path":"tests/unit/helper.ts"}]',
        '',
        '### Output Format',
        'Put the file paths as a JSON array inside <files>...</files>.',
        'NO wrapping, NO markdown, NO extra text — just the XML tag with the JSON array.',
        '',
        'Examples:',
        'Reason: "Baca ~/.config/ace/settings.json dan /etc/hosts"',
        '<files>[{"path":"~/.config/ace/settings.json"},{"path":"/etc/hosts"}]</files>',
        '',
        'Reason: "Baca src/main.ts dan src/utils/helper.ts"',
        '<files>[{"path":"src/main.ts"},{"path":"src/utils/helper.ts"}]</files>',
    ].join('\n');
}

// ── Node ───────────────────────────────────────────────────────────────────

export function createActionReadFile() {
    return async function actionReadFile(
        state: AceAgentV3State,
    ): Promise<Partial<AceAgentV3State> | Command> {
        try {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'action_read_file', 'ace-v3', state).catch(() => {});

        if (threadUid && !KernelEngine.readMemory(`thread:active:${threadUid}`)) {
            return new Command({ goto: END });
        }

        const cycle = state.current_cycle;

        // Get the RUNNING action's reason — this tells us WHAT files to read
        const runningAction = cycle?.actions?.find(a => a.status === 'running');
        const actionReason = runningAction?.target?.reason ?? '';

        // Step 1: Ask LLM to extract file paths from the reason
        const { resolved } = await invokeLLM({
            runtime: getConfig() as never,
            structuredOutput: ReadFileAction,
            messages: [new SystemMessage(readFilePrompt(state, actionReason))],
            nodeName: 'action_read_file',
            graphName: 'ace-v3',
            maxRetries: 0,
            timeout: 10000,
            streaming: false,
        });

        // Step 1b: Parse JSON string → validate
        let fileList: z.infer<typeof FilesSchema> = [];
        const raw = resolved?.files;
        if (raw && typeof raw === 'string') {
            try {
                const parsed = JSON.parse(raw);
                const validated = FilesSchema.safeParse(parsed);
                if (validated.success) {
                    fileList = validated.data;
                } else {
                    console.warn('[action_read_file] files parse failed:', validated.error.message);
                }
            } catch {
                console.warn('[action_read_file] JSON.parse failed for files:', raw.slice(0, 200));
            }
        }

        // Step 2: Read each file, build context items (deduplicate by key)
        const updatedContexts = [...(state.contexts ?? [])];
        const results: Array<{ path: string; read: boolean; size: number; error?: string; _content?: string }> = [];
        const progressUid = `read-file-${Date.now()}`;

        const buildProgressXml = (maxContentLen = 500) => {
            const parts: string[] = [];
            for (const r of results) {
                if (r.read) {
                    const contentPreview = ((r as any)._content as string)?.slice(0, maxContentLen) ?? '';
                    if (contentPreview) {
                        const truncated = contentPreview.length < ((r as any)._content as string)?.length;
                        const suffix = truncated ? '\n... (truncated)' : '';
                        parts.push(`  <entry path="${r.path}" size="${r.size}" status="ok">${contentPreview}${suffix}</entry>`);
                    } else {
                        parts.push(`  <entry path="${r.path}" size="${r.size}" status="ok" />`);
                    }
                } else {
                    parts.push(`  <entry path="${r.path}" status="fail">${r.error ?? 'unknown'}</entry>`);
                }
            }
            for (const f of fileList) {
                if (!results.some(r => r.path === f.path)) {
                    parts.push(`  <entry path="${f.path}" status="pending" />`);
                }
            }
            return parts.length > 0 ? `<files>\n${parts.join('\n')}\n</files>` : '';
        };

        if (threadUid && fileList.length > 0) {
            emitNodeProgress(threadUid, 'action_read_file', 'ace-v3', progressUid, buildProgressXml(300)).catch(() => {});
        }

        for (const f of fileList) {
            try {
                const content = await FSEngine.readRaw(f.path);
                if (content !== null) {
                    const existingIdx = updatedContexts.findIndex(
                        c => c.type === 'file' && c.key === f.path,
                    );
                    const existingId = existingIdx >= 0
                        ? (updatedContexts[existingIdx] as any).id
                        : undefined;
                    const item = await writeFileContext(
                        threadUid!,
                        f.path,
                        `File: ${f.path} (${content.length} chars)`,
                        content as string,
                        existingId,
                    );
                    if (existingIdx >= 0) {
                        updatedContexts[existingIdx] = item;
                    } else {
                        updatedContexts.push(item);
                    }
                    results.push({ path: f.path, read: true, size: content.length, _content: content });
                } else {
                    results.push({ path: f.path, read: false, size: 0, error: 'file not found or unreadable' });
                }
            } catch (err: any) {
                results.push({ path: f.path, read: false, size: 0, error: err?.message ?? 'unknown error' });
            }

            if (threadUid) {
                emitNodeProgress(threadUid, 'action_read_file', 'ace-v3', progressUid, buildProgressXml(300)).catch(() => {});
            }
        }

        // Emit final progress then clear ephemeral
        if (threadUid && fileList.length > 0) {
            emitNodeProgress(threadUid, 'action_read_file', 'ace-v3', progressUid, buildProgressXml(300)).catch(() => {});
            emitNodeProgressDone(threadUid, 'action_read_file', 'ace-v3', progressUid).catch(() => {});
        }

        // Build final XML for AIMessage — full content (2000 chars) for final result
        const finalXml = buildProgressXml(2000);
        const readCount = results.filter(r => r.read).length;
        const failCount = results.length - readCount;

        const contextRefs = updatedContexts
            .filter((c): c is any => c.type === 'file' && fileList.some((f: any) => f.path === c.key))
            .map(c => `[context:file] ${c.key} → ${c.content}`);

        const summary = readCount > 0
            ? `Read ${readCount} file(s). ${failCount > 0 ? `${failCount} failed.` : ''} Results stored in context items.`
            : 'No files read.';

        // Write output & result pointers
        const cycleIndex = (state.cycles ?? []).length - 1;
        const runningActionIdx = cycle?.actions?.findIndex((a: any) => a.status === 'running') ?? 0;
        if (runningAction && threadUid) {
            runningAction.output = await writeActionOutput(threadUid, cycleIndex, runningActionIdx, { summary, contextRefs }).catch(() => '');
            runningAction.result = await writeActionResult(threadUid, cycleIndex, runningActionIdx, { summary, results, contextRefs }).catch(() => '');
        }

        const output: Partial<AceAgentV3State> = {
            messages: [new AIMessage({ content: finalXml, name: 'ace-v3-read-file' })],
            contexts: updatedContexts,
            current_cycle: cycle,
            target_node: 'action_dispatcher',
            from_node: 'action_read_file',
        };

        if (threadUid)
            emitNodeEnd(threadUid, 'action_read_file', 'ace-v3', output, {
                readCount,
                failCount,
            }).catch(() => {});

        return output;
        } catch (error) {
            console.error('[action_read_file] Error:', error);
            return buildErrorRecoveryCommand(error, 'action_read_file');
        }
    };
}
