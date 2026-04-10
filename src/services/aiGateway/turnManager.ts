import { AIResponseStatus, type AIBlock, type AIEntry, type AITurn } from "#/schemas/ai"

const initTurn = (prompt: string): AITurn => {
    return {
        at : Date.now(),
        status : AIResponseStatus.STREAMING,
        
        user_renderers: [
            buildRenderer('paragraph_renderer', 'system', { text: prompt }),
        ],
        assistant_renderers: [],

        entries : [],
        active_entry_index : undefined,
    }
}

const buildTurnEntry = (obj: Partial<AIEntry>) : AIEntry => {
    return {
        response : '',
        response_buffer_memory_uid : undefined,

        prompt : obj.prompt ?? '',
        composed_prompt : '',
        blocks: [], 
        status: AIResponseStatus.STREAMING,

        active_interaction_loop_attempt: 0, 
    } as AIEntry
}

const buildBlockEntry = (obj : Partial<AIBlock>) : AIBlock => {
    return {
        session_uid: obj.session_uid ?? '',
        process_uid: obj.process_uid ?? '',
        turn_index: obj.turn_index ?? 0,
        entry_index: obj.entry_index ?? 0,
        block_index: obj.block_index ?? 0,

        block_slug: obj.block_slug ?? '', // This can be used to identify the type of block, such as 'tool_call', 'function_execution', 'code_snippet', etc.
        package_ref: obj.package_ref ?? '', // Optional reference to a specific package that can handle this block, useful for routing to the correct handler or renderer.
        payload: obj.payload ?? {},
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