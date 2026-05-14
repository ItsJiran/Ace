import type { AIAceToolDescriptor, AIContextEntry, AIModelApiCallRecord, AIRenderer, AISessionRuntime, AITurn } from '#/schemas/ai';
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

    const nextSessionState = applyGatewayToolState(sessionState, snapshot);

    const nextTurn = applyModelApiMetrics({
        ...currentTurn,
        assistant_renderers: nextRenderers,
    }, snapshot);

    KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
        ...nextSessionState,
        turns: [
            ...sessionState.turns.slice(0, sessionState.turn_index),
            nextTurn,
        ],
    } as AISessionRuntime);
}

function applyGatewayToolState(
    sessionState: AISessionRuntime,
    snapshot: AgentRuntimeSnapshotPayload,
): AISessionRuntime {
    if (snapshot.type !== 'deepagent_activity') {
        return sessionState;
    }

    if (snapshot.event_type !== 'tool_finished' && snapshot.event_type !== 'tool_completed') {
        return sessionState;
    }

    const payload = isRecord(snapshot.payload) ? snapshot.payload : {};
    const data = isRecord(payload.data) ? payload.data : {};
    const output = extractToolResultPayload(data);
    let nextSessionState = sessionState;

    const nextContextRecords = extractContextRecords(output, nextSessionState.turn_index);
    if (nextContextRecords.length > 0) {
        nextSessionState = {
            ...nextSessionState,
            context_records: nextContextRecords,
        };
    }

    const nextKnownTools = mergeAceToolDescriptors(
        nextSessionState.known_ace_tools ?? [],
        extractAceToolDescriptors(output),
    );
    if (nextKnownTools.length !== (nextSessionState.known_ace_tools ?? []).length) {
        nextSessionState = {
            ...nextSessionState,
            known_ace_tools: nextKnownTools,
        };
    }

    return nextSessionState;
}

function extractContextRecords(output: Record<string, unknown>, turnIndex: number): AIContextEntry[] {
    const contextEntries = Array.isArray(output.context_entries) ? output.context_entries : [];
    const now = Date.now();

    return contextEntries
        .map((item, index): AIContextEntry | null => {
            const entry = isRecord(item) ? item : {};
            const title = typeof entry.name === 'string' && entry.name.trim().length > 0
                ? entry.name.trim()
                : `Context ${index + 1}`;
            const content = typeof entry.summary === 'string' && entry.summary.trim().length > 0
                ? entry.summary.trim()
                : '';
            if (!content) {
                return null;
            }

            return {
                at: now,
                title,
                content,
                status: 'active',
                lifecycle_turn: turnIndex,
                source: 'gateway-tool',
                mirrored_at: now,
                payload: {
                    raw_json: entry.raw_json,
                    entry_kind: 'session_context',
                },
            };
        })
        .filter((entry): entry is AIContextEntry => entry !== null);
}

function extractAceToolDescriptors(output: Record<string, unknown>): AIAceToolDescriptor[] {
    const descriptors: AIAceToolDescriptor[] = [];

    const aceTools = Array.isArray(output.ace_tools) ? output.ace_tools : [];
    descriptors.push(...aceTools.map(toAceToolDescriptor).filter((item): item is AIAceToolDescriptor => item !== null));

    const matches = Array.isArray(output.matches) ? output.matches : [];
    descriptors.push(...matches.map(toAceToolDescriptor).filter((item): item is AIAceToolDescriptor => item !== null));

    const matchingTools = Array.isArray(output.matching_tools) ? output.matching_tools : [];
    descriptors.push(...matchingTools
        .map((item) => isRecord(item) ? toAceToolDescriptor(item.ace_tool) : null)
        .filter((item): item is AIAceToolDescriptor => item !== null));

    const aceTool = toAceToolDescriptor(output.ace_tool);
    if (aceTool) {
        descriptors.push(aceTool);
    }

    return descriptors;
}

function mergeAceToolDescriptors(existing: AIAceToolDescriptor[], next: AIAceToolDescriptor[]): AIAceToolDescriptor[] {
    const merged = new Map<string, AIAceToolDescriptor>();
    for (const item of [...existing, ...next]) {
        const packageRef = typeof item.package_ref === 'string' ? item.package_ref.trim() : '';
        const slug = typeof item.slug === 'string' ? item.slug.trim() : '';
        if (!packageRef || !slug) {
            continue;
        }
        merged.set(`${packageRef}:${slug}`, item);
    }
    return [...merged.values()].sort((left, right) => `${left.package_ref}:${left.slug}`.localeCompare(`${right.package_ref}:${right.slug}`));
}

function toAceToolDescriptor(value: unknown): AIAceToolDescriptor | null {
    const item = isRecord(value) ? value : {};
    const slug = typeof item.slug === 'string' ? item.slug.trim() : '';
    const packageRef = typeof item.package_ref === 'string' ? item.package_ref.trim() : '';
    if (!slug || !packageRef) {
        return null;
    }

    return {
        kind: typeof item.kind === 'string' ? item.kind : undefined,
        slug,
        name: typeof item.name === 'string' ? item.name : undefined,
        description: typeof item.description === 'string' ? item.description : undefined,
        package_ref: packageRef,
        parameters: isRecord(item.parameters) ? item.parameters : undefined,
    };
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
    const nextRequest = currentEntry.network_trace?.request
        ? {
            ...currentEntry.network_trace.request,
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
        }
        : undefined;

    const nextEntry = {
        ...currentEntry,
        network_trace: {
            ...(currentEntry.network_trace ?? {}),
            ...(nextRequest ? { request: nextRequest } : {}),
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
    if (snapshot.type !== 'deepagent_activity') {
        return turn;
    }

    const payload = isRecord(snapshot.payload) ? snapshot.payload : {};
    const tokenMetrics = extractTokenMetrics(payload);

    if (snapshot.event_type === 'agent_finished') {
        return applyCompletedModelApiMetrics(turn, payload, tokenMetrics);
    }

    if (snapshot.event_type !== 'agent_started') {
        return turn;
    }

    const nextCall: AIModelApiCallRecord = {
        event_index: snapshot.event_index ?? -1,
        event_type: snapshot.event_type,
        provider: typeof payload.provider === 'string' ? payload.provider : undefined,
        model: typeof payload.model === 'string' ? payload.model : undefined,
        role: typeof payload.role === 'string' ? payload.role : undefined,
        profile_name: typeof payload.profile_name === 'string' ? payload.profile_name : undefined,
        at: Date.now(),
        ...tokenMetrics,
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

function applyCompletedModelApiMetrics(
    turn: AITurn,
    payload: Record<string, unknown>,
    tokenMetrics: Partial<AIModelApiCallRecord>,
): AITurn {
    const calls = turn.model_api_calls ?? [];
    if (calls.length === 0) {
        return {
            ...turn,
            model_api_call_count: 1,
            model_api_calls: [{
                event_index: -1,
                event_type: 'agent_finished',
                provider: typeof payload.provider === 'string' ? payload.provider : undefined,
                model: typeof payload.model === 'string' ? payload.model : undefined,
                role: typeof payload.role === 'string' ? payload.role : undefined,
                profile_name: typeof payload.profile_name === 'string' ? payload.profile_name : undefined,
                at: Date.now(),
                ...tokenMetrics,
            }],
        };
    }

    const nextCalls = [...calls];
    const matchIndex = findLastMatchingModelApiCallIndex(nextCalls, payload);
    const targetIndex = matchIndex >= 0 ? matchIndex : nextCalls.length - 1;
    nextCalls[targetIndex] = {
        ...nextCalls[targetIndex],
        ...tokenMetrics,
    };

    return {
        ...turn,
        model_api_calls: nextCalls,
    };
}

function findLastMatchingModelApiCallIndex(calls: AIModelApiCallRecord[], payload: Record<string, unknown>): number {
    const provider = typeof payload.provider === 'string' ? payload.provider : undefined;
    const model = typeof payload.model === 'string' ? payload.model : undefined;
    const profileName = typeof payload.profile_name === 'string' ? payload.profile_name : undefined;

    for (let index = calls.length - 1; index >= 0; index -= 1) {
        const call = calls[index];
        const providerMatches = !provider || call.provider === provider;
        const modelMatches = !model || call.model === model;
        const profileMatches = !profileName || call.profile_name === profileName;
        const alreadyHasTotals = typeof call.total_tokens === 'number'
            || typeof call.input_tokens === 'number'
            || typeof call.output_tokens === 'number';

        if (providerMatches && modelMatches && profileMatches && !alreadyHasTotals) {
            return index;
        }
    }

    return -1;
}

function extractTokenMetrics(payload: Record<string, unknown>): Partial<AIModelApiCallRecord> {
    const inputTokens = toFiniteNumber(payload.input_tokens) ?? toFiniteNumber(payload.prompt_tokens);
    const outputTokens = toFiniteNumber(payload.output_tokens) ?? toFiniteNumber(payload.completion_tokens);
    const totalTokens = toFiniteNumber(payload.total_tokens)
        ?? ((typeof inputTokens === 'number' && typeof outputTokens === 'number') ? inputTokens + outputTokens : undefined);

    return {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
        prompt_tokens: toFiniteNumber(payload.prompt_tokens),
        completion_tokens: toFiniteNumber(payload.completion_tokens),
        cache_creation_input_tokens: toFiniteNumber(payload.cache_creation_input_tokens),
        cache_read_input_tokens: toFiniteNumber(payload.cache_read_input_tokens),
    };
}

function toFiniteNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    return undefined;
}

function extractToolResultPayload(data: Record<string, unknown>): Record<string, unknown> {
    const directOutput = parseToolResultValue(data.output);
    if (directOutput) {
        return directOutput;
    }

    const directData = parseToolResultValue(data);
    if (directData) {
        return directData;
    }

    return {};
}

function parseToolResultValue(value: unknown): Record<string, unknown> | null {
    if (isRecord(value)) {
        return value;
    }

    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
        return null;
    }

    try {
        const parsed = JSON.parse(trimmed);
        return isRecord(parsed) ? parsed : null;
    } catch {
        return null;
    }
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
            active_agent: snapshot.active_agent,
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
