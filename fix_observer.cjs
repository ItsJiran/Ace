const fs = require('fs');
const file = 'src/services/performanceObserver.ts';
let content = fs.readFileSync(file, 'utf8');

// Replace the export const line with a conditional export
const oldLine = 'export const PerformanceObserver = new PerformanceObserverSingleton();';
const newLine = `
// -----------------------------------------------------------------------------
// [FEATURE FLAG]: Production Dead-Code Elimination
// -----------------------------------------------------------------------------
// By checking import.meta.env.DEV here and optionally falling back to a dummy object,
// Vite/Rollup can completely tree-shake and strip this singleton from the production bundle
// because it recognizes no active execution path requires it.
export const PerformanceObserver = import.meta.env.DEV 
    ? new PerformanceObserverSingleton() 
    : {
        trackRamOp: () => {},
        trackWindowSpawn: () => {},
        trackIpcOp: () => {},
        metrics: { ramOps: 0, windowSpawns: 0, fpsAverage: 60, domNodes: 0, jsHeapMb: 0, ipcOps: 0, maxFrameTimeMs: 0, activeWindows: 0 }
    } as unknown as PerformanceObserverSingleton;
`;

content = content.replace(oldLine, newLine);
fs.writeFileSync(file, content);
fs.unlinkSync('fix_observer.js');
