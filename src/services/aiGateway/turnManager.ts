import { AIResponseStatus, type AIBlock, type AIEntry, type AITurn } from "./types"

const initTurn = (prompt: string): AITurn => {
    return {
        at : Date.now(),
        active_entry_index : null,
        user_renderers: [
            buildRenderer('paragraph_renderer', 'system', { text: prompt }),
        ],
        assistant_renderers: [],
        entries : [],
    }
}

const buildTurnEntry = (obj: Partial<AIEntry>) : AIEntry => {
    return {
        response : '',
        prompt : obj.prompt ?? '',
        composed_prompt : '',
        active_interaction_loop_attempt: 0, 
        blocks: [], 
        status: AIResponseStatus.STREAMING,
    } as AIEntry
}

const buildBlockEntry = (block_slug: string, package_ref?: string, payload?: Record<string, unknown>) : AIBlock => {
    return {
        block_slug: block_slug, // This can be used to identify the type of block, such as 'tool_call', 'function_execution', 'code_snippet', etc.
        package_ref: package_ref, // Optional reference to a specific package that can handle this block, useful for routing to the correct handler or renderer.
        payload: payload ?? {},
    } as AIBlock
}   

const buildRenderer = (componentSlug: string, packageRef: string, rendererData: Record<string, unknown>) => {
    return {
        component_slug: componentSlug,
        package_ref: packageRef,
        payload: rendererData,
    }
}

export { initTurn, buildRenderer, buildTurnEntry, buildBlockEntry }