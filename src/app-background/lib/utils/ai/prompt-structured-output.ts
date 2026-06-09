/**
 * =============================================================================
 * prompt-structured-output.ts
 * =============================================================================
 *
 * STRUCTURED OUTPUT PIPELINE (XML-based)
 * =======================================
 *
 * [Zod Schema] ──→ prompt-structured-output.ts ──→ SystemMessage (XML template)
 *                        │
 *                        ▼
 *              [messages + XML prompt] ──→ invokeLLM() ──→ mainModel (plain)
 *                        │
 *                        ▼
 *              [Model responds with XML text]
 *                        │
 *                        ▼
 *              parse-structured-output.ts ←── flatParseXml()
 *                        │
 *                        ├── flatParseXml()    — regex parse <tag>value</tag>
 *                        ├── unflatten()       — dotted keys → nested object
 *                        ├── coerceToSchema()  — string → number/boolean/enum
 *                        └── Zod safeParse()   — final validation
 *                        │
 *                        ▼
 *                   { thought, action_type, action_reason }
 *
 * Note: XML is flat — no root <output> wrapper. Tags are top-level.
 * Example: <thought>...</thought><action_type>end</action_type><action_reason>...</action_reason>
 *
 * ADVANTAGES:
 * - No dependency on native .withStructuredOutput() / tool_calls
 * - Works with any model/provider that can generate text
 * - XML is universally supported by all LLMs
 * - Deterministic parsing (no hidden magic)
 *
 * RELATED FILES:
 * - parse-structured-output.ts  → XML parser → typed object
 * - invoke-llm.ts               → orchestrator linking prompt + parse
 * - prompt-structured-output.ts → (this file) XML template builder from Zod schema
 * =============================================================================
 */

import { SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Build a SystemMessage that instructs the model to output XML
 * conforming to the given Zod schema.
 *
 * @example
 *   const msg = buildXmlPromptMessage(ThoughtAction);
 *   // Appends instructions to output <output><thought>...</thought>...</output>
 */
export function buildXmlPromptMessage(schema: z.ZodType<any>): SystemMessage {
    const xmlTemplate = zodToXmlTemplate(schema);
    const fieldList = collectFields(schema);

    return new SystemMessage(
        [
            '## Output Format',
            '',
            'Your ENTIRE response must be ONLY the XML below — nothing else.',
            'Do NOT wrap it in markdown. Do NOT add any text before or after.',
            '',
            '### Example correct output:',
            xmlTemplate,
            '',
            '### Field Descriptions',
            ...fieldList.map(
                (f) => `- <${f.name}>: ${f.description}${f.allowed ? ` [one of: ${f.allowed}]` : ''}`,
            ),
            '',
            '### Rules',
            '- Start your response with `<` (the first XML tag).',
            '- End your response with `>` (the last XML closing tag).',
            '- Every element MUST appear exactly once.',
            '- No markdown fences (no ```). No extra text.',
            '- No XML attributes. Use plain element content only.',
            '- No extra elements beyond what is listed.',
        ].join('\n'),
    );
}

// ── Schema → XML ───────────────────────────────────────────────────────────

interface FieldMeta {
    name: string;
    description: string;
    allowed?: string;
}

function collectFields(schema: z.ZodType<any>, prefix = ''): FieldMeta[] {
    let def: z.ZodType<any> = unwrap(schema);

    if (def instanceof z.ZodObject) {
        const shape = (def as z.ZodObject<any>).shape;
        const result: FieldMeta[] = [];
        for (const [key, value] of Object.entries(shape)) {
            const fullKey = prefix ? `${prefix}.${key}` : key;
            result.push(...collectFields(value as z.ZodType<any>, fullKey));
        }
        return result;
    }

    if (def instanceof z.ZodString || def instanceof z.ZodNumber || def instanceof z.ZodBoolean) {
        return [{ name: prefix, description: def.description ?? 'No description' }];
    }

    if (def instanceof z.ZodEnum) {
        const options = (def as z.ZodEnum<any>).options as string[];
        return [{ name: prefix, description: def.description ?? 'No description', allowed: options.join(' | ') }];
    }

    return [];
}

function zodToXmlTemplate(schema: z.ZodType<any>, rootName = 'output', indent = 0): string {
    let def: z.ZodType<any> = unwrap(schema);

    const pad = '  '.repeat(indent);

    if (def instanceof z.ZodObject) {
        const shape = (def as z.ZodObject<any>).shape;
        const children = Object.entries(shape)
            .map(([key, value]) => zodToXmlTemplate(value as z.ZodType<any>, key, indent + 1))
            .join('\n');
        return indent === 0
            ? children
            : `${pad}<${rootName}>\n${children}\n${pad}</${rootName}>`;
    }

    if (def instanceof z.ZodString) {
        return `${pad}<${rootName}>${def.description ? exampleFromDesc(def.description) : 'string value'}</${rootName}>`;
    }

    if (def instanceof z.ZodNumber) {
        return `${pad}<${rootName}>42</${rootName}>`;
    }

    if (def instanceof z.ZodBoolean) {
        return `${pad}<${rootName}>true</${rootName}>`;
    }

    if (def instanceof z.ZodEnum) {
        const options = (def as z.ZodEnum<any>).options as string[];
        return `${pad}<${rootName}>${options[0] || 'value'}</${rootName}>`;
    }

    // Fallback
    return `${pad}<${rootName}>...</${rootName}>`;
}

/**
 * Safely unwrap wrapper types to reach the core schema.
 * In Zod v4: ZodOptional, ZodNullable, ZodDefault have .unwrap().
 * ZodTransform, ZodPipe use different internals — skip them.
 * Branded types aren't wrapped (still instanceof original type).
 */
function unwrap(schema: z.ZodType<any>): z.ZodType<any> {
    let s: any = schema;
    // Handle up to 10 levels of wrapping to avoid infinite loops
    for (let i = 0; i < 10; i++) {
        if (s instanceof z.ZodOptional || s instanceof z.ZodNullable) {
            s = (s as any).unwrap();
        } else if (s instanceof z.ZodDefault) {
            s = (s as any).unwrap();
        } else {
            break;
        }
    }
    return s;
}

/** Extract a short example value from a Zod description. */
function exampleFromDesc(desc: string): string {
    // Look for "Example:" or "e.g." in description
    const m = desc.match(/(?:e\.g\.|Example:|example:)\s*"?([^".]+)"?/i);
    return m ? m[1].trim() : 'string value';
}
