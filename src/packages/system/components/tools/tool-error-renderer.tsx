import { AlertTriangle, Braces, Hammer, Info } from 'lucide-react';

import { MetaGrid, ToolSection } from './tool-renderer-shared';
import { asRecord, parseStructuredValue, type ToolRendererProps } from './tool-renderer.utils';

function resolveErrorPayload(content: unknown, record: any) {
    const structuredContent = parseStructuredValue(content);
    const structuredRecord = parseStructuredValue(record);

    const contentRecord = asRecord(structuredContent);
    const recordRecord = asRecord(structuredRecord);

    return {
        message:
            (typeof contentRecord?.error === 'string' && contentRecord.error) ||
            (typeof contentRecord?.message === 'string' && contentRecord.message) ||
            (typeof recordRecord?.error === 'string' && recordRecord.error) ||
            (typeof recordRecord?.message === 'string' && recordRecord.message) ||
            (typeof content === 'string' ? content : ''),
        stderr: contentRecord?.stderr ?? recordRecord?.stderr ?? null,
        stdout: contentRecord?.stdout ?? recordRecord?.stdout ?? null,
        details: structuredContent,
    };
}

export function ToolErrorRenderer({ name, content, record }: ToolRendererProps) {
    const errorPayload = resolveErrorPayload(content, record);

    return (
        <div className="flex flex-col gap-3">
            <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-red-100">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-red-200/80">
                    <AlertTriangle size={14} />
                    Tool Error
                </div>
                <div className="mt-2 text-sm leading-6 text-red-50 whitespace-pre-wrap break-words">
                    {errorPayload.message || `${name} failed.`}
                </div>
            </div>

            <MetaGrid
                items={[
                    { label: 'Tool', value: name },
                    // {
                    //     label: 'Status',
                    //     value: typeof record.status === 'string' ? record.status : 'error',
                    // },
                    {
                        label: 'Call ID',
                        value: typeof record.tool_call_id === 'string' ? record.tool_call_id : null,
                    },
                ]}
            />

            <ToolSection title="stderr" icon={Info} value={errorPayload.stderr} />
            <ToolSection title="stdout" icon={Hammer} value={errorPayload.stdout} />
            <ToolSection title="Structured Detail" icon={Braces} value={errorPayload.details} />
        </div>
    );
}

export default ToolErrorRenderer;
