/**
 * Agent Recoverable Errors — typed error classes for the recovery_error node.
 *
 * Each error carries a `code` that recovery_error uses in a switch/case
 * to decide the appropriate recovery strategy:
 *
 *   PARSING_XML_ERROR  → route to thought (agent can fix the XML)
 *   NETWORK_LLM_ERROR  → interrupt() with "Continue" button
 *   UNKNOWN            → route to thought (generic fallback)
 */

// ── Base ───────────────────────────────────────────────────────────────────

export class AgentRecoverableError extends Error {
    public readonly code: string;
    public readonly nodeName: string;

    constructor(message: string, code: string, nodeName: string) {
        super(message);
        this.name = 'AgentRecoverableError';
        this.code = code;
        this.nodeName = nodeName;
    }
}

// ── Specific errors ────────────────────────────────────────────────────────

export class NetworkLLMError extends AgentRecoverableError {
    constructor(message: string, nodeName: string) {
        super(message, 'NETWORK_LLM_ERROR', nodeName);
        this.name = 'NetworkLLMError';
    }
}

export class ParsingXMLError extends AgentRecoverableError {
    constructor(message: string, nodeName: string) {
        super(message, 'PARSING_XML_ERROR', nodeName);
        this.name = 'ParsingXMLError';
    }
}

export class APIKeyNotResolvedError extends AgentRecoverableError {
    constructor(message: string, nodeName: string) {
        super(message, 'API_KEY_NOT_RESOLVED', nodeName);
        this.name = 'APIKeyNotResolvedError';
    }
}

// ── Serialization (errors can't cross LangGraph state as objects) ──────────

export interface SerializedAgentError {
    code: string;
    name: string;
    message: string;
    node: string;
}

export function serializeAgentError(error: unknown, fallbackNode?: string): SerializedAgentError {
    if (error instanceof AgentRecoverableError) {
        return {
            code: error.code,
            name: error.name,
            message: error.message,
            node: error.nodeName || fallbackNode || 'unknown',
        };
    }

    if (error instanceof Error) {
        return {
            code: 'UNKNOWN',
            name: error.name,
            message: error.message,
            node: fallbackNode || 'unknown',
        };
    }

    return {
        code: 'UNKNOWN',
        name: 'Error',
        message: String(error),
        node: fallbackNode || 'unknown',
    };
}

export function deserializeAgentError(json: string | undefined): SerializedAgentError {
    if (!json) {
        return { code: 'UNKNOWN', name: 'Error', message: 'Empty error payload.', node: 'unknown' };
    }
    try {
        const parsed = JSON.parse(json);
        return {
            code: parsed.code || 'UNKNOWN',
            name: parsed.name || 'Error',
            message: parsed.message || 'Unknown error.',
            node: parsed.node || 'unknown',
        };
    } catch {
        return { code: 'UNKNOWN', name: 'Error', message: json.slice(0, 500), node: 'unknown' };
    }
}
