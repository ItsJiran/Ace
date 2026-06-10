/**
 * Action: Memory — extract and store multiple memory operations from a single reason.
 *
 * One action_memory node receives ONE reason (e.g., "Store user_name=Jiran as fact
 * and pref_framework=Fastify as preference") and the LLM extracts ALL memory-worthy
 * operations from it — supporting multiple store/delete/toggle in one go.
 */

import { AIMessage, SystemMessage } from '@langchain/core/messages';
import { Command, END, getConfig } from '@langchain/langgraph';
import { z } from 'zod';
import { invokeLLM } from '#/app-background/lib/utils/ai/invoke-llm';
import { emitNodeStart, emitNodeEnd } from '#/app-background/lib/utils/ai/emit-graph-event';
import { KernelEngine } from '#/shared/engines/kernel-engine';
import { buildErrorRecoveryCommand } from '../recovery-error-helper';
import { setMemory, deleteMemory as deleteStoreMemory } from '#/app-background/lib/utils/memory-utils';
import { writeActionOutput, writeActionResult } from '#/app-background/lib/utils/thread-storage';
import type { AceAgentV3State, MemoryItem } from '../../types';

// ── Structured output — JSON string in XML tag ────────────────────────────

/** Schema for the flat XML output — operations is a JSON string. */
const MemoryAction = z.object({
    operations: z
        .string()
        .describe(
            'JSON array of memory operations. Each operation: ' +
            '{"action":"store|delete|toggle","key":"...","value":"..."?,"type":"insight|fact|preference"?}. ' +
            'Output ONLY the JSON array — no extra text, no markdown fences. ' +
            'Example: [{"action":"store","key":"user_name","value":"Jiran","type":"fact"}]. ' +
            'Empty if nothing to do: [].',
        ),
});

/** Sub-schema for validating the parsed JSON array. */
const MemoryOperationsSchema = z.array(
    z.object({
        action: z.enum(['store', 'delete', 'toggle']),
        key: z.string().min(1),
        value: z.string().optional(),
        type: z.enum(['insight', 'fact', 'preference']).optional(),
    }),
);

// ── Prompt ────────────────────────────────────────────────────────────────

function memoryPrompt(state: AceAgentV3State, actionReason: string): string {
    const memories = state.memories ?? [];

    return [
        'You are a memory manager. Extract ALL memorable information from the given reason.',
        '',
        '### What To Remember',
        `"${actionReason}"`,
        '',
        '### Current Memories',
        memories.length === 0
            ? '(empty — nothing stored yet)'
            : memories.map(m =>
                `- [${m.key}] (${m.type}) is_expanded=${m.is_expanded} "${m.content}"`,
            ).join('\n'),
        '',
        '### Guidelines',
        '- Parse the reason carefully — extract EVERY piece of information worth storing.',
        '- For each piece, create one operation (store/delete/toggle).',
        '- If the user mentioned their name → store as "user_name" (type: fact).',
        '- If the user mentioned a preference → store as "pref_<thing>" (type: preference).',
        '- If the user mentioned project/environment info → store with descriptive key (type: fact).',
        '- If the user wants to FORGET something → use "delete" with the exact key.',
        '- Use snake_case keys (e.g. "user_name", "pref_framework", "proj_database").',
        '- Values should be concise summaries (1 sentence max).',
        '- If nothing new or actionable → output [].',
        '',
        '### Output Format',
        'Put the operations as a JSON array inside <operations>...</operations>.',
        'NO wrapping, NO markdown, NO extra text — just the XML tag with the JSON array.',
        '',
        'Examples:',
        'Reason: "Store user_name=Jiran as fact and pref_editor=VSCode as preference"',
        '<operations>[{"action":"store","key":"user_name","value":"Jiran","type":"fact"},{"action":"store","key":"pref_editor","value":"VSCode","type":"preference"}]</operations>',
        '',
        'Reason: "Delete old_db and update env to Ubuntu 24.04"',
        '<operations>[{"action":"delete","key":"old_db"},{"action":"store","key":"env_os","value":"Ubuntu 24.04","type":"fact"}]</operations>',
    ].join('\n');
}

// ── Helpers ────────────────────────────────────────────────────────────────

function generateId(): string {
    return `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function applyMemoryOperations(
    store: any,
    threadUid: string,
    memories: MemoryItem[],
    operations: Array<{ action: string; key: string; value?: string; type?: string }>,
): Promise<{ updated: MemoryItem[]; changed: string[] }> {
    let list = [...memories];
    const changed: string[] = [];

    for (const op of operations) {
        switch (op.action) {
            case 'store': {
                const idx = list.findIndex(m => m.key === op.key);
                const item: MemoryItem = {
                    id: idx >= 0 ? list[idx].id : generateId(),
                    key: op.key,
                    content: op.value ?? '',
                    type: (op.type as MemoryItem['type']) ?? 'fact',
                    is_expanded: idx >= 0 ? list[idx].is_expanded : true,
                };
                await setMemory(store, threadUid, item);
                if (idx >= 0) list[idx] = item;
                else list.push(item);
                changed.push(op.key);
                break;
            }
            case 'delete': {
                await deleteStoreMemory(store, threadUid, op.key);
                list = list.filter(m => m.key !== op.key);
                changed.push(op.key);
                break;
            }
            case 'toggle': {
                const target = list.find(m => m.key === op.key);
                if (target) {
                    target.is_expanded = !target.is_expanded;
                    await setMemory(store, threadUid, target);
                    changed.push(op.key);
                }
                break;
            }
        }
    }

    return { updated: list, changed };
}

// ── Node ───────────────────────────────────────────────────────────────────

export function createActionMemory() {
    return async function actionMemory(state: AceAgentV3State): Promise<Partial<AceAgentV3State> | Command> {
        try {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'action_memory', 'ace-v3', state).catch(() => {});

        if (threadUid && !KernelEngine.readMemory(`thread:active:${threadUid}`)) {
            return new Command({ goto: END });
        }

        const cycle = state.current_cycle;

        // Get the RUNNING action's reason — this tells us WHAT to remember
        const runningAction = cycle?.actions?.find(a => a.status === 'running');
        const actionReason = runningAction?.target?.reason ?? '';

        // Step 1: Ask LLM to extract ALL memory operations from the reason
        const { resolved } = await invokeLLM({
            runtime: getConfig() as never,
            structuredOutput: MemoryAction,
            messages: [new SystemMessage(memoryPrompt(state, actionReason))],
            nodeName: 'action_memory',
            graphName: 'ace-v3',
            maxRetries: 0,
            timeout: 10000,
            streaming: false,
        });

        // Step 1b: Parse JSON string → validate with sub-schema
        let operations: z.infer<typeof MemoryOperationsSchema> = [];
        const raw = resolved?.operations;
        if (raw && typeof raw === 'string') {
            try {
                const parsed = JSON.parse(raw);
                const validated = MemoryOperationsSchema.safeParse(parsed);
                if (validated.success) {
                    operations = validated.data;
                } else {
                    console.warn('[action_memory] operations parse failed:', validated.error.message);
                }
            } catch {
                console.warn('[action_memory] JSON.parse failed for operations:', raw.slice(0, 200));
            }
        }

        // Step 2: Apply all operations (syncs both state + LangGraph store)
        const store = (config as any)?.store;
        const { updated: updatedMemories, changed } = await applyMemoryOperations(
            store,
            threadUid ?? 'unknown',
            state.memories ?? [],
            operations,
        );

        // Write output & result pointers
        const cycleIndex = (state.cycles ?? []).length - 1;
        const runningActionIdx = cycle?.actions?.findIndex((a: any) => a.status === 'running') ?? 0;
        if (runningAction && threadUid) {
            runningAction.output = await writeActionOutput(threadUid, cycleIndex, runningActionIdx, { operations }).catch(() => '');
            runningAction.result = await writeActionResult(threadUid, cycleIndex, runningActionIdx, { changed }).catch(() => '');
        }

        const output: Partial<AceAgentV3State> = {
            memories: updatedMemories,
            current_cycle: cycle,
            target_node: 'action_dispatcher',
            from_node: 'action_memory',
        };

        if (threadUid)
            emitNodeEnd(threadUid, 'action_memory', 'ace-v3', output, {
                operationCount: operations.length,
                changedKeys: changed,
            }).catch(() => {});

        return output;
        } catch (error) {
            console.error('[action_memory] Error:', error);
            return buildErrorRecoveryCommand(error, 'action_memory');
        }
    };
}
