import { useAceMemory } from '#/hooks/useAceMemory';

type PipelineRun = {
    run_id: string;
    pipeline_name: string;
    status: 'running' | 'completed' | 'error' | 'aborted';
    current_step: string;
    updated_at: number;
    process_uid: string | null;
    error: string | null;
};

export function PipelineRegistryList() {
    const runs = (useAceMemory<PipelineRun[]>('system:pipeline_registry') || []).slice().reverse();

    return (
        <div className="h-full w-full bg-zinc-950/90 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
            <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-900/90">
                <p className="text-xs font-semibold text-sky-300">Pipeline Registry List</p>
                <p className="text-[11px] text-zinc-500">Recent pipeline runs and current steps</p>
            </div>
            <div className="flex-1 overflow-auto p-2 space-y-2">
                {runs.length === 0 ? (
                    <p className="text-xs text-zinc-500">No pipeline runs yet.</p>
                ) : runs.map((run) => (
                    <div key={run.run_id} className="rounded border border-zinc-800 bg-zinc-900/60 p-2 text-[11px]">
                        <div className="text-zinc-300">{run.pipeline_name} <span className="text-zinc-500">({run.status})</span></div>
                        <div className="text-zinc-500">step: {run.current_step}</div>
                        <div className="text-zinc-500">pid: {run.process_uid ?? '-'}</div>
                        <div className="text-zinc-500">updated: {new Date(run.updated_at).toLocaleTimeString()}</div>
                        {run.error ? <div className="text-red-300 mt-1">{run.error}</div> : null}
                    </div>
                ))}
            </div>
        </div>
    );
}
