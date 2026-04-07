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

// | ENTRY | is a atomic part of the AI Whole Session, one entry is equal to one prompt chunk or one response chunk, 
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
    sessionId: string;
    processUid: string;
    sdk: SDKProvider;
    model: string;

    // Current status of the session, which can be used to track 
    // its lifecycle and handle UI state accordingly.
    status: AISessionStatus;
    feedbackLoopStatus : AIFeedbackLoopStatus;

    // List of RAM keys for each turn's memory block, ordered by turn start time.
    turn_index: number;
    turns: Array<AISessionTurnUser | AISessionTurnAgent>;

    /** The RAM key currently being streamed into */
    activeOutputRamKey?: string;

    // Protocol state for the current request, if applicable. This is used to track the lifecycle of 
    // prompt/response summaries and other context-building mechanisms.
    termination_requested?: boolean;
    activeAbortController?: AbortController;
}

export interface AISessionTurnUser {
    at: number;
    role: 'user';
    active_entry_index : number | 0;
    entries : Array<{
        renderer?: EntryRenderer;
        raw_prompt: string;
        composed_prompt : string | null; 
    }>;
}

export interface AISessionTurnAgent {
    at: number;
    role: 'agent';
    active_entry_index : number | 0;
    entries : Array<{
        renderer?: EntryRenderer;
        blocks?: unknown; 
        raw_response: string;
        status: AIResponseStatus;
    }>;
}

export interface EntryRenderer {
    // renderer_slug corresponds to a registered renderer in the ACE registry, typically under the "renderers" or 
    // "components" category of a package.
    //  This is how the TurnRendererItem component resolves which React 
    //  component to render for this entry.
    renderer_slug: string;
    package_ref?: string;

    status?: 'loading' | 'error' | 'completed';
    content: string | object;
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
