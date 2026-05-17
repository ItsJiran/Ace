import { AIResponseStatus, type AIEntry, type AITurn } from "#/schemas/ai"

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
        prompt: obj.prompt ?? '',
        composed_prompt: obj.composed_prompt ?? '',
        request_metrics: obj.request_metrics,
        status: AIResponseStatus.STREAMING,

        active_interaction_loop_attempt: 0,
    } as AIEntry
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

export { initTurn, buildRenderer, buildTurnEntry }