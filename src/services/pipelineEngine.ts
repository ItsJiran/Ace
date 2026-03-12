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

    constructor(public pipelineName: string) { }

    // Menambahkan langkah ke dalam rantai
    addStep<TNext>(step: PipelineStep<any, TNext>) {
        this.steps.push(step);
        return this;
    }

    // Mengeksekusi seluruh rantai secara berurutan
    async run(input: TInitial, context: PipelineContext): Promise<TFinal> {
        let currentData: any = input;

        for (const step of this.steps) {
            // 1. Cek apakah proses dibatalkan oleh user
            if (context.abortSignal?.aborted) {
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

            // 3. Eksekusi langkah ini dan jadikan input untuk langkah berikutnya
            try {
                currentData = await step.execute(currentData, context);
            } catch (error) {
                throw new Error(`[${this.pipelineName}] Failed at '${step.name}': ${error}`);
            }
        }

        return currentData as TFinal;
    }
}
