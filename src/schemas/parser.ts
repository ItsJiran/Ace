export interface BaseBlock {
    /**
     * Block identity produced by parser runtime.
     * Examples: paragraph, event, directive, tool, storage, presentation, context.
     */
    type: string;
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
     * Avoid schema coupling in app layer; inspect payload_json by block type.
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
    if (expectedType && block.type !== expectedType) return null;
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
    tag: string;
    at: number;
    event_name?: string;
    interrupt_hint?: boolean;
    payload: Record<string, unknown>;
}

export interface ParserSessionStopSignal {
    session_id: string;
    tag: string;
    at: number;
    reason: string;
    interrupt_mode: ParserInterruptMode;
}

export interface BlockProtocolSchema {
    name: string;
    purpose: string;
    requiredFields?: string;
    optionalFields?: string;
    payloadNote?: string[];
    exampleLines: string[];
}

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
    slug: string;
    tag_name: string;
    aliases: string[];
    schema: BlockProtocolSchema;
    runtime_behavior?: ParserRuntimeBehavior;
    validator?: ParserBlockValidator;
    handler: ParserBlockHandler;
}
