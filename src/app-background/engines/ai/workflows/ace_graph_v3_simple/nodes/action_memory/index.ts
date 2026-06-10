/**
 * Action: Memory — store, delete, or toggle agent memories.
 *
 * Flow:
 *   1. Invoke LLM to determine memory action from current context + plan.
 *   2. Execute the action on state.memories (store / delete / toggle).
 *   3. Return updated memories in state.
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

// ── Structured output ─────────────────────────────────────────────────────

const MemoryAction = z.object({
    action: z
        .enum(['store', 'delete', 'toggle', 'none'])
        .describe(
            'What to do with memory:\n' +
            '- store  — add or update a memory item (provide key, value, type).\n' +
            '- delete — remove a memory item by key.\n' +
            '- toggle — flip is_expanded on an existing memory item by key.\n' +
            '- none   — no memory change needed.',
        ),
    key: z
        .string()
        .describe('The memory key, e.g. "user_name", "pref_framework". Required for store/delete/toggle.'),
    value: z
        .string()
        .optional()
        .describe('The content to store (acts as summary for prompt injection). Required for "store" action.'),
    type: z
        .enum(['insight', 'fact', 'preference'])
        .optional()
        .describe('Memory type. Default: "insight".'),
});

// ── Prompt ────────────────────────────────────────────────────────────────

function memoryPrompt(state: AceAgentV3State): string {
    const cycle = state.current_cycle;
    const actionPlan = cycle?.actions?.[0]?.thought ?? 'Manage memory.';
    const memories = state.memories ?? [];

    return [
        'You are a memory manager. Decide what to do with the agent\'s memory based on the action plan.',
        '',
        '### Action Plan (from thought node)',
        `"${actionPlan}"`,
        '',
        '### Current Memories',
        memories.length === 0
            ? '(empty — nothing stored yet)'
            : memories.map(m =>
                `- [${m.key}] (${m.type}) is_expanded=${m.is_expanded} "${m.content}"`,
            ).join('\n'),
        '',
        '### Guidelines',
        '- If the plan says to REMEMBER or STORE something → use "store" with a descriptive key and value.',
        '- If the plan says to FORGET or DELETE something → use "delete" with the exact key.',
        '- If the plan says to ENABLE or DISABLE a memory → use "toggle" with the key.',
        '- If nothing needs to change → use "none".',
        '- Use snake_case keys (e.g. "user_name", "pref_framework").',
    ].join('\n');
}

// ── Helpers ────────────────────────────────────────────────────────────────

function generateId(): string {
    return `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function applyMemoryAction(
    store: any,
    threadUid: string,
    memories: MemoryItem[],
    action: string,
    key: string,
    value?: string,
    type?: string,
): Promise<MemoryItem[]> {
    const list = [...memories];

    switch (action) {
        case 'store': {
            const idx = list.findIndex(m => m.key === key);
            const item: MemoryItem = {
                id: idx >= 0 ? list[idx].id : generateId(),
                key,
                content: value ?? '',
                type: (type as MemoryItem['type']) ?? 'insight',
                is_expanded: idx >= 0 ? list[idx].is_expanded : true,
            };
            await setMemory(store, threadUid, item);
            if (idx >= 0) list[idx] = item;
            else list.push(item);
            break;
        }
        case 'delete': {
            await deleteStoreMemory(store, threadUid, key);
            return list.filter(m => m.key !== key);
        }
        case 'toggle': {
            const target = list.find(m => m.key === key);
            if (target) {
                target.is_expanded = !target.is_expanded;
                await setMemory(store, threadUid, target);
            }
            break;
        }
        case 'none':
        default:
            break;
    }

    return list;
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

        // Step 1: Ask LLM what memory action to take
        const { resolved } = await invokeLLM({
            runtime: getConfig() as never,
            structuredOutput: MemoryAction,
            messages: [new SystemMessage(memoryPrompt(state))],
            nodeName: 'action_memory',
            graphName: 'ace-v3',
            maxRetries: 0,
            timeout: 10000,
            streaming: false,
        });

        const memoryAction = resolved?.action ?? 'none';
        const key = resolved?.key ?? '';
        const value = resolved?.value;
        const memType = resolved?.type;

        // Step 2: Apply the action (syncs both state + LangGraph store)
        const store = (config as any)?.store;
        const cycle = state.current_cycle;
        const updatedMemories = await applyMemoryAction(
            store,
            threadUid ?? 'unknown',
            state.memories ?? [],
            memoryAction,
            key,
            value,
            memType,
        );

        // Write output & result pointers
        const cycleIndex = (state.cycles ?? []).length - 1;
        const runningActionIdx = cycle?.actions?.findIndex((a: any) => a.status === 'running') ?? 0;
        const runningAction = runningActionIdx >= 0 ? cycle?.actions?.[runningActionIdx] : undefined;
        if (runningAction && threadUid) {
            runningAction.output = await writeActionOutput(threadUid, cycleIndex, runningActionIdx, { action: memoryAction, key }).catch(() => '');
            runningAction.result = await writeActionResult(threadUid, cycleIndex, runningActionIdx, { updatedKeys: updatedMemories.map((m: any) => m.key) }).catch(() => '');
        }

        const output: Partial<AceAgentV3State> = {
            memories: updatedMemories,
            current_cycle: cycle,
            target_node: 'thought',
            from_node: 'action_memory',
        };

        if (threadUid)
            emitNodeEnd(threadUid, 'action_memory', 'ace-v3', output, {
                memoryAction,
                key,
            }).catch(() => {});

        return output;
        } catch (error) {
            console.error('[action_memory] Error:', error);
            return buildErrorRecoveryCommand(error, 'action_memory');
        }
    };
}

