import { AIBlockLifecycleStatus, AIResponseStatus, type AIBlock, type AIEntry, type AITurn } from "#/schemas/ai"

const initTurn = (prompt: string): AITurn => {
    return {
        at: Date.now(),
        status: AIResponseStatus.STREAMING,
        model_api_call_count: 0,
        model_api_calls: [],

        user_renderers: [
            buildRenderer('paragraph_renderer', 'system', { text: prompt }),
        ],
        assistant_renderers: [],

        entries: [],
        active_entry_index: undefined,
    }
}

const buildTurnEntry = (obj: Partial<AIEntry>): AIEntry => {
    return {
        response: '',
        response_buffer_memory_uid: undefined,

        prompt: obj.prompt ?? '',
        composed_prompt: obj.composed_prompt ?? '',
        network_trace: obj.network_trace,
        blocks: [],
        status: AIResponseStatus.STREAMING,

        active_interaction_loop_attempt: 0,
    } as AIEntry
}

const buildBlockEntry = (obj: Partial<AIBlock>): AIBlock => {
    return {
        session_uid: obj.session_uid ?? '',
        process_uid: obj.process_uid ?? '',
        turn_index: obj.turn_index ?? 0,
        entry_index: obj.entry_index ?? 0,
        block_index: obj.block_index ?? 0,

        block_slug: obj.block_slug ?? '', // This can be used to identify the type of block, such as 'tool_call', 'function_execution', 'code_snippet', etc.
        package_ref: obj.package_ref ?? '', // Optional reference to a specific package that can handle this block, useful for routing to the correct handler or renderer.
        lifecycle_status: obj.lifecycle_status ?? AIBlockLifecycleStatus.STARTED,
        opened_at: obj.opened_at,
        updated_at: obj.updated_at,
        completed_at: obj.completed_at,
        aborted_at: obj.aborted_at,
        chunk_count: obj.chunk_count ?? 0,
        runtime_context: obj.runtime_context ?? {},
        payload: obj.payload ?? {},
    } as AIBlock
}

const buildRenderer = (
    componentSlug: string,
    packageRefOrRendererData: string | Record<string, unknown>,
    rendererData?: Record<string, unknown>,
) => {
    const packageRef = typeof packageRefOrRendererData === 'string' ? packageRefOrRendererData : undefined
    const payload = typeof packageRefOrRendererData === 'string'
        ? (rendererData ?? {})
        : packageRefOrRendererData

    return {
        component_slug: componentSlug,
        package_ref: packageRef,
        payload,
    }
}

export { initTurn, buildRenderer, buildTurnEntry, buildBlockEntry }