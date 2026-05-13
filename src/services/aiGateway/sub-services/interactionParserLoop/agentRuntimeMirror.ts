import type { AIContextEntry, AIPlanEntry, AISessionRuntime, AISessionState, AIWorkingMemoryEntry } from '#/schemas/ai';
import { KernelEngine } from '#/services/kernelEngine';

export type AgentRuntimeSnapshotSource = 'deepagent-header' | 'deepagent-stream';

export interface AgentRuntimeSnapshotPayload {
    session_state?: AISessionState | string;
    active_step?: string;
    response_step?: string;
    step_path?: unknown;
    state_path?: unknown;
    planning?: unknown;
    context?: unknown;
    memory?: unknown;
    emitted_at?: number;
    event_index?: number;
}

const AGENT_SESSION_STATES: AISessionState[] = ['reasoning', 'acting', 'observing', 'finalizing'];

export function mirrorAgentRuntimeSnapshotFromHeaders(session_uid: string, headers: Record<string, string>): void {
    mirrorAgentRuntimeSnapshot(session_uid, {
        session_state: headers['x-ace-deepagent-session-state'],
        active_step: headers['x-ace-deepagent-active-step'],
        response_step: headers['x-ace-deepagent-response-step'],
        step_path: parseAgentRuntimeArray(headers['x-ace-deepagent-step-path']),
        state_path: parseAgentRuntimeArray(headers['x-ace-deepagent-state-path']),
        planning: parseAgentRuntimeArray(headers['x-ace-deepagent-planning']),
        context: parseAgentRuntimeArray(headers['x-ace-deepagent-context']),
        memory: parseAgentRuntimeArray(headers['x-ace-deepagent-memory']),
    }, 'deepagent-header');
}

export function mirrorAgentRuntimeSnapshot(
    session_uid: string,
    snapshot: AgentRuntimeSnapshotPayload,
    source: AgentRuntimeSnapshotSource,
): void {
    const rawState = snapshot.session_state;
    if (!rawState || !AGENT_SESSION_STATES.includes(rawState as AISessionState)) {
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
        title: `DeepAgent plan ${index + 1}`,
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
        title: `DeepAgent context ${index + 1}`,
        content: item,
        status: 'active',
        lifecycle_turn: turnIndex,
        source,
        mirrored_at: now,
        payload: {
            source,
            index,
            active_step: snapshot.active_step,
            response_step: snapshot.response_step,
            event_index: snapshot.event_index,
            state_path: toStringArray(snapshot.state_path),
            step_path: toStringArray(snapshot.step_path),
        },
    }));

    const mirroredWorkingMemory: AIWorkingMemoryEntry[] = memoryItems.map((item, index) => ({
        uid: `deepagent-memory-${turnIndex}-${nextCycleIndex}-${index}`,
        description: `DeepAgent memory snapshot ${index + 1}`,
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

export function parseAgentRuntimeArray(value?: string): string[] {
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
