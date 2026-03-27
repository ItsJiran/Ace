import type { BufferedAIEvent } from '#/schemas/ai_protocol';

export interface BaseBlock {
    type: string;
    payload_raw: string;
    payload_json: Record<string, unknown> | null;
    payload_parse_error?: string;
    is_complete: boolean;
}

export type AIMessageBlock =
    | { type: 'paragraph'; content: string }
    | { type: 'event'; event: BufferedAIEvent }
    | BaseBlock
    | {
        type: 'directive';
        directive_name: string;
        content: string;
        is_complete: boolean;
    };

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
