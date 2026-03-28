export interface BaseBlock {
    /**
     * Block identity produced by parser runtime.
     * Examples: paragraph, event, directive, tool, storage, presentation, context.
     */
    block_slug: string;
    /**
     * Raw body text as received by parser for this block.
     * For plain paragraph segments, this is the paragraph text itself.
     */
    payload_raw: string;
    /**
     * Parsed/normalized payload for downstream consumers.
     * Use this as the primary cross-layer communication contract.
     */
    payload_json: Record<string, unknown> | null;
    /**
     * Optional parse error message when payload_json could not be parsed.
     * Kept for observability/debugging without breaking stream continuity.
     */
    payload_parse_error?: string;
    /**
     * Whether parser has received a complete block payload.
     * Incomplete blocks may continue in subsequent chunks.
     */
    is_complete: boolean;
    /**
     * Extra runtime metadata emitted by specific handlers.
     * Avoid schema coupling in app layer; inspect payload_json by block_slug.
     */
    [key: string]: unknown;
}

export type AIMessageBlock = BaseBlock;

export function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Read a typed payload from a generic parser block.
 * Optional expectedType keeps readers decoupled while still allowing strict type checks.
 */
export function getBlockPayloadAs<T>(block: BaseBlock | null | undefined, expectedType?: string): T | null {
    if (!block) return null;
    if (expectedType && block.block_slug !== expectedType) return null;
    if (!isObjectRecord(block.payload_json)) return null;
    return block.payload_json as T;
}

export interface AIParseResult {
    blocks: AIMessageBlock[];
    events: BufferedAIEvent[];
    textToPrint: string;
    carryoverBuffer: string;
    interrupt_requested?: boolean;
    interrupt_reason?: string;
}

export type ParserInterruptMode = 'none' | 'pause_stream' | 'hard_stop';

export interface ParserRuntimeBehavior {
    interrupt_mode?: ParserInterruptMode;
    interrupt_on_complete?: boolean;
}

export interface ParserEmitPayload {
    event_name?: string;
    interrupt_hint?: boolean;
    [key: string]: unknown;
}

export interface ParserSessionEmitRecord {
    session_id: string;
    /** Exact tag token parsed from the stream, before canonical block_slug resolution. */
    parsed_tag: string;
    at: number;
    event_name?: string;
    interrupt_hint?: boolean;
    payload: Record<string, unknown>;
}

export interface ParserSessionStopSignal {
    session_id: string;
    /** Exact tag token parsed from the stream that requested the stop signal. */
    parsed_tag: string;
    at: number;
    reason: string;
    interrupt_mode: ParserInterruptMode;
}

export interface BlockProtocolSchema {
    /** Canonical runtime block tag. This must match the parser slug. */
    name: string;
    purpose: string;
    requiredFields?: string;
    optionalFields?: string;
    payloadNote?: string[];
    exampleLines: string[];
    
    /**
     * Trigger conditions: describes WHEN and WHY this block parser is invoked.
     * Used to inform AI context about appropriate block usage patterns.
     * Examples:
     *   - "Called when user requests tool listing or parameter inspection"
     *   - "Triggered automatically after user confirmation for tool execution"
     */
    triggerConditions?: string[];
    
    /**
     * Prompt context examples: sample user/system prompts that should trigger
     * this block type. Helps AI understand natural language intent patterns.
     * Examples:
     *   - "List all available tools in the system"
     *   - "Show me the parameters for the file-search tool"
     */
    promptExamples?: string[];
}

/**
 * Runtime arguments passed into a parser block handler.
 *
 * Contract notes:
 * 1. `tag` is the exact parsed block tag from the stream. For canonical system
 *    blocks this should match the parser slug; namespaced tags preserve the
 *    original namespaced form.
 * 2. `body` is the raw block body between opening and closing tags.
 * 3. `payload_json` is the parsed JSON object when available, or null when the
 *    body is empty / invalid / non-JSON.
 * 4. `payload_parse_error` carries JSON parse failure text without aborting the stream.
 * 5. `isComplete` indicates whether the closing tag has been fully received.
 * 6. `result` is the mutable parse accumulator; handlers append blocks/events here.
 * 7. `session_id` and `block_id` are runtime observability fields when parsing
 *    occurs in a tracked session.
 * 8. `emit_result()` publishes handler lifecycle/result payloads into parser runtime
 *    observability channels.
 * 9. `request_interrupt()` asks the gateway loop to pause/stop after this block.
 */
export interface ParserBlockHandlerContext {
    tag: string;
    body: string;
    payload_json: Record<string, unknown> | null;
    payload_parse_error?: string;
    isComplete: boolean;
    result: AIParseResult;
    session_id?: string;
    block_id?: number;
    emit_result?: (payload: ParserEmitPayload) => void;
    request_interrupt?: (reason?: string) => void;
}

/**
 * Runtime arguments passed into a parser validator before handler execution.
 *
 * Validators may:
 * 1. throw to reject malformed complete payloads,
 * 2. return a normalized payload object to replace `payload_json`, or
 * 3. return void/null to keep the original parsed payload.
 */
export interface ParserBlockValidatorContext {
    tag: string;
    body: string;
    payload_json: Record<string, unknown> | null;
    payload_parse_error?: string;
    isComplete: boolean;
    session_id?: string;
    block_id?: number;
}

export type ParserBlockValidator = (
    context: ParserBlockValidatorContext,
) => Record<string, unknown> | null | void;

export type ParserBlockHandler = (context: ParserBlockHandlerContext) => void;

export interface ParserBlockRuntime {
    package_name: string;
    /** Canonical runtime identity for parser resolution and block tags. */
    slug: string;
    aliases: string[];
    schema: BlockProtocolSchema;
    runtime_behavior?: ParserRuntimeBehavior;
    validator?: ParserBlockValidator;
    handler: ParserBlockHandler;
}
