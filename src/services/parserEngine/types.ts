import type {
    AIParseResult,
    ParserEmitPayload,
} from '#/schemas/parser';

export type ParserTokenTraceRecord = {
    sessionId?: string;
    at: number;
    sequenceNumber: number;
    inputBytes: number;
    inputPreview: string;
    carryoverInputBytes: number;
    carryoverPreview: string;
    outputBlocks: number;
    outputEvents: number;
    outputTextBytes: number;
    outputTextPreview: string;
    outputCarryoverBytes: number;
    outputCarryoverPreview: string;
    interruptRequested: boolean;
    interruptReason?: string;
};

export interface DispatchBlockInput {
    tag: string;
    body: string;
    payload_json: Record<string, unknown> | null;
    payload_parse_error?: string;
    isComplete: boolean;
    result: AIParseResult;
    sessionId?: string;
    processUid?: string;
    turnId?: string;
}

export interface EmitSessionResultInput {
    sessionId?: string;
    processUid?: string;
    parsedTag: string;
    payload: Record<string, unknown>;
}

export interface DispatchContextEmitInput extends ParserEmitPayload {
    block_id?: number;
    parsed_tag?: string;
}
