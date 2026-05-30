import { AgentThreadToolMessage } from "#/shared/schemas/agent-thread-state";

export type ToolRendererProps = {
    name: string;
    content: unknown;
    record: AgentThreadToolMessage;
};

export function normalizename(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_');
}

export function parseStructuredValue(value: unknown): unknown {
    if (typeof value !== 'string') {
        return value;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return value;
    }

    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        return value;
    }

    try {
        return JSON.parse(trimmed);
    } catch {
        return value;
    }
}

export function stringifyValue(value: unknown) {
    if (typeof value === 'string') {
        return value;
    }

    if (value === undefined) {
        return 'undefined';
    }

    if (value === null) {
        return 'null';
    }

    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

export function isPrimitive(value: unknown) {
    return value == null || ['string', 'number', 'boolean', 'bigint'].includes(typeof value);
}

export function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    return value as Record<string, unknown>;
}

export function asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}
