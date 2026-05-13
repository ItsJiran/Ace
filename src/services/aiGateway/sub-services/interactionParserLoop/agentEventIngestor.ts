import type { AIModelApiCallRecord, AIRenderer, AISessionRuntime, AITurn } from '#/schemas/ai';
import { EventBus } from '#/services/eventEngine';
import { KernelEngine } from '#/services/kernelEngine';
import * as TurnRenderer from '#/services/aiGateway/turnManager';
import type { AgentRuntimeSnapshotPayload } from './agentRuntimeMirror';

const RUNTIME_EVENT_RENDERER_KEY = 'deepagent-runtime-event';
const RUNTIME_TODO_RENDERER_KEY = 'deepagent-runtime-todo';

interface AgentRuntimeTodoItem {
    title?: string;
    detail?: string;
    step_index?: number;
    is_complete?: boolean;
}

export function ingestAgentRuntimeEvent(session_uid: string, snapshot: AgentRuntimeSnapshotPayload): void {
    const sessionState = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISessionRuntime | undefined;
    if (!sessionState) return;

    const currentTurn = sessionState.turns?.[sessionState.turn_index];
    if (!currentTurn) return;

    if (snapshot.type === 'deepagent_debug_prompt') {
        persistGatewayPromptDebug(session_uid, sessionState, currentTurn, snapshot);
        return;
    }

    const todoItems = toTodoItems(snapshot.todo_items);
    const planningItems = todoItems.length > 0
        ? todoItems.map((item) => item.detail ?? item.title ?? '')
        : toStringArray(snapshot.planning);
    const statePath = toStringArray(snapshot.state_path);
    const stepPath = toStringArray(snapshot.step_path);

    const nextRenderers = [...(currentTurn.assistant_renderers ?? [])];
    const eventRendererKey = resolveEventRendererKey(snapshot);
    upsertRenderer(
        nextRenderers,
        buildRuntimeEventRenderer(snapshot, statePath, stepPath, eventRendererKey),
        eventRendererKey,
    );

    if (snapshot.type === 'deepagent_snapshot' && planningItems.length > 0) {
        upsertRenderer(
            nextRenderers,
            buildRuntimeTodoRenderer(snapshot, planningItems, todoItems),
            RUNTIME_TODO_RENDERER_KEY,
        );
    }

    maybeDispatchAceToolExecutionIntent(session_uid, sessionState, snapshot);

    const nextTurn = applyModelApiMetrics({
        ...currentTurn,
        assistant_renderers: nextRenderers,
    }, snapshot);

    KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
        ...sessionState,
        turns: [
            ...sessionState.turns.slice(0, sessionState.turn_index),
            nextTurn,
        ],
    } as AISessionRuntime);
}

function persistGatewayPromptDebug(
    session_uid: string,
    sessionState: AISessionRuntime,
    currentTurn: AITurn,
    snapshot: AgentRuntimeSnapshotPayload,
): void {
    const activeEntryIndex = currentTurn.active_entry_index;
    if (typeof activeEntryIndex !== 'number') {
        return;
    }

    const currentEntry = currentTurn.entries?.[activeEntryIndex];
    if (!currentEntry) {
        return;
    }

    const payload = isRecord(snapshot.payload) ? snapshot.payload : {};
    const requestBody = currentEntry.network_trace?.request?.body;
    const existingRequestBody = isRecord(requestBody) ? requestBody : {};

    const nextEntry = {
        ...currentEntry,
        network_trace: {
            ...(currentEntry.network_trace ?? {}),
            request: {
                ...(currentEntry.network_trace?.request ?? {}),
                body: {
                    ...existingRequestBody,
                    gateway_agent_profile: typeof payload.gateway_agent_profile === 'string'
                        ? payload.gateway_agent_profile
                        : existingRequestBody.gateway_agent_profile,
                    gateway_agent_system_prompt: typeof payload.gateway_agent_system_prompt === 'string'
                        ? payload.gateway_agent_system_prompt
                        : existingRequestBody.gateway_agent_system_prompt,
                    gateway_agent_messages: Array.isArray(payload.gateway_agent_messages)
                        ? payload.gateway_agent_messages
                        : existingRequestBody.gateway_agent_messages,
                    gateway_agent_tools: Array.isArray(payload.gateway_agent_tools)
                        ? payload.gateway_agent_tools
                        : existingRequestBody.gateway_agent_tools,
                    gateway_agent_memory: Array.isArray(payload.gateway_agent_memory)
                        ? payload.gateway_agent_memory
                        : existingRequestBody.gateway_agent_memory,
                    gateway_prompt_debug_provider: typeof payload.provider === 'string'
                        ? payload.provider
                        : existingRequestBody.gateway_prompt_debug_provider,
                    gateway_prompt_debug_model: typeof payload.model === 'string'
                        ? payload.model
                        : existingRequestBody.gateway_prompt_debug_model,
                },
            },
        },
    };

    const nextEntries = [...currentTurn.entries];
    nextEntries[activeEntryIndex] = nextEntry;

    KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
        ...sessionState,
        turns: [
            ...sessionState.turns.slice(0, sessionState.turn_index),
            {
                ...currentTurn,
                entries: nextEntries,
            },
        ],
    } as AISessionRuntime);
}

function applyModelApiMetrics(turn: AITurn, snapshot: AgentRuntimeSnapshotPayload): AITurn {
    if (snapshot.type !== 'deepagent_activity' || snapshot.event_type !== 'agent_started') {
        return turn;
    }

    const payload = isRecord(snapshot.payload) ? snapshot.payload : {};
    const nextCall: AIModelApiCallRecord = {
        event_index: snapshot.event_index ?? -1,
        event_type: snapshot.event_type,
        provider: typeof payload.provider === 'string' ? payload.provider : undefined,
        model: typeof payload.model === 'string' ? payload.model : undefined,
        role: typeof payload.role === 'string' ? payload.role : undefined,
        profile_name: typeof payload.profile_name === 'string' ? payload.profile_name : undefined,
        at: Date.now(),
    };

    const calls = turn.model_api_calls ?? [];
    const alreadyCounted = calls.some((call) => call.event_index === nextCall.event_index);
    if (alreadyCounted) {
        return turn;
    }

    return {
        ...turn,
        model_api_call_count: (turn.model_api_call_count ?? 0) + 1,
        model_api_calls: [...calls, nextCall],
    };
}

function maybeDispatchAceToolExecutionIntent(
    session_uid: string,
    sessionState: AISessionRuntime,
    snapshot: AgentRuntimeSnapshotPayload,
): void {
    if (snapshot.type !== 'deepagent_activity') {
        return;
    }

    if (snapshot.event_type !== 'tool_finished' && snapshot.event_type !== 'tool_completed') {
        return;
    }

    const payload = isRecord(snapshot.payload) ? snapshot.payload : {};
    if (payload.node_name !== 'request_ace_tool_execution') {
        return;
    }

    const data = isRecord(payload.data) ? payload.data : {};
    const output = isRecord(data.output) ? data.output : {};
    const executionIntent = isRecord(output.execution_intent) ? output.execution_intent : {};

    const packageRef = typeof executionIntent.package_ref === 'string' ? executionIntent.package_ref : '';
    const toolSlug = typeof executionIntent.tool_slug === 'string' ? executionIntent.tool_slug : '';
    const toolPayload = isRecord(executionIntent.payload) ? executionIntent.payload : {};

    if (!packageRef || !toolSlug) {
        return;
    }

    const dispatchMemoryKey = `system:ai_session:${session_uid}:gateway_tool_dispatch:${snapshot.event_index ?? 'unknown'}:${packageRef}:${toolSlug}`;
    if (KernelEngine.readMemory(dispatchMemoryKey)) {
        return;
    }

    KernelEngine.createMemoryIfNotExist(dispatchMemoryKey, {
        dispatched_at: Date.now(),
        package_ref: packageRef,
        tool_slug: toolSlug,
    }, sessionState.process_uid);

    EventBus.emit({
        event_type: 'interaction',
        action: 'execute_tool',
        process_uid: sessionState.process_uid,
        payload: {
            package_ref: packageRef,
            tool_slug: toolSlug,
            payload: toolPayload,
            source: 'gateway_tool_intent',
        },
        preallocated_memory: {
            parent_process_uid: sessionState.process_uid,
            session_id: session_uid,
            gateway_tool_intent_key: dispatchMemoryKey,
        },
    });
}

function buildRuntimeEventRenderer(
    snapshot: AgentRuntimeSnapshotPayload,
    statePath: string[],
    stepPath: string[],
    eventKey: string,
): AIRenderer {
    const payload = isRecord(snapshot.payload) ? snapshot.payload : {};
    const componentSlug = resolveEventRendererComponent(snapshot);
    const eventPayload = {
        event_key: eventKey,
        event_type: snapshot.event_type ?? 'deepagent_runtime',
        action: snapshot.action ?? snapshot.active_step ?? snapshot.response_step ?? 'runtime',
        status: mapSnapshotStatus(snapshot),
        payload: {
            ...payload,
            session_state: snapshot.session_state,
            active_step: snapshot.active_step,
            response_step: snapshot.response_step,
            state_path: statePath,
            step_path: stepPath,
            event_index: snapshot.event_index,
        },
    };

    return {
        ...TurnRenderer.buildRenderer(componentSlug, 'system', toRendererPayload(snapshot, eventPayload)),
        status: mapSnapshotStatus(snapshot),
    };
}

function resolveEventRendererComponent(snapshot: AgentRuntimeSnapshotPayload): string {
    const eventType = snapshot.event_type ?? '';
    if (eventType.startsWith('tool_')) {
        return 'tool-renderer';
    }

    if (eventType.startsWith('agent_') || eventType.startsWith('chain_')) {
        return 'agent-activity-renderer';
    }

    return 'event-renderer';
}

function toRendererPayload(snapshot: AgentRuntimeSnapshotPayload, eventPayload: Record<string, unknown>): Record<string, unknown> {
    if ((snapshot.event_type ?? '').startsWith('tool_')) {
        const payload = isRecord(snapshot.payload) ? snapshot.payload : {};
        const data = isRecord(payload.data) ? payload.data : {};
        const metadata = isRecord(payload.metadata) ? payload.metadata : {};

        return {
            event_key: eventPayload.event_key,
            event_type: eventPayload.event_type,
            action: eventPayload.action,
            status: eventPayload.status,
            tool_slug: typeof payload.node_name === 'string' ? payload.node_name : String(eventPayload.action ?? 'tool'),
            package_ref: typeof metadata.ls_provider === 'string' ? metadata.ls_provider : 'deepagent-runtime',
            result: data,
            error_message: typeof payload.error_message === 'string' ? payload.error_message : undefined,
            payload,
        };
    }

    if ((snapshot.event_type ?? '').startsWith('agent_') || (snapshot.event_type ?? '').startsWith('chain_')) {
        const payload = isRecord(snapshot.payload) ? snapshot.payload : {};

        return {
            event_key: eventPayload.event_key,
            event_type: eventPayload.event_type,
            action: eventPayload.action,
            status: eventPayload.status,
            role: typeof payload.role === 'string' ? payload.role : 'runtime',
            profile_name: typeof payload.profile_name === 'string' ? payload.profile_name : payload.role,
            error_message: typeof payload.error_message === 'string' ? payload.error_message : undefined,
            payload,
        };
    }

    return eventPayload;
}

function resolveEventRendererKey(snapshot: AgentRuntimeSnapshotPayload): string {
    if (snapshot.type === 'deepagent_activity') {
        const eventType = snapshot.event_type ?? 'runtime';
        const payload = isRecord(snapshot.payload) ? snapshot.payload : {};
        const runId = typeof payload.run_id === 'string' ? payload.run_id : undefined;
        const action = typeof snapshot.action === 'string'
            ? snapshot.action
            : typeof payload.node_name === 'string'
                ? payload.node_name
                : 'runtime';
        const role = typeof payload.role === 'string' ? payload.role : 'runtime';

        if (runId) {
            return `deepagent-activity:${resolveEventFamily(eventType)}:${runId}`;
        }

        if (eventType.startsWith('tool_')) {
            return `deepagent-activity:tool:${action}`;
        }

        if (eventType.startsWith('agent_') || eventType.startsWith('chain_')) {
            return `deepagent-activity:${resolveEventFamily(eventType)}:${role}:${action}`;
        }

        return `deepagent-activity:${resolveEventFamily(eventType)}:${action}`;
    }

    return RUNTIME_EVENT_RENDERER_KEY;
}

function resolveEventFamily(eventType: string): string {
    if (eventType.startsWith('tool_')) {
        return 'tool';
    }

    if (eventType.startsWith('agent_')) {
        return 'agent';
    }

    if (eventType.startsWith('chain_')) {
        return 'chain';
    }

    return 'runtime';
}

function buildRuntimeTodoRenderer(
    snapshot: AgentRuntimeSnapshotPayload,
    planningItems: string[],
    todoItems: AgentRuntimeTodoItem[],
): AIRenderer {
    const payload = isRecord(snapshot.payload) ? snapshot.payload : {};
    const normalizedTodoItems = todoItems.length > 0
        ? todoItems.map((item, index) => ({
            title: item.title ?? `Step ${index + 1}`,
            detail: item.detail,
            step_index: item.step_index ?? index,
            is_complete: item.is_complete === true,
        }))
        : planningItems.map((detail, index) => ({
            title: `Step ${index + 1}`,
            detail,
            step_index: index,
            is_complete: false,
        }));

    return {
        ...TurnRenderer.buildRenderer('todo-renderer', 'system', {
            event_key: RUNTIME_TODO_RENDERER_KEY,
            title: typeof payload.title === 'string' ? payload.title : 'Current Plan',
            todo_items: normalizedTodoItems,
        }),
        status: mapSnapshotStatus(snapshot),
    };
}

function upsertRenderer(renderers: AIRenderer[], nextRenderer: AIRenderer, eventKey: string): void {
    const existingIndex = renderers.findIndex((renderer) => {
        if (!renderer.payload || typeof renderer.payload !== 'object') return false;
        return 'event_key' in renderer.payload && renderer.payload.event_key === eventKey;
    });

    if (existingIndex === -1) {
        renderers.push(nextRenderer);
        return;
    }

    renderers[existingIndex] = nextRenderer;
}

function mapSnapshotStatus(snapshot: AgentRuntimeSnapshotPayload): 'running' | 'loading' | 'error' | 'completed' {
    if (snapshot.status === 'error') {
        return 'error';
    }

    if (snapshot.status === 'completed') {
        return 'completed';
    }

    if (snapshot.status === 'running') {
        return 'running';
    }

    if (snapshot.session_state === 'finalizing') {
        return 'completed';
    }

    return 'loading';
}

function toStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function toTodoItems(value: unknown): AgentRuntimeTodoItem[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.filter((item): item is AgentRuntimeTodoItem => {
        if (!item || typeof item !== 'object') return false;
        const candidate = item as Record<string, unknown>;
        return typeof candidate.title === 'string' || typeof candidate.detail === 'string';
    });
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}
