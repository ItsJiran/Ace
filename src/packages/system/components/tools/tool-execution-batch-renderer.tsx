import { Layers3, ListChecks, NotebookPen } from 'lucide-react';

import type {
    ExecutionBatchItemType,
    ExecutionBatchResultType,
    ExecutionBatchType,
} from '#/shared/schemas/ai';

import { MetaGrid, StructuredValueBlock, ToolSection } from './tool-renderer-shared';
import { asRecord, parseStructuredValue } from './tool-renderer.utils';
import type { ToolRendererProps } from './tool-renderer.utils';
import { ToolGenericRenderer } from './tool-generic-renderer';

function resolveExecutionBatch(value: unknown): ExecutionBatchType | null {
    const record = asRecord(parseStructuredValue(value));
    if (!record) {
        return null;
    }

    const batchRecord = asRecord(record.batch) ?? record;
    if (
        !batchRecord ||
        typeof batchRecord.batch_id !== 'string' ||
        typeof batchRecord.title !== 'string' ||
        typeof batchRecord.objective !== 'string'
    ) {
        return null;
    }

    return batchRecord as unknown as ExecutionBatchType;
}

function resolveExecutionBatchResult(value: unknown): ExecutionBatchResultType | null {
    const record = asRecord(parseStructuredValue(value));
    if (!record || typeof record.ok !== 'boolean') {
        return null;
    }

    return record as unknown as ExecutionBatchResultType;
}

function renderItems(items: ExecutionBatchItemType[]) {
    if (items.length === 0) {
        return null;
    }

    return (
        <div className="rounded-[18px] border border-white/10 bg-black/15 p-3">
            <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-zinc-500">
                <ListChecks size={13} />
                <span>Batch Items</span>
            </div>
            <div className="flex flex-col gap-2">
                {items.map((item, index) => (
                    <div key={`${item.item_id ?? item.title}-${index}`} className="rounded-2xl border border-white/10 bg-zinc-950/70 px-3 py-3">
                        <div className="mb-2 flex items-center justify-between gap-3 text-sm text-zinc-100">
                            <span>{item.title}</span>
                            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-zinc-400">
                                {item.status}
                            </span>
                        </div>
                        {item.instructions ? (
                            <div className="mb-2 whitespace-pre-wrap break-words text-xs text-zinc-400">{item.instructions}</div>
                        ) : null}
                        {item.notes.length > 0 ? <StructuredValueBlock value={item.notes} /> : null}
                    </div>
                ))}
            </div>
        </div>
    );
}

export function ToolExecutionBatchRenderer(props: ToolRendererProps) {
    const result = resolveExecutionBatchResult(props.content) ?? resolveExecutionBatchResult(props.artifact);
    const batch =
        resolveExecutionBatch(props.artifact) ??
        resolveExecutionBatch(props.content) ??
        resolveExecutionBatch(props.record);

    if (!batch && !result) {
        return <ToolGenericRenderer {...props} />;
    }

    const resolvedBatch = result?.batch ?? batch;
    const summary = result?.summary ?? resolvedBatch?.summary ?? null;

    return (
        <div className="flex flex-col gap-3">
            <MetaGrid
                items={[
                    { label: 'Batch', value: resolvedBatch?.title ?? null },
                    { label: 'Status', value: resolvedBatch?.status ?? null },
                    { label: 'Items', value: resolvedBatch ? String(resolvedBatch.items.length) : null },
                    { label: 'Result', value: result ? (result.ok ? 'success' : 'failed') : null },
                ]}
            />

            {resolvedBatch ? (
                <div className="rounded-[18px] border border-white/10 bg-black/15 p-3">
                    <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-zinc-500">
                        <Layers3 size={13} />
                        <span>Execution Batch</span>
                    </div>
                    <div className="mb-3 whitespace-pre-wrap break-words text-sm text-zinc-100">{resolvedBatch.objective}</div>
                    {renderItems(resolvedBatch.items)}
                </div>
            ) : null}

            {summary ? <ToolSection title="Execution Summary" icon={NotebookPen} value={summary} /> : null}
            <ToolSection title="Execution Payload" icon={NotebookPen} value={props.content} />
            <ToolSection title="Execution Artifact" icon={Layers3} value={props.artifact} />
        </div>
    );
}