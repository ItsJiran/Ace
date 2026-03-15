import { Storage } from '#/services/storageEngine';

export interface PipelineStep<TInput, TOutput> {
    name: string;
    execute: (input: TInput, context: PipelineContext) => Promise<TOutput>;
}

export interface PipelineContext {
    process_uid?: string; // Untuk melaporkan progress ke storageEngine (RAM)
    abortSignal?: AbortSignal; // Jika user menekan tombol "Cancel"
}

export class PipelineEngine<TInitial, TFinal> {
    private steps: PipelineStep<any, any>[] = [];
    private readonly maxPipelineLogs = 120;

    constructor(public pipelineName: string) { }

    // Menambahkan langkah ke dalam rantai
    addStep<TNext>(step: PipelineStep<any, TNext>) {
        this.steps.push(step);
        return this;
    }

    // Mengeksekusi seluruh rantai secara berurutan
    async run(input: TInitial, context: PipelineContext): Promise<TFinal> {
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
                Storage.dispatchRAMAction({
                    action: 'update_memory',
                    memory_uid: context.process_uid,
                    payload: { current_step: step.name }
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
                currentData = await step.execute(currentData, context);
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
        const current = (Storage.readMemory('system:pipeline_registry') as any[] | undefined) || [];
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

        Storage.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: 'system:pipeline_registry',
            payload: next,
            classifications: ['system:core'],
        });
    }
}
