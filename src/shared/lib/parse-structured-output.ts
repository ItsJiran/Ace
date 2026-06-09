/**
 * =============================================================================
 * parse-structured-output.ts  (shared)
 * =============================================================================
 *
 * Structured output pipeline for the ace_tag_* event system.
 *
 * Used by BACKGROUND (invoke-llm.ts) for final Zod validation after streaming.
 * Used by CLIENT (stream handlers) for extracting flat fields on message-finish.
 * =============================================================================
 */

import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ParseResult<T> {
    success: true;
    data: T;
}

export interface ParseError {
    success: false;
    error: string;
    rawText: string;
}

export interface PartialParseResult {
    closed: Record<string, string>;
    open: Record<string, string>;
    complete: boolean;
    cleanedText: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPLETE MODE — schema-aware (background)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parse raw LLM output that contains a FLAT XML document matching the schema.
 * No root wrapper — tags are top-level: <thought>...</thought><action_type>...</action_type>
 */
export function parseXmlOutput<T>(
    rawText: string,
    schema: z.ZodType<T>,
): ParseResult<T> | ParseError {
    // Strip markdown code fences
    let xml = rawText.trim();
    const fenceMatch = xml.match(/```(?:xml)?\s*\n?([\s\S]*?)```/i);
    if (fenceMatch) xml = fenceMatch[1].trim();

    const flatData = flatParseXml(xml);
    if (Object.keys(flatData).length === 0) {
        return {
            success: false,
            error: 'No elements found inside XML root',
            rawText: xml.slice(0, 500),
        };
    }

    const unflatData = unflatten(flatData);
    const coerced = coerceToSchema(unflatData, schema);
    if (!coerced) {
        return {
            success: false,
            error: 'Failed to coerce parsed values to schema types',
            rawText: xml.slice(0, 500),
        };
    }

    const parsed = schema.safeParse(coerced);
    if (!parsed.success) {
        return {
            success: false,
            error: `Schema validation failed: ${JSON.stringify(rawText)} \n ${JSON.stringify(parsed.error)}`,
            rawText: xml.slice(0, 500),
        };
    }

    return { success: true, data: parsed.data };
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARED — flat field extraction (no Zod)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract structured fields from raw XML output without Zod validation.
 */
export function extractStructuredFields(rawText: string): Record<string, string> | null {
    const xml = stripFences(rawText);
    const flat = flatParseXml(xml);
    if (Object.keys(flat).length === 0) return null;
    return flat;
}

// ═══════════════════════════════════════════════════════════════════════════
// PARTIAL / STREAMING MODE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Progressively parse a STREAMING XML buffer.
 * Call this on every chunk with the accumulated text.
 */
export function parseXmlOutputPartial(rawText: string): PartialParseResult {
    const text = stripFences(rawText);

    const closed: Record<string, string> = {};
    const closedRegex = /<([a-zA-Z_][\w.-]*)>([\s\S]*?)<\/\1>/g;
    let m: RegExpExecArray | null;
    while ((m = closedRegex.exec(text)) !== null) {
        const value = m[2].trim();
        if (!/<[a-zA-Z_]/.test(value)) {
            closed[m[1]] = value;
        } else {
            const nested = flatParseXml(value);
            for (const [nk, nv] of Object.entries(nested)) {
                closed[`${m[1]}.${nk}`] = nv;
            }
        }
    }

    const open: Record<string, string> = {};
    const openTagRegex = /<([a-zA-Z_][\w.-]*)>/g;
    let lastOpenTag: RegExpExecArray | null = null;
    while ((lastOpenTag = openTagRegex.exec(text)) !== null) {
        const tagName = lastOpenTag[1];
        const closeSearch = `</${tagName}>`;
        const restAfterTag = text.slice(lastOpenTag.index + lastOpenTag[0].length);
        if (restAfterTag.toLowerCase().indexOf(closeSearch.toLowerCase()) === -1) {
            const contentAfterTag = restAfterTag.trim();
            if (!closed[tagName]) {
                open[tagName] = contentAfterTag;
            }
        }
    }

    // Check if all tags are properly closed (no unclosed tags)
    const complete = Object.keys(open).length === 0 && Object.keys(closed).length > 0;
    return { closed, open, complete, cleanedText: text };
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/** Strip markdown code fences and trim. */
function stripFences(rawText: string): string {
    let text = rawText.trim();
    const fenceMatch = text.match(/```(?:xml)?\s*\n?([\s\S]*?)```/i);
    if (fenceMatch) text = fenceMatch[1].trim();
    return text;
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function flatParseXml(xml: string): Record<string, string> {
    const result: Record<string, string> = {};
    const regex = /<([a-zA-Z_][\w.-]*)>([\s\S]*?)<\/\1>/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(xml)) !== null) {
        const value = m[2].trim();
        if (/<[a-zA-Z_]/.test(value)) {
            const nested = flatParseXml(value);
            for (const [nk, nv] of Object.entries(nested)) {
                result[`${m[1]}.${nk}`] = nv;
            }
        } else {
            result[m[1]] = value;
        }
    }
    return result;
}

function unflatten(flat: Record<string, string>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(flat)) {
        const parts = key.split('.');
        if (parts.length === 1) {
            result[key] = value;
            continue;
        }
        let current = result;
        for (let i = 0; i < parts.length - 1; i++) {
            if (!current[parts[i]]) current[parts[i]] = {};
            current = current[parts[i]] as Record<string, unknown>;
        }
        current[parts[parts.length - 1]] = value;
    }
    return result;
}

function coerceToSchema(
    data: Record<string, unknown>,
    schema: z.ZodType<any>,
): Record<string, unknown> | null {
    try {
        const def = unwrapForParse(schema);
        if (def instanceof z.ZodObject) {
            const shape = (def as z.ZodObject<any>).shape;
            const result: Record<string, unknown> = {};
            for (const [key, fieldSchema] of Object.entries(shape)) {
                const raw = data[key];
                if (raw === undefined || raw === null) {
                    let fs = fieldSchema as z.ZodType<any>;
                    if (fs instanceof z.ZodDefault) {
                        result[key] = (fs as z.ZodDefault<any>)._def.defaultValue();
                        continue;
                    }
                    if (fs instanceof z.ZodOptional || fs instanceof z.ZodNullable) continue;
                    continue;
                }
                result[key] = coerceValue(raw, fieldSchema as z.ZodType<any>);
            }
            return result;
        }
        return data;
    } catch {
        return null;
    }
}

function coerceValue(raw: unknown, schema: z.ZodType<any>): unknown {
    const def = unwrapForParse(schema);
    const str = String(raw).trim();
    if (def instanceof z.ZodNumber) { const n = Number(str); return isNaN(n) ? raw : n; }
    if (def instanceof z.ZodBoolean) {
        if (str.toLowerCase() === 'true') return true;
        if (str.toLowerCase() === 'false') return false;
        return raw;
    }
    if (def instanceof z.ZodEnum) return str;
    return str;
}

function unwrapForParse(schema: z.ZodType<any>): z.ZodType<any> {
    let s: any = schema;
    for (let i = 0; i < 10; i++) {
        if (s instanceof z.ZodOptional || s instanceof z.ZodNullable) {
            s = (s as any).unwrap();
        } else if (s instanceof z.ZodDefault) {
            s = (s as any).unwrap();
        } else break;
    }
    return s;
}
