import { useState, useCallback, useMemo } from 'react';
import { z } from 'zod';
import type { AceRegistryType } from '#/schemas/registryTypes';
import type { ToolManifestEntry } from '#/services/toolEngine';

export const registry: AceRegistryType.Component = {
    name: 'tool_runner_dev',
    slug: 'tool-runner-dev',
    react_behavior: 'tool_runner_dev',
};

interface ToolResult {
    status: 'idle' | 'running' | 'ok' | 'error';
    output: string;
}

interface SchemaFieldInfo {
    path: string;
    type: string;
    required: boolean;
    description?: string;
    defaultValue?: unknown;
}

interface SchemaVariantInfo {
    key: string;
    label: string;
    fields: SchemaFieldInfo[];
}

interface ToolSchemaInfo {
    kind: string;
    fields: SchemaFieldInfo[];
    variants: SchemaVariantInfo[];
    examplePayload: Record<string, unknown>;
}

const schemaDefType = (schema: z.ZodTypeAny): string => ((schema as any)?._def?.type ?? 'unknown') as string;

const isType = (schema: z.ZodTypeAny, type: string): boolean => schemaDefType(schema) === type;

const toReadableType = (schema: z.ZodTypeAny): string => {
    const type = schemaDefType(schema);
    if (type === 'string') return 'string';
    if (type === 'number') return 'number';
    if (type === 'boolean') return 'boolean';
    if (type === 'date') return 'date';
    if (type === 'array') return `array<${toReadableType((schema as any)._def.element as z.ZodTypeAny)}>`;
    if (type === 'object') return 'object';
    if (type === 'record') return 'record';
    if (type === 'enum') return `enum(${((schema as any)._def.entries ? Object.keys((schema as any)._def.entries) : []).join(' | ')})`;
    if (type === 'literal') return `literal(${JSON.stringify((schema as any)._def.values?.[0] ?? null)})`;
    if (type === 'union') return `union(${((schema as any)._def.options ?? []).length})`;
    if (type === 'discriminatedUnion') {
        return `discriminated_union(${String((schema as any)._def.discriminator ?? 'kind')})`;
    }
    if (type === 'optional') return `${toReadableType((schema as any)._def.innerType as z.ZodTypeAny)}?`;
    if (type === 'nullable') return `${toReadableType((schema as any)._def.innerType as z.ZodTypeAny)} | null`;
    if (type === 'default') return toReadableType((schema as any)._def.innerType as z.ZodTypeAny);
    if (type === 'pipe') return toReadableType((schema as any)._def.out as z.ZodTypeAny);
    return 'unknown';
};

const unwrapSchema = (
    schema: z.ZodTypeAny,
): { inner: z.ZodTypeAny; optional: boolean; nullable: boolean; defaultValue?: unknown } => {
    let current = schema;
    let optional = false;
    let nullable = false;
    let defaultValue: unknown = undefined;

    while (true) {
        const type = schemaDefType(current);
        if (type === 'optional') {
            optional = true;
            current = (current as any)._def.innerType as z.ZodTypeAny;
            continue;
        }
        if (type === 'nullable') {
            nullable = true;
            current = (current as any)._def.innerType as z.ZodTypeAny;
            continue;
        }
        if (type === 'default') {
            optional = true;
            const def = (current as any)._def;
            defaultValue = typeof def.defaultValue === 'function' ? def.defaultValue() : def.defaultValue;
            current = def.innerType;
            continue;
        }
        if (type === 'pipe') {
            current = (current as any)._def.out as z.ZodTypeAny;
            continue;
        }
        break;
    }

    return { inner: current, optional, nullable, defaultValue };
};

const inferExampleValue = (schema: z.ZodTypeAny): unknown => {
    const { inner, defaultValue } = unwrapSchema(schema);
    if (defaultValue !== undefined) return defaultValue;
    const type = schemaDefType(inner);
    if (type === 'string') return '';
    if (type === 'number') return 0;
    if (type === 'boolean') return false;
    if (type === 'array') return [];
    if (type === 'object') return {};
    if (type === 'record') return {};
    if (type === 'enum') {
        const entries = Object.keys((inner as any)._def.entries ?? {});
        return entries[0] ?? '';
    }
    if (type === 'literal') return (inner as any)._def.values?.[0] ?? null;
    if (type === 'union') return inferExampleValue(((inner as any)._def.options?.[0] ?? inner) as z.ZodTypeAny);
    return null;
};

const collectFieldsFromObject = (
    schema: z.ZodTypeAny,
    prefix = '',
): { fields: SchemaFieldInfo[]; example: Record<string, unknown> } => {
    const shape = (schema as any).shape as Record<string, z.ZodTypeAny>;
    const fields: SchemaFieldInfo[] = [];
    const example: Record<string, unknown> = {};

    for (const [key, rawFieldSchema] of Object.entries(shape)) {
        const { inner, optional, nullable, defaultValue } = unwrapSchema(rawFieldSchema as z.ZodTypeAny);
        const path = prefix ? `${prefix}.${key}` : key;
        const type = nullable ? `${toReadableType(inner)} | null` : toReadableType(inner);
        const description = (rawFieldSchema as z.ZodTypeAny).description ?? inner.description;

        fields.push({
            path,
            type,
            required: !optional,
            description,
            defaultValue,
        });

        if (!optional || defaultValue !== undefined) {
            example[key] = defaultValue !== undefined ? defaultValue : inferExampleValue(rawFieldSchema as z.ZodTypeAny);
        }

        if (isType(inner, 'object')) {
            const nested = collectFieldsFromObject(inner, path);
            fields.push(...nested.fields);
        }
    }

    return { fields, example };
};

const extractToolSchemaInfo = (schema: z.ZodTypeAny | null): ToolSchemaInfo | null => {
    if (!schema) return null;

    const { inner } = unwrapSchema(schema);

    if (isType(inner, 'object')) {
        const objectData = collectFieldsFromObject(inner);
        return {
            kind: 'object',
            fields: objectData.fields,
            variants: [],
            examplePayload: objectData.example,
        };
    }

    if (isType(inner, 'discriminatedUnion')) {
        const def = (inner as any)._def;
        const discriminator = String(def.discriminator ?? 'action');
        const optionsMap = def.options as Map<string, z.ZodObject<any>>;
        const variants: SchemaVariantInfo[] = [];
        const firstKey = optionsMap.keys().next().value;
        let firstExample: Record<string, unknown> = {};

        for (const [key, variantSchema] of optionsMap.entries()) {
            const data = collectFieldsFromObject(variantSchema);
            variants.push({ key, label: `${discriminator}=${key}`, fields: data.fields });
            if (key === firstKey) {
                firstExample = { [discriminator]: key, ...data.example };
            }
        }

        return {
            kind: `discriminated_union:${discriminator}`,
            fields: [],
            variants,
            examplePayload: firstExample,
        };
    }

    if (isType(inner, 'union')) {
        const options = ((inner as any)._def.options ?? []) as z.ZodTypeAny[];
        const variants: SchemaVariantInfo[] = options.map((opt, index) => {
            const unwrapped = unwrapSchema(opt as z.ZodTypeAny).inner;
            if (isType(unwrapped, 'object')) {
                const data = collectFieldsFromObject(unwrapped);
                return { key: String(index), label: `variant_${index}`, fields: data.fields };
            }
            return {
                key: String(index),
                label: `variant_${index}`,
                fields: [{ path: '(root)', type: toReadableType(unwrapped), required: true }],
            };
        });

        return {
            kind: `union:${variants.length}`,
            fields: [],
            variants,
            examplePayload: {},
        };
    }

    return {
        kind: toReadableType(inner),
        fields: [{ path: '(root)', type: toReadableType(inner), required: true }],
        variants: [],
        examplePayload: {},
    };
};

export default function ToolRunnerDev() {
    const [tools, setTools] = useState<ToolManifestEntry[]>([]);
    const [loaded, setLoaded] = useState(false);

    const [selectedTool, setSelectedTool] = useState<ToolManifestEntry | null>(null);
    const [payloadText, setPayloadText] = useState('{}');
    const [result, setResult] = useState<ToolResult>({ status: 'idle', output: '' });

    const loadTools = useCallback(() => {
        const all = (window.ACE.tool as any).getAll() as ToolManifestEntry[];
        setTools(all);
        setLoaded(true);
        if (all.length > 0 && !selectedTool) {
            setSelectedTool(all[0]);
        }
    }, [selectedTool]);

    const selectedSchemaInfo = useMemo(() => {
        if (!selectedTool) return null;
        try {
            const reg = (window.ACE.tool as any).getRegistry({
                packageRef: selectedTool.packageRef,
                slug: selectedTool.slug,
            });
            const schema = reg?.entry?.implementation?.schema as z.ZodTypeAny | undefined;
            return extractToolSchemaInfo(schema ?? null);
        } catch {
            return null;
        }
    }, [selectedTool]);

    const onSelectTool = (toolKey: string) => {
        const t = tools.find(t => `${t.packageRef}:${t.slug}` === toolKey) ?? null;
        setSelectedTool(t);
        const example = t
            ? (() => {
                try {
                    const reg = (window.ACE.tool as any).getRegistry({ packageRef: t.packageRef, slug: t.slug });
                    const schema = reg?.entry?.implementation?.schema as z.ZodTypeAny | undefined;
                    return extractToolSchemaInfo(schema ?? null)?.examplePayload ?? {};
                } catch {
                    return {};
                }
            })()
            : {};
        setPayloadText(JSON.stringify(example, null, 2));
        setResult({ status: 'idle', output: '' });
    };

    const onRun = async () => {
        if (!selectedTool) return;
        let parsedPayload: unknown;
        try {
            parsedPayload = JSON.parse(payloadText);
        } catch {
            setResult({ status: 'error', output: 'Invalid JSON payload.' });
            return;
        }
        setResult({ status: 'running', output: '' });
        try {
            // Fire via EventBus so it goes through the standard execute_tool route
            window.ACE.event.emit({
                event_type: 'interaction',
                action: 'execute_tool',
                payload: {
                    package_ref: selectedTool.packageRef,
                    tool_slug: selectedTool.slug,
                    payload: parsedPayload,
                },
            });
            setResult({ status: 'ok', output: `Dispatched execute_tool → ${selectedTool.packageRef}/${selectedTool.slug}\nPayload: ${JSON.stringify(parsedPayload, null, 2)}` });
        } catch (err) {
            setResult({ status: 'error', output: String(err) });
        }
    };

    const onRunDirect = async () => {
        if (!selectedTool) return;
        let parsedPayload: unknown;
        try {
            parsedPayload = JSON.parse(payloadText);
        } catch {
            setResult({ status: 'error', output: 'Invalid JSON payload.' });
            return;
        }
        setResult({ status: 'running', output: 'Executing...' });
        try {
            const output = await (window.ACE.tool as any).execute(
                selectedTool.packageRef,
                selectedTool.slug,
                parsedPayload,
            );
            setResult({ status: 'ok', output: JSON.stringify(output, null, 2) });
        } catch (err) {
            setResult({ status: 'error', output: String(err) });
        }
    };

    const statusColor = {
        idle: 'text-zinc-400',
        running: 'text-yellow-400',
        ok: 'text-emerald-400',
        error: 'text-red-400',
    }[result.status];

    return (
        <div className="flex flex-col h-full bg-zinc-950 text-zinc-100 text-xs font-mono p-3 gap-3 overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-zinc-300 font-semibold text-sm">Tool Runner</span>
                <button
                    className="ml-auto px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                    onClick={loadTools}
                >
                    {loaded ? `Reload (${tools.length})` : 'Load Tools'}
                </button>
            </div>

            {!loaded && (
                <div className="text-zinc-500 text-center py-6">Click "Load Tools" to fetch registered tools from registry.</div>
            )}

            {loaded && tools.length === 0 && (
                <div className="text-zinc-500 text-center py-6">No tools registered yet.</div>
            )}

            {loaded && tools.length > 0 && (
                <>
                    {/* Tool list */}
                    <div className="flex flex-col gap-1 max-h-36 overflow-y-auto flex-shrink-0">
                        {tools.map(t => (
                            <button
                                key={`${t.packageRef}:${t.slug}`}
                                onClick={() => onSelectTool(`${t.packageRef}:${t.slug}`)}
                                className={`text-left px-2 py-1 rounded transition-colors ${
                                    selectedTool?.slug === t.slug && selectedTool.packageRef === t.packageRef
                                        ? 'bg-sky-900/50 text-sky-300 border border-sky-700'
                                        : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300'
                                }`}
                            >
                                <span className="text-zinc-500 mr-1">{t.packageRef}/</span>
                                <span className="font-semibold">{t.slug}</span>
                                {t.description && (
                                    <span className="ml-2 text-zinc-500 truncate">{t.description}</span>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Selected tool detail */}
                    {selectedTool && (
                        <div className="flex flex-col gap-2 flex-1 min-h-0">
                            <div className="text-zinc-400">
                                <span className="text-sky-400">{selectedTool.slug}</span>
                                {' — '}
                                <span>{selectedTool.description}</span>
                            </div>

                            <div className="bg-zinc-900 border border-zinc-800 rounded p-2 text-[11px] overflow-auto max-h-56">
                                <div className="text-zinc-300 font-semibold mb-1">Tool Schema Details</div>
                                <div className="text-zinc-500 mb-2">package: {selectedTool.packageRef} | schema: {selectedSchemaInfo?.kind ?? 'unknown'}</div>

                                {selectedSchemaInfo && selectedSchemaInfo.fields.length > 0 && (
                                    <div className="space-y-1 mb-2">
                                        {selectedSchemaInfo.fields.map((field) => (
                                            <div key={field.path} className="border border-zinc-800 rounded px-2 py-1 bg-zinc-950/60">
                                                <div className="text-zinc-200">
                                                    <span className="text-sky-400">{field.path}</span>
                                                    <span className="text-zinc-500"> : </span>
                                                    <span className="text-emerald-300">{field.type}</span>
                                                    <span className={`ml-2 ${field.required ? 'text-rose-300' : 'text-amber-300'}`}>
                                                        {field.required ? 'required' : 'optional'}
                                                    </span>
                                                </div>
                                                {field.description && <div className="text-zinc-500">desc: {field.description}</div>}
                                                {field.defaultValue !== undefined && (
                                                    <div className="text-zinc-500">default: {JSON.stringify(field.defaultValue)}</div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {selectedSchemaInfo && selectedSchemaInfo.variants.length > 0 && (
                                    <div className="space-y-2">
                                        {selectedSchemaInfo.variants.map((variant) => (
                                            <div key={variant.key} className="border border-zinc-800 rounded px-2 py-1 bg-zinc-950/40">
                                                <div className="text-violet-300 font-semibold">{variant.label}</div>
                                                <div className="space-y-1 mt-1">
                                                    {variant.fields.map((field) => (
                                                        <div key={`${variant.key}:${field.path}`} className="text-zinc-300">
                                                            <span className="text-sky-400">{field.path}</span>
                                                            <span className="text-zinc-500"> : </span>
                                                            <span className="text-emerald-300">{field.type}</span>
                                                            <span className={`ml-2 ${field.required ? 'text-rose-300' : 'text-amber-300'}`}>
                                                                {field.required ? 'required' : 'optional'}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {!selectedSchemaInfo && (
                                    <div className="text-zinc-500">Schema metadata unavailable for this tool.</div>
                                )}
                            </div>

                            {/* Payload editor */}
                            <label className="text-zinc-500">Payload (JSON)</label>
                            <textarea
                                className="flex-1 min-h-[80px] bg-zinc-900 border border-zinc-700 rounded p-2 font-mono text-xs text-zinc-100 resize-none focus:outline-none focus:border-sky-600"
                                value={payloadText}
                                onChange={e => setPayloadText(e.target.value)}
                                spellCheck={false}
                            />

                            {/* Actions */}
                            <div className="flex gap-2 flex-shrink-0">
                                <button
                                    onClick={onRun}
                                    disabled={result.status === 'running'}
                                    className="px-3 py-1 rounded bg-sky-800 hover:bg-sky-700 text-sky-100 disabled:opacity-50 transition-colors"
                                >
                                    Via EventBus
                                </button>
                                <button
                                    onClick={onRunDirect}
                                    disabled={result.status === 'running'}
                                    className="px-3 py-1 rounded bg-violet-800 hover:bg-violet-700 text-violet-100 disabled:opacity-50 transition-colors"
                                >
                                    Direct Execute
                                </button>
                                <span className={`ml-auto self-center font-semibold ${statusColor}`}>
                                    {result.status.toUpperCase()}
                                </span>
                            </div>

                            {/* Result */}
                            {result.output && (
                                <pre className="bg-zinc-900 border border-zinc-800 rounded p-2 text-xs overflow-auto max-h-40 text-zinc-200 flex-shrink-0">
                                    {result.output}
                                </pre>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
