export const PARSER_RUNTIME_EVENT = {
    BLOCK_DETECTED: 'parser_block_detected',
    BLOCK_REGISTRY_MISSING: 'parser_block_registry_missing',
    BLOCK_REGISTRY_FOUND: 'parser_block_registry_found',
    BLOCK_HANDLER_STARTED: 'parser_block_handler_started',
    BLOCK_HANDLER_COMPLETED: 'parser_block_handler_completed',
    BLOCK_HANDLER_FAILED: 'parser_block_handler_failed',
    BLOCK_VALIDATOR_FAILED: 'parser_block_validator_failed',
    PARSING_STARTED: 'parser_parsing_started',
    PARSING_COMPLETED: 'parser_parsing_completed',

    HANDLER_DISPATCH: 'parser_handler_dispatch',
    HANDLER_STARTED: 'parser_handler_started',
    HANDLER_RESULT: 'parser_handler_result',
    HANDLER_ERROR: 'parser_handler_error',

    TOOL_BLOCK_PARSED: 'tool_block_parsed',
    STORAGE_BLOCK_PARSED: 'storage_block_parsed',
    PRESENTATION_BLOCK_RESOLVED: 'presentation_block_resolved',
} as const;

export type ParserRuntimeEventName = (typeof PARSER_RUNTIME_EVENT)[keyof typeof PARSER_RUNTIME_EVENT];

export const PARSER_RUNNING_EVENT_NAMES: readonly ParserRuntimeEventName[] = [
    PARSER_RUNTIME_EVENT.BLOCK_HANDLER_STARTED,
    PARSER_RUNTIME_EVENT.HANDLER_DISPATCH,
    PARSER_RUNTIME_EVENT.HANDLER_STARTED,
] as const;

export const PARSER_COMPLETED_EVENT_NAMES: readonly ParserRuntimeEventName[] = [
    PARSER_RUNTIME_EVENT.BLOCK_HANDLER_COMPLETED,
    PARSER_RUNTIME_EVENT.HANDLER_RESULT,
] as const;

export const PARSER_FAILED_EVENT_NAMES: readonly ParserRuntimeEventName[] = [
    PARSER_RUNTIME_EVENT.BLOCK_HANDLER_FAILED,
    PARSER_RUNTIME_EVENT.HANDLER_ERROR,
] as const;

export const PARSER_BLOCK_STATUS_EVENT_NAMES: readonly ParserRuntimeEventName[] = [
    PARSER_RUNTIME_EVENT.BLOCK_REGISTRY_FOUND,
    PARSER_RUNTIME_EVENT.BLOCK_HANDLER_STARTED,
    PARSER_RUNTIME_EVENT.BLOCK_HANDLER_COMPLETED,
    PARSER_RUNTIME_EVENT.BLOCK_HANDLER_FAILED,
    PARSER_RUNTIME_EVENT.HANDLER_DISPATCH,
    PARSER_RUNTIME_EVENT.HANDLER_STARTED,
    PARSER_RUNTIME_EVENT.HANDLER_RESULT,
    PARSER_RUNTIME_EVENT.HANDLER_ERROR,
    PARSER_RUNTIME_EVENT.TOOL_BLOCK_PARSED,
    PARSER_RUNTIME_EVENT.STORAGE_BLOCK_PARSED,
] as const;

const parserRuntimeEventSet = new Set<string>(Object.values(PARSER_RUNTIME_EVENT));

export function isParserRuntimeEventName(value: unknown): value is ParserRuntimeEventName {
    return typeof value === 'string' && parserRuntimeEventSet.has(value);
}
