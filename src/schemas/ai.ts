export type SDKProvider = 'openai' | 'google' | 'anthropic';
export type AIProvider = SDKProvider;

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


// DEV NOTE : For mvp purpose i manage to put in the nested object for now
//            in the future volatile memory or high frequency updates might be better to be separated 
//            into different memory keys to avoid read/write conflicts and optimize performance.

// + =========================================================== +
// |                      AI Gateway Types                       |         
// + =========================================================== +

// These phase labels are now primarily a backend-graph observability mirror on the client.
// They are not a client-owned ReAct controller anymore; they only describe the currently
// observed execution phase for session planning, prompt assembly, and parser-side tracing.
export type AISessionState =
    | 'reasoning'
    // High-level "Thinking" about the user's intent, at this moment the AI supposed to creating 
    // reasoning context for the next step, it can be tool selection, question for user, or 
    // even self-reflection on previous steps. Like getting relevant tools, relevant context, or even asking 
    // for clarification from the user.

    | 'acting'
    // At this state the AI should be executing the plan created in the previous step, 
    // this can include calling tools, asking questions to the user, or generating a response.
    // Update new context or memory based on the result of the action, this can include updating the session state,
    // adding new information to the context, or even updating the plan based on new information.

    | 'observing'
    // At this state the AI should be observing the latest context after taking the action, this can 
    // include the result of a tool call, the user's response to a question, or any new information that has been 
    // generated. The AI should be analyzing this new information and determining how it impacts the overall session, 
    // including whether the original plan is still valid or if it needs to be updated based on the new context.

    | 'finalizing'
// Packaging the result for the user, this can include formatting the response, ensuring that all necessary 
// information is included, and preparing the final output for delivery to the user.

export interface AISessionGraphState {
    // LangGraph-owned execution phase mirrored into client memory for observability.
    state: AISessionState;
    state_cycle_index: number;

    // Compatibility mirror for backend-run lifecycle. The frontend no longer owns autonomous continuation.
    autonomous_follow_up_loop_status: AIAutonomousFollowUpLoopStatus;
}

export interface AIActiveParserBlock {
    block_slug: string;
    package_ref?: string;
    lifecycle_turn?: number;
}

export interface AISessionContextState {
    // Contexting information that can be used for building the session context, such as summaries, relevant history,
    // and other contextual data that can be fed back into the model for better responses.
    plan: Array<AIPlanEntry>;

    // Parser block list parser that currently active in the session, this can be used to
    // efficiently load block context, schema used cased and etc.
    active_parser_blocks: Array<AIActiveParserBlock>;

    // Context entries are lightweight chaining-knowledge notes produced during the turn,
    // such as user intent, observed results, next plan, or other short-lived reasoning anchors.
    context: Array<AIContextEntry>;
    context_start_index: number;
    context_end_index: number;

    // Working memory ("The Workbench") stores massive raw payloads (like entire files or tool results)
    // without polluting the conversational thread.
    working_memory: Array<AIWorkingMemoryEntry>;

    // Turn-level history summaries keyed by turn index. When present, these replace raw
    // prompt/response replay in the prompt builder for the matching turn window.
    history: Record<number, AIHistoryEntry>;
    history_start_index: number;
    history_end_index: number;
}

/**
 * A live session bound to a specific provider + model combination.
 * Multiple sessions can run concurrently, each with independent stream buffers.
 */
export interface AISession {

    // Unique session ID, typically generated at session creation time. 
    // This is the primary identifier for the session.
    session_uid: string;
    process_uid: string;
    // Compatibility field kept as `sdk` for existing UI/config usage.
    // Semantically this now means the active provider binding for the backend LangGraph runtime.
    sdk?: SDKProvider | undefined;
    model?: string | undefined;

    // Current status of the session, which can be used to track 
    // its lifecycle and handle UI state accordingly.
    status: AISessionStatus;
    error_payload?: Record<string, unknown>;

    // Turn is what the user sees as a single prompt/response pair, 
    // but we track entries within the turn for more granular updates and rendering.
    turn_index: number;
    turns: Array<AITurn>; // We can have null entries for turns that haven't started yet or are in the process of being created.

    // Protocol state for the current request, if applicable. This is used to track the lifecycle of 
    // prompt/response summaries and other context-building mechanisms.
    termination_requested?: boolean;
    active_abort_controller?: AbortController;
}

export type AISessionRuntime = AISession & AISessionGraphState & AISessionContextState;

export type AIParserBlock = Record<string, never>;

export interface AITurn {
    at: number; // Timestamp for when the turn started, useful for ordering and time-based logic.
    status: AIResponseStatus;

    // Renderers for the user prompt, allowing for flexible UI representation of the prompt content.
    // Renderers for the assistant response, allowing for flexible UI representation of the response content.
    user_renderers: AIRenderer[];
    assistant_renderers: AIRenderer[];

    // Entries represent the individual prompt/response chunks within a turn. For example, a 
    // user prompt might be split into multiple entries if it's long, and an assistant response 
    // might also come in multiple entries as it's streamed. Each entry can have its own renderer for 
    // flexible UI representation.

    // Index to track which entry is currently active within the turn, useful for streaming updates and UI focus.
    active_entry_index: number | undefined;
    entries: AIEntry[]; // We can have null entries for entries that haven't started yet or are in the process of being created.
}

export interface AIEntry {
    // The type field can be used to differentiate between different kinds of entries, such as 'prompt_chunk', 
    // 'response_chunk', 'tool_interaction', etc. This allows for more flexible handling and rendering of 
    // different types of content within the turn.
    response: string;
    response_buffer_memory_uid: string | undefined;

    // For cases where the original prompt is transformed or augmented before being sent to 
    // the model, we can store the final composed prompt here for reference and debugging.
    prompt: string;
    composed_prompt: string;

    // To track retries of the interaction loop for the current turn, useful for debugging and UI feedback.
    active_interaction_loop_attempt?: number;

    // Optional network trace for the gateway request that produced this entry.
    // This is intended for local debugging in the session inspector.
    network_trace?: AINetworkTrace;

    // Parsed blocks from the response, if applicable. The structure can be flexible 
    // to accommodate different types of block data depending on the use case and renderer requirements.
    blocks?: AIBlock[];
    status: 'success' | 'error' | 'streaming' | 'completed' | 'interrupted' | 'failed';
}

export interface AINetworkTrace {
    request?: AINetworkRequestTrace;
    response?: AINetworkResponseTrace;
}

export interface AINetworkRequestTrace {
    at: number;
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
}

export interface AINetworkResponseTrace {
    at?: number;
    first_chunk_at?: number;
    completed_at?: number;
    status?: number;
    status_text?: string;
    ok?: boolean;
    headers?: Record<string, string>;
    body_preview?: string;
    streamed_chunk_count?: number;
    streamed_char_count?: number;
    duration_ms?: number;
    lifecycle?: 'pending' | 'streaming' | 'completed' | 'failed' | 'aborted';
    error_message?: string;
}

export interface AIBlock {
    // for reference, the block schema is defined in the ACE registry and can 
    // be used to determine how to handle and render the block content.
    session_uid: string;
    process_uid: string;

    turn_index: number;
    entry_index: number;
    block_index: number;

    block_slug: string; // This can be used to identify the type of block, such as 'tool_call', 'function_execution', 'code_snippet', etc.
    package_ref?: string; // Optional reference to a specific package that can handle this block, useful for routing to the correct handler or renderer.
    lifecycle_status?: AIBlockLifecycleStatus;
    opened_at?: number;
    updated_at?: number;
    completed_at?: number;
    aborted_at?: number;
    chunk_count?: number;
    runtime_context?: Record<string, unknown>;
    payload: {
        content: string; // The raw content of the block, which can be parsed and processed by the appropriate handler based on the block_slug and package_ref.
        [key: string]: unknown; // Additional fields can be included in the payload as needed for specific block types, allowing for flexible handling of different kinds of blocks.
    };
}

export interface AIContextEntry {
    at: number; // Timestamp for when the context entry was created, useful for ordering and time-based logic.
    title: string; // A brief title or label for the context entry, useful for UI display and the AI's understanding of the context.
    content: string;
    status: 'active' | 'inactive';

    // The turn index at which this context was generated, 
    // useful for determining relevance and when to refresh the context
    lifecycle_turn?: number;
    source?: 'langgraph-header' | 'langgraph-stream' | (string & {});
    mirrored_at?: number;
    payload?: Record<string, unknown>;
}

export interface AIHistoryEntry {
    at: number;
    turn_index: number;
    status: 'active' | 'inactive';
    lifecycle_turn?: number;
    prompt?: string;
    responses?: AIHistoryEvent[];
    payload?: Record<string, unknown>;
}

export interface AIHistoryEvent {
    index: number;
    block_slug: string;
    entry_index?: number;
    block_index?: number;
    status: 'allocated' | 'completed' | 'aborted';
    summary?: string;
    at: number;
    updated_at: number;
    payload?: Record<string, unknown>;
}

export interface AIWorkingMemoryEntry {
    uid: string; // E.g., 'wm_search_result_1', 'wm_file_user_ts'
    description: string; // Brief description of what this working memory holds
    content: string; // The potentially massive payload
    created_at: number;
    lifecycle_turn?: number;
    source?: 'langgraph-header' | 'langgraph-stream' | (string & {});
    mirrored_at?: number;
}

export interface AIPlanEntry {
    state: AISessionState;
    title: string;
    is_complete: boolean;
    detail?: string;
    step_index?: number;
    lifecycle_turn?: number;
    lifecycle_cycle?: number;
    source?: 'langgraph-header' | (string & {});
    mirrored_at?: number;
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

// =========================================================================
// AI Parser Protocol State (STREAMING PARSER CYCLE)
// =========================================================================
// Parser protocol state is the control signal emitted by a block handler after a single block is parsed.
// The parser loop processes one block at a time, then waits for this state before deciding whether the
// next block may continue or whether the current response should stop. Follow-up passes are now owned
// by the backend graph runtime rather than the frontend parser loop.
export const AIParserProtocolState = {
    // No parser work is currently active for the current session or entry.
    IDLE: 'idle',

    // A block is currently being parsed and the handler is still deciding the next parser step.
    PARSING: 'parsing',

    // The current block is safe and complete enough that the parser loop may continue to the next block.
    CONTINUE_NEXT_BLOCK: 'continue_next_block',

    // The current block completed and the current response should stop after this block.
    // The outer interaction loop may still decide whether to finalize or continue based on session state.
    STOP_CURRENT_RESPONSE: 'stop_current_response',

    // Compatibility-only signal from older client-driven autonomous continuation.
    // Current graph-driven flows should treat this as a stop boundary and allow the backend runtime
    // to decide whether another pass is needed.
    STOP_AND_CONTINUE_LOOP: 'stop_and_continue_loop',

    // The current parser flow intentionally stops without treating the block as a failure.
    INTERRUPTED: 'interrupted',

    // The current block parser finished its own responsibility and has no further parser work to do.
    COMPLETED: 'completed',

    // The current block parser failed and the surrounding loop should treat the parser phase as failed.
    ERROR: 'error',
} as const;

export type AIParserProtocolState = typeof AIParserProtocolState[keyof typeof AIParserProtocolState];

export const AIBlockLifecycleStatus = {
    STARTED: 'started',
    STREAMING: 'streaming',
    COMPLETED: 'completed',
    ABORTED: 'aborted',
    FAILED: 'failed',
} as const;

export type AIBlockLifecycleStatus = typeof AIBlockLifecycleStatus[keyof typeof AIBlockLifecycleStatus];

// These constants represent the various statuses that an AI session, turn, entry, or block handler can be in.
export const AISessionStatus = {
    IDLE: 'idle',
    STREAMING: 'streaming',
    ERROR: 'error',
} as const;

export type AISessionStatus = typeof AISessionStatus[keyof typeof AISessionStatus];


export const AIAutonomousFollowUpLoopStatus = {
    NONE: 'none',
    ACTIVE: 'active',
    COMPLETED: 'completed',
    INTERRUPTED: 'interrupted',
} as const;

export type AIAutonomousFollowUpLoopStatus = typeof AIAutonomousFollowUpLoopStatus[keyof typeof AIAutonomousFollowUpLoopStatus];

// These constants can be used to track the status of block handlers that are responsible for processing 
// specific blocks of content within the AI session, such as tool calls, function executions, or other 
// interactions that require separate handling logic.

export const AIResponseStatus = {
    STREAMING: 'streaming',
    RUNNING: 'running',
    COMPLETED: 'completed',
    INTERRUPTED: 'interrupted',
    ERROR: 'error',
    FAILED: 'failed',
} as const;

export type AIResponseStatus = typeof AIResponseStatus[keyof typeof AIResponseStatus];
// This constant can be used to identify the type of process that is responsible for managing AI sessions, 
// allowing for more organized process management and easier debugging.
export const AIProcessType = {
    AI_SESSION_INSTANCE: 'ai:session:instance',
} as const;

export type AIProcessType = typeof AIProcessType[keyof typeof AIProcessType];



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
