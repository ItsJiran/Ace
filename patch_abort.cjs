const fs = require('fs');
let file = 'src/services/kernelEngine/kernelProcessManager.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
`    private static _abortKernelProcess(process_uid: string, cascade: boolean): void {
        const entry = KernelState.proc_sys.get(process_uid);
        if (!entry) return;

        entry.abort_controller.abort();
        entry.lifecycle_status = 'terminated';
        entry.terminated_at = Date.now();

        if (cascade) {`,

`    private static _abortKernelProcess(process_uid: string, cascade: boolean): void {
        const entry = KernelState.proc_sys.get(process_uid);
        if (!entry) return;

        entry.abort_controller.abort();
        entry.lifecycle_status = 'terminated';
        entry.terminated_at = Date.now();
        
        // Clean up RAM owned by this process
        for (const memId of entry.memories_ids) {
            KernelState.kernel_memory.delete(memId);
        }

        if (cascade) {`
);

fs.writeFileSync(file, code);
