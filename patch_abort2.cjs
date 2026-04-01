const fs = require('fs');
let file = 'src/services/kernelEngine/kernelProcessManager.ts';
let code = fs.readFileSync(file, 'utf8');

if (!code.includes("import { KernelMemoryManager }")) {
    code = code.replace("import { KernelState } from './kernelState';", "import { KernelState } from './kernelState';\nimport { KernelMemoryManager } from './kernelMemoryManager';");
}

code = code.replace(
`        // Clean up RAM owned by this process
        for (const memId of entry.memories_ids) {
            KernelState.kernel_memory.delete(memId);
        }`,
`        // Clean up RAM owned by this process
        for (const memId of entry.memories_ids) {
            KernelMemoryManager.deleteMemory(memId);
        }`
);

fs.writeFileSync(file, code);
