import type { BufferedAIEvent } from './ai_protocol';

export type ExecutionBlockType = 'execute_tool' | 'execute_storage';
export type ExecutionBlockStatus =
    | 'pending'
    | 'queued'
    | 'running'
    | 'completed'
    | 'error'
    | 'cancelled'
    | 'unknown';

export interface BaseBlock {
    type: string;
    payload_raw: string;
    payload_json: Record<string, unknown> | null;
    payload_parse_error?: string;
    is_complete: boolean;
}

export interface BaseExecutionBlock extends BaseBlock {
    type: ExecutionBlockType;
    status: ExecutionBlockStatus;
    memory_uid?: string;
    result_memory_uid?: string;
    operation?: string;
}

export interface ContextBlock extends BaseBlock {
    type: 'context';
}

export interface HistorySummaryBlock extends BaseBlock {
    type: 'history_summary_ai_prompt' | 'history_summary_ai_response';
}

export type AIMessageBlock =
    | { type: 'paragraph'; content: string }
    | { type: 'event'; event: BufferedAIEvent }
    | BaseExecutionBlock
    | ContextBlock
    | HistorySummaryBlock
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
    isComplete: boolean;
    result: AIParseResult;
}

export type ParserBlockHandler = (context: ParserBlockHandlerContext) => void;

export interface ParserBlockRuntime {
    package_name: string;
    slug: string;
    tag_name: string;
    aliases: string[];
    schema: BlockProtocolSchema;
    handler: ParserBlockHandler;
}
