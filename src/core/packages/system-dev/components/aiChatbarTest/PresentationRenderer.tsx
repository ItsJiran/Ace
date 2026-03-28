import type { BaseBlock } from '#/schemas/parser';
import { getPresentationPayload } from '#/core/packages/system/parsers/PresentationBlock';

interface PresentationMemoryEnvelope {
    payload?: unknown;
    source?: Record<string, unknown>;
    [key: string]: unknown;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toComponentData(memoryData: unknown, inlineProps: Record<string, unknown>): Record<string, unknown> {
    if (!isObjectRecord(memoryData)) {
        return {
            value: memoryData,
            ...inlineProps,
        };
    }

    const envelope = memoryData as PresentationMemoryEnvelope;
    const hasEnvelopeShape = 'payload' in envelope || 'source' in envelope;

    if (!hasEnvelopeShape) {
        return {
            ...envelope,
            ...inlineProps,
        };
    }

    const rawData = envelope.payload;
    const normalizedData = isObjectRecord(rawData)
        ? rawData
        : rawData !== undefined
            ? { value: rawData }
            : {};

    return {
        ...normalizedData,
        __source: isObjectRecord(envelope.source) ? envelope.source : undefined,
        __envelope: envelope,
        ...inlineProps,
    };
}

export function PresentationRenderer({ block }: { block: BaseBlock }) {
    const payload = getPresentationPayload(block);
    const componentSlug = (payload?.component_slug || '').trim();
    const memoryTarget = typeof payload?.memory_uid === 'string' && payload.memory_uid.trim().length > 0
        ? payload.memory_uid.trim()
        : undefined;
    const inlineProps = payload?.props || {};
    let memoryData: unknown;

    if (!componentSlug) {
        return (
            <div className="text-xs text-red-400 border border-red-700 rounded p-2 bg-black/30">
                ✕ Invalid presentation block: missing component_slug
            </div>
        );
    }

    if (memoryTarget) {
        try {
            memoryData = window.ACE.memory?.read?.(memoryTarget);
        } catch (err) {
            console.warn(`Failed to load memory ${memoryTarget}:`, err);
        }
    }

    const envelopeSource = isObjectRecord(memoryData)
        && isObjectRecord((memoryData as PresentationMemoryEnvelope).source)
        ? (memoryData as PresentationMemoryEnvelope).source
        : undefined;
    const packageRef = (payload?.package_ref || '').trim()
        || (typeof envelopeSource?.package_ref === 'string' ? envelopeSource.package_ref : '')
        || 'itsjiran/ace-system';

    try {
        const registryEntry = window.ACE.registry?.resolveEntry?.(`${packageRef}:components:${componentSlug}`);
        if (!registryEntry) {
            return (
                <div className="text-xs text-zinc-500 border border-zinc-800 rounded p-2 bg-black/30">
                    ⚠ Component not found: {componentSlug}
                </div>
            );
        }

        const Component = registryEntry.component;
        if (!Component) {
            return (
                <div className="text-xs text-zinc-500 border border-zinc-800 rounded p-2 bg-black/30">
                    ⚠ Component {componentSlug} has no render function
                </div>
            );
        }

        const componentData: Record<string, unknown> = memoryData !== undefined
            ? {
                ...toComponentData(memoryData, inlineProps),
                __memory_target: memoryTarget,
            }
            : {
                ...inlineProps,
                __memory_target: memoryTarget,
            };

        return (
            <div className="my-2 rounded border border-zinc-700 bg-zinc-900/40 p-3 overflow-auto max-h-96">
                <Component {...componentData} />
            </div>
        );
    } catch (err) {
        console.error(`Presentation render error:`, err);
        return (
            <div className="text-xs text-red-400 border border-red-700 rounded p-2 bg-black/30">
                ✕ Error rendering {componentSlug}: {err instanceof Error ? err.message : String(err)}
            </div>
        );
    }
}
