import type { AIContextEntry, AIPlanEntry, AISessionRuntime, AISessionState, AIWorkingMemoryEntry } from '#/schemas/ai';
import { KernelEngine } from '#/services/kernelEngine';

export type LangGraphSnapshotSource = 'langgraph-header' | 'langgraph-stream';

export interface LangGraphSnapshotPayload {
    session_state?: AISessionState | string;
    active_node?: string;
    response_node?: string;
    node_path?: unknown;
    state_path?: unknown;
    planning?: unknown;
    context?: unknown;
    memory?: unknown;
    emitted_at?: number;
    event_index?: number;
}

const LANGGRAPH_SESSION_STATES: AISessionState[] = ['reasoning', 'acting', 'observing', 'finalizing'];

export function mirrorLangGraphSessionSnapshotFromHeaders(session_uid: string, headers: Record<string, string>): void {
    mirrorLangGraphSessionSnapshot(session_uid, {
        session_state: headers['x-ace-langgraph-session-state'],
        active_node: headers['x-ace-langgraph-active-node'],
        response_node: headers['x-ace-langgraph-response-node'],
        node_path: parseLangGraphArray(headers['x-ace-langgraph-node-path']),
        state_path: parseLangGraphArray(headers['x-ace-langgraph-state-path']),
        planning: parseLangGraphArray(headers['x-ace-langgraph-planning']),
        context: parseLangGraphArray(headers['x-ace-langgraph-context']),
        memory: parseLangGraphArray(headers['x-ace-langgraph-memory']),
    }, 'langgraph-header');
}

export function mirrorLangGraphSessionSnapshot(
    session_uid: string,
    snapshot: LangGraphSnapshotPayload,
    source: LangGraphSnapshotSource,
): void {
    const rawState = snapshot.session_state;
    if (!rawState || !LANGGRAPH_SESSION_STATES.includes(rawState as AISessionState)) {
        return;
    }

    const nextState = rawState as AISessionState;
    const currentSessionState = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISessionRuntime;
    const previousState = currentSessionState.state;
    const now = snapshot.emitted_at ?? Date.now();
    const turnIndex = currentSessionState.turn_index;
    const nextCycleIndex = previousState === nextState
        ? currentSessionState.state_cycle_index ?? 0
        : (currentSessionState.state_cycle_index ?? 0) + 1;

    const planningItems = toStringArray(snapshot.planning);
    const contextItems = toStringArray(snapshot.context);
    const memoryItems = toStringArray(snapshot.memory);

    const mirroredPlan: AIPlanEntry[] = planningItems.map((item, index) => ({
        state: 'reasoning',
        title: `LangGraph plan ${index + 1}`,
        detail: item,
        is_complete: false,
        step_index: index,
        lifecycle_turn: turnIndex,
        lifecycle_cycle: nextCycleIndex,
        source,
        mirrored_at: now,
    }));

    const mirroredContext: AIContextEntry[] = contextItems.map((item, index) => ({
        at: now,
        title: `LangGraph context ${index + 1}`,
        content: item,
        status: 'active',
        lifecycle_turn: turnIndex,
        source,
        mirrored_at: now,
        payload: {
            source,
            index,
            active_node: snapshot.active_node,
            response_node: snapshot.response_node,
            event_index: snapshot.event_index,
            state_path: toStringArray(snapshot.state_path),
            node_path: toStringArray(snapshot.node_path),
        },
    }));

    const mirroredWorkingMemory: AIWorkingMemoryEntry[] = memoryItems.map((item, index) => ({
        uid: `langgraph-memory-${turnIndex}-${nextCycleIndex}-${index}`,
        description: `LangGraph memory snapshot ${index + 1}`,
        content: item,
        created_at: now,
        lifecycle_turn: turnIndex,
        source,
        mirrored_at: now,
    }));

    KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
        state: nextState,
        state_cycle_index: nextCycleIndex,
        plan: mirroredPlan,
        context: mirroredContext,
        context_start_index: 0,
        context_end_index: mirroredContext.length > 0 ? mirroredContext.length - 1 : 0,
        working_memory: mirroredWorkingMemory,
    } as Partial<AISessionRuntime>);
}

export function parseLangGraphArray(value?: string): string[] {
    if (!value) {
        return [];
    }

    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
        return [];
    }
}

function toStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
