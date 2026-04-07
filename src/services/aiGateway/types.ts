export type SDKProvider = 'openai' | 'google' | 'anthropic';

// + =========================================================== +
// |                      AI Gateway TERMINOLOGY                 |         
// + =========================================================== +

// Terminology note: "session" in the context of the AI Gateway refers to a live interaction 
// session with a specific SDK/model, which may encompass multiple user turns and system responses. 
// This is distinct from "| ENTRY ||esses" in the Kernel, which are more general-purpose execution contexts. 
// Each AISession is tracked in the kernel memory for state management and UI reactivity.

// | SESSION | is the highest level of abstraction for an AI interaction, representing a continuous 
// conversation with a specific SDK/model. states and metadata about the session are stored in a dedicated RAM key, 
// and each session is associated.

// | TURN | is a single user input and the corresponding assistant response within a session. 
// Each turn can have multiple entries,

// | ENTRY | is a atomic part of the AI Whole Session, one entry is equal to one prompt chunk and one response chunk, 
// for now we keep it flexible with the content field but in the future we can make it more 
// strict with the type of content based on the renderer_slug


// NOTE : For mvp purpose i manage to put in the nested object for now
//        in the future volatile memory or high frequency updates might be better to be separated 
//        into different memory keys to avoid read/write conflicts and optimize performance.

// + =========================================================== +
// |                      AI Gateway Types                       |         
// + =========================================================== +

/**
 * A live session bound to a specific SDK + model combination.
 * Multiple sessions can run concurrently, each with independent stream buffers.
 */
export interface AISession {
    // Unique session ID, typically generated at session creation time. 
    // This is the primary identifier for the session.
    session_uid: string;
    process_uid: string;
    sdk: SDKProvider;
    model: string;

    // Current status of the session, which can be used to track 
    // its lifecycle and handle UI state accordingly.
    status: AISessionStatus;
    feedback_loop_status: AIFeedbackLoopStatus;

    // Turn is what the user sees as a single prompt/response pair, 
    // but we track entries within the turn for more granular updates and rendering.
    turn_index: number;
    turns : Array<{
        at: number; // Timestamp for when the turn started, useful for ordering and time-based logic.
        role: 'user' | 'assistant'; // Role of the turn initiator, which can be used for rendering and logic branching.
        active_entry_index : number | 0; // Index to track which entry is currently active within the turn, useful for streaming updates and UI focus.
        renderers : AIRenderer[]; // What displayed in the UI, each entry can have its own renderer for flexible representation. For example, a long user prompt might be split into multiple entries, and an assistant response might also come in multiple entries as it's streamed. Each entry can have its own renderer for flexible UI representation.

        // Entries represent the individual prompt/response chunks within a turn. For example, a 
        // user prompt might be split into multiple entries if it's long, and an assistant response 
        // might also come in multiple entries as it's streamed. Each entry can have its own renderer for 
        // flexible UI representation.
        entries : Map<number, Array<{
            prompt : string;
            composed_prompt : string; // For cases where the original prompt is transformed or augmented before being sent to the model, we can store the final composed prompt here for reference and debugging.
            response : string;
            blocks? : unknown; // Parsed blocks from the response, if applicable. The structure can be flexible to accommodate different types of block data depending on the use case and renderer requirements.
            status: AIResponseStatus;
        }>>;
    }>;

    // Contexting information that can be used for building the session context, such as summaries, relevant history, and other contextual data that can be fed back into the model for better responses. 
    // This is optional and can be populated based on the application's needs.
    plan: Array<{
        is_complete: boolean;
        detail?: string;
        [key: string]: string | number | boolean | object | unknown;
    }>;
    
    // Context entries that are generated throughout the session, which can include summaries, 
    // relevant history snippets, and other contextual information that has been deemed relevant at 
    // different points in the conversation. Each entry can have its own lifecycle and relevance based on 
    // the turn index at which it was generated, allowing for more dynamic and contextually appropriate 
    // feeding of information back into the model as the conversation progresses.
    context : Array<AIContextEntry>;
    
    // A more detailed history of the session, which can include parsed information, 
    // intermediate summaries, and other relevant data that has been generated throughout the session. 
    // This can be used for more advanced context management strategies, allowing the application to 
    // determine what information is most relevant to feed back into the model at different points in the 
    // conversation.
    history : Array<AIContextEntry>;
    history_start_index : number; 
    history_end_index: number;

    /** The RAM key currently being streamed into */
    active_output_memory_key?: string;

    // Protocol state for the current request, if applicable. This is used to track the lifecycle of 
    // prompt/response summaries and other context-building mechanisms.
    termination_requested?: boolean;
    active_abort_controller?: AbortController;
}

export interface AIContextEntry {
    summary? : string;
    status : 'active' | 'inactive';

    // For entries that are summaries or truncated content, this flag can indicate whether the full content 
    // should be loaded when accessed, allowing for more efficient memory usage and on-demand loading of context data.
    is_load_full_content?: boolean; 

    // The turn index at which this context was generated, 
    // useful for determining relevance and when to refresh the context
    lifecycle_turn? : number;
    payload ?: Record<string, unknown>;
}

export interface AIRenderer {
    // renderer_slug corresponds to a registered renderer in the ACE registry, typically under the "renderers" or 
    // "components" category of a package.

    //  This is how the TurnRendererItem component resolves which React 
    //  component to render for this entry.
    component_slug: string;
    package_ref?: string;

    status?: 'loading' | 'error' | 'completed';
    payload: string | object | unknown;
}

// + ========================================================== +
// |                    AI Gateway Constants                    |         
// + =========================================================== +

export const AI_SESSION_STATUS = {
    IDLE: 'idle',
    CONNECTED: 'connected',
    STREAMING: 'streaming',
    ERROR: 'error',
} as const;

export type AISessionStatus = typeof AI_SESSION_STATUS[keyof typeof AI_SESSION_STATUS];

export const AI_BLOCK_HANDLER_STATUS = {
    IDLE: 'idle',
    RUNNING: 'running',
    PARSING: 'parsing',
    FAILED: 'failed',
} as const;

export type AIBlockHandlerStatus = typeof AI_BLOCK_HANDLER_STATUS[keyof typeof AI_BLOCK_HANDLER_STATUS];

export const AI_RESPONSE_STATUS = {
    STREAMING: 'streaming',
    RUNNING: 'running',
    COMPLETED: 'completed',
    INTERRUPTED: 'interrupted',
    ERROR: 'error',
    FAILED: 'failed',
} as const;

export type AIResponseStatus = typeof AI_RESPONSE_STATUS[keyof typeof AI_RESPONSE_STATUS];

export const AI_FEEDBACK_LOOP_STATUS = {
    NONE: 'none',
    ACTIVE: 'active',
    COMPLETED: 'completed',
    INTERRUPTED: 'interrupted',
} as const;

export type AIFeedbackLoopStatus = typeof AI_FEEDBACK_LOOP_STATUS[keyof typeof AI_FEEDBACK_LOOP_STATUS];

export const AI_PROCESS_TYPE = {
    AI_SESSION_INSTANCE: 'ai:session:instance',
} as const;

export type AIProcessType = typeof AI_PROCESS_TYPE[keyof typeof AI_PROCESS_TYPE];



/** Read-only session shape for UI monitoring/debug panels. */
// export interface AISessionSnapshot {
//     sessionId: string;
//     sdk: SDKProvider;
//     model: string;
//     status: AISession['status'];
//     activeOutputRamKey?: string;
//     isInsideEventBlock: boolean;
//     activeEventBufferLength: number;
//     summary?: string;
//     turns?: Array<{ at: number; role: 'user' | 'assistant' | 'system'; text: string }>;
//     history_summaries?: Array<{
//         at: number;
//         block_slug: 'history_summary_ai_prompt' | 'history_summary_ai_response';
//         summary: string;
//         memory_key?: string;
//         ref_uid?: string;
//         payload: Record<string, unknown>;
//     }>;
//     context_blocks?: Array<{ at: number; payload: Record<string, unknown> }>;
//     used_contexts?: Array<{
//         key: string;
//         label: string;
//         kind: string;
//         detail?: string;
//         token_estimate?: number;
//     }>;
//     context_updated_at?: number;
//     protocol_state?: AIRequestProtocolState;
//     block_handler_state?: {
//         status: AIBlockHandlerStatus;
//         block_slug?: string;
//         action?: string;
//         event_name?: string;
//         result_memory_uid?: string;
//         updated_at?: number;
//     };
// }

/** A single parsed event block from an AI stream chunk */
// export interface ParsedBatchEvent {
//     headers: {
//         event_type: string;
//         window_uid: string;
//         process_uid?: string;
//         widget_uid?: string;
//         action: string;
//         sub_action?: string;
//     };
//     raw_payload_buffer: string;
//     is_complete: boolean;
//     payload_json: Record<string, unknown> | null;
//     payload_parse_error?: string;
// }

/** One chunk's worth of parsed output stored in RAM */
// export interface ParserBatchRecord {
//     batch_index: number;
//     received_at: number;
//     raw_chunk: string;
//     text_to_print: string;
//     events: ParsedBatchEvent[];
//     has_carryover_buffer: boolean;
// }
