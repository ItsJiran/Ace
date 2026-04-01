import { KernelEngine } from '#/services/kernelEngine';

export interface PipelineStep<TInput, TOutput> {
    name: string;
    execute: (input: TInput, context: PipelineContext) => Promise<TOutput>;
}

export interface PipelineContext {
    process_uid?: string; // Untuk melaporkan progress ke storageEngine (RAM)
    abortSignal?: AbortSignal; // Jika user menekan tombol "Cancel"
    /** When true, wraps the entire pipeline run in a ProcessEngine.track() record */
    tracked?: boolean;
    parent_process_uid?: string;
}

export class PipelineEngine<TInitial, TFinal> {
    static readonly registryMemoryUid = 'system:pipeline_registry';
    private steps: PipelineStep<any, any>[] = [];
    private readonly maxPipelineLogs = 120;
    public pipelineName: string;

    constructor(pipelineName: string) {
        this.pipelineName = pipelineName;
    }

    static setupKernelSpace() {
        KernelEngine.registerSystemMemory(PipelineEngine.registryMemoryUid, [] as any[]);
    }

    // Menambahkan langkah ke dalam rantai
    addStep<TNext>(step: PipelineStep<any, TNext>) {
        this.steps.push(step);
        return this;
    }

    // Mengeksekusi seluruh rantai secara berurutan
    async run(input: TInitial, context: PipelineContext): Promise<TFinal> {
        // Optional: wrap entire pipeline as a tracked ProcessEngine record
        if (context.tracked) {
            const parentProcessUid = context.parent_process_uid ?? context.process_uid;
            const proc = parentProcessUid
                ? KernelEngine.spawnSubprocess(parentProcessUid, `pipeline:${this.pipelineName}`, {
                    metadata: { pipeline_name: this.pipelineName },
                    process_kind: 'pipeline_run',
                    owner_engine: 'pipelineEngine',
                })
                : KernelEngine.spawnProcess(`pipeline:${this.pipelineName}`, { pipeline_name: this.pipelineName }, {
                    process_kind: 'pipeline_run',
                    owner_engine: 'pipelineEngine',
                });
            try {
                const result = await this._run(input, { ...context, process_uid: proc.process_uid, tracked: false });
                KernelEngine.updateProcessStatus(proc.process_uid, 'done');
                return result;
            } catch (err) {
                KernelEngine.updateProcessStatus(proc.process_uid, 'failed');
                throw err;
            }
        }
        return this._run(input, context);
    }

    private async _run(input: TInitial, context: PipelineContext): Promise<TFinal> {
        const runId = `pipe-${crypto.randomUUID()}`;
        this.upsertPipelineRecord({
            run_id: runId,
            pipeline_name: this.pipelineName,
            status: 'running',
            current_step: 'boot',
            started_at: Date.now(),
            updated_at: Date.now(),
            process_uid: context.process_uid ?? null,
            error: null,
        });

        let currentData: any = input;

        for (const step of this.steps) {
            // 1. Cek apakah proses dibatalkan oleh user
            if (context.abortSignal?.aborted) {
                this.upsertPipelineRecord({
                    run_id: runId,
                    pipeline_name: this.pipelineName,
                    status: 'aborted',
                    current_step: step.name,
                    started_at: Date.now(),
                    updated_at: Date.now(),
                    process_uid: context.process_uid ?? null,
                    error: 'aborted',
                });
                throw new Error(`Pipeline ${this.pipelineName} aborted at step: ${step.name}`);
            }

            // 2. Laporkan progress ke RAM (agar UI bisa tahu)
            if (context.process_uid) {
                KernelEngine.updateProcessPayload(context.process_uid, {
                    status: 'running',
                    current_step: step.name,
                    updated_at: Date.now(),
                });
            }

            this.upsertPipelineRecord({
                run_id: runId,
                pipeline_name: this.pipelineName,
                status: 'running',
                current_step: step.name,
                started_at: Date.now(),
                updated_at: Date.now(),
                process_uid: context.process_uid ?? null,
                error: null,
            });

            // 3. Eksekusi langkah ini dan jadikan input untuk langkah berikutnya
            try {
                currentData = await KernelEngine.withProcessContext(context.process_uid, async () => {
                    return step.execute(currentData, context);
                });
            } catch (error) {
                this.upsertPipelineRecord({
                    run_id: runId,
                    pipeline_name: this.pipelineName,
                    status: 'error',
                    current_step: step.name,
                    started_at: Date.now(),
                    updated_at: Date.now(),
                    process_uid: context.process_uid ?? null,
                    error: String(error),
                });
                throw new Error(`[${this.pipelineName}] Failed at '${step.name}': ${error}`);
            }
        }

        this.upsertPipelineRecord({
            run_id: runId,
            pipeline_name: this.pipelineName,
            status: 'completed',
            current_step: 'completed',
            started_at: Date.now(),
            updated_at: Date.now(),
            process_uid: context.process_uid ?? null,
            error: null,
        });

        if (context.process_uid) {
            KernelEngine.updateProcessPayload(context.process_uid, {
                status: 'done',
                current_step: 'completed',
                updated_at: Date.now(),
            });
        }

        return currentData as TFinal;
    }

    private upsertPipelineRecord(record: {
        run_id: string;
        pipeline_name: string;
        status: 'running' | 'completed' | 'error' | 'aborted';
        current_step: string;
        started_at: number;
        updated_at: number;
        process_uid: string | null;
        error: string | null;
    }) {
        let current = (KernelEngine.readMemory(PipelineEngine.registryMemoryUid) as any[] | undefined);
        if (!Array.isArray(current)) current = [];
        
        const existing = current.find((item) => item.run_id === record.run_id);

        let next: any[];
        if (existing) {
            next = current.map((item) =>
                item.run_id === record.run_id
                    ? {
                        ...item,
                        ...record,
                        updated_at: Date.now(),
                    }
                    : item
            );
        } else {
            next = [...current, record].slice(-this.maxPipelineLogs);
        }

        KernelEngine.updateMemory(PipelineEngine.registryMemoryUid, next);
    }
}
